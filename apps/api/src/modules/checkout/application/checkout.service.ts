import { Inject, Injectable } from '@nestjs/common';
import {
  ENVIRONMENT_CONFIGURATION,
  type EnvironmentConfiguration,
} from '../../../platform/config/environment';
import { CART_READER, type CartReader, type CartSnapshotLine } from '../../cart';
import {
  INVENTORY_AVAILABILITY,
  type AvailabilityTarget,
  type InventoryAvailability,
} from '../../inventory';
import { TAX_ASSESSOR, type TaxAssessor } from '../../tax';
import {
  DEFAULT_TAX_CLASSIFICATION,
  environmentScopeFor,
  type EnvironmentScopeValue,
} from '../../tax';
import {
  MAX_CHECKOUT_LINE_QUANTITY,
  quoteFingerprint,
  SETTLEMENT_CURRENCY,
} from '../api/checkout.support';
import {
  type CheckoutBlocker,
  type CheckoutLineTargetKind,
  type CheckoutQuote,
  type CheckoutQuoteLine,
  type CheckoutQuoteRequest,
  type CheckoutQuoter,
} from '../contracts';
import { CheckoutDestinationRepository } from '../persistence/checkout-destination.repository';

/**
 * The checkout calculation.
 *
 * The service prices a customer's cart for one destination. It never trusts a client-supplied price
 * or total: every amount in the quote is computed here from the cart's own contents and the
 * server's own configuration.
 *
 * The service is the Checkout capability's published quote contract, so the Orders capability can
 * re-derive the same figures before it creates an order.
 */
@Injectable()
export class CheckoutService implements CheckoutQuoter {
  public constructor(
    @Inject(CART_READER) private readonly cart: CartReader,
    @Inject(INVENTORY_AVAILABILITY) private readonly inventory: InventoryAvailability,
    @Inject(TAX_ASSESSOR) private readonly taxes: TaxAssessor,
    private readonly destinations: CheckoutDestinationRepository,
    @Inject(ENVIRONMENT_CONFIGURATION)
    private readonly configuration: EnvironmentConfiguration,
  ) {}

  /** The environment whose configuration applies to this request. */
  public get environment(): EnvironmentScopeValue {
    return environmentScopeFor(this.configuration.nodeEnv);
  }

  /**
   * Prices the customer's cart for one destination.
   *
   * The quote reports every reason it is not ready at once, so a customer sees all of them rather
   * than one per attempt.
   */
  public async quote(request: CheckoutQuoteRequest): Promise<CheckoutQuote> {
    const blockers: CheckoutBlocker[] = [];
    const destination = await this.destinations.find(
      request.destinationCountryCode,
      this.environment,
    );

    if (destination === null || !destination.enabled) {
      blockers.push({ code: 'DESTINATION_NOT_SUPPORTED' });
    } else if (!destination.shippingApproved) {
      blockers.push({ code: 'SHIPPING_NOT_APPROVED' });
    }

    const snapshot =
      request.intent === undefined
        ? await this.cart.readForCustomer(request.customerId)
        : await this.cart.readIntent(request.intent);
    if (snapshot.lines.length === 0) {
      blockers.push({ code: 'CART_EMPTY' });
    }

    const lines = this.priceLines(snapshot.lines, blockers);
    await this.readAvailability(lines, blockers);

    const assessment = await this.taxes.assess({
      environment: this.environment,
      jurisdiction: destination?.taxJurisdiction ?? request.destinationCountryCode,
      lines: lines.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        grossMinor: line.grossMinor,
      })),
    });

    if (assessment.unclassifiedClassifications.length > 0) {
      blockers.push({ code: 'TAX_RULE_MISSING' });
    }
    if (assessment.mixedPricingModes) {
      // Some prices include their tax and some do not, so a single subtotal would be ambiguous.
      blockers.push({ code: 'TAX_PRICING_MODE_MIXED' });
    }

    const assessed = new Map(assessment.lines.map((line) => [line.lineId, line]));
    const quoteLines: CheckoutQuoteLine[] = lines.map((line) => {
      const tax = assessed.get(line.lineId);
      return {
        lineId: line.lineId,
        targetKind: line.targetKind,
        variantId: line.variantId,
        bundleId: line.bundleId,
        sku: line.sku,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        unitCurrency: line.unitCurrency,
        discountBasisPoints: line.discountBasisPoints,
        priceChanged: line.priceChanged,
        taxClassification: tax?.classification ?? DEFAULT_TAX_CLASSIFICATION,
        taxRuleId: tax?.ruleId ?? null,
        taxRateBasisPoints: tax?.rateBasisPoints ?? 0,
        taxInclusive: tax?.taxInclusive ?? false,
        netMinor: tax?.netMinor ?? line.grossMinor,
        taxMinor: tax?.taxMinor ?? 0,
        totalMinor: tax === undefined ? line.grossMinor : tax.totalMinor,
      };
    });

    const netSubtotalMinor = quoteLines.reduce((total, line) => total + line.netMinor, 0);
    const taxTotalMinor = quoteLines.reduce((total, line) => total + line.taxMinor, 0);
    const totalMinor = quoteLines.reduce((total, line) => total + line.totalMinor, 0);
    // Orders and payment amounts are PostgreSQL Int columns. Reject before any hold or write.
    if (
      !Number.isSafeInteger(totalMinor) ||
      totalMinor > 2_147_483_647 ||
      quoteLines.some(
        (line) =>
          line.netMinor > 2_147_483_647 ||
          line.taxMinor > 2_147_483_647 ||
          line.totalMinor > 2_147_483_647,
      )
    ) {
      blockers.push({ code: 'AMOUNT_UNSUPPORTED' });
    }
    const fingerprint = quoteFingerprint({
      destinationCountryCode: request.destinationCountryCode,
      currency: SETTLEMENT_CURRENCY,
      lines: quoteLines.map((line) => ({
        lineId: line.lineId,
        variantId: line.variantId,
        bundleId: line.bundleId,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        netMinor: line.netMinor,
        taxMinor: line.taxMinor,
        totalMinor: line.totalMinor,
      })),
      netSubtotalMinor,
      taxTotalMinor,
      totalMinor,
    });

    return {
      currency: SETTLEMENT_CURRENCY,
      destinationCountryCode: request.destinationCountryCode,
      taxJurisdiction: destination?.taxJurisdiction ?? request.destinationCountryCode,
      ready: blockers.length === 0,
      blockers,
      lines: quoteLines,
      netSubtotalMinor,
      taxTotalMinor,
      totalMinor,
      roundingRule: assessment.roundingRule,
      fingerprint,
    };
  }

  /** Every destination of this environment, as the administrative surface presents them. */
  public async listDestinations(): Promise<
    readonly {
      readonly countryCode: string;
      readonly enabled: boolean;
      readonly taxJurisdiction: string;
      readonly shippingApproved: boolean;
      readonly label: string;
    }[]
  > {
    return (await this.destinations.list(this.environment)).map((destination) => ({
      countryCode: destination.countryCode,
      enabled: destination.enabled,
      taxJurisdiction: destination.taxJurisdiction,
      shippingApproved: destination.shippingApproved,
      label: destination.label,
    }));
  }

  /** Creates or replaces a destination of this environment. */
  public async configureDestination(input: {
    readonly countryCode: string;
    readonly enabled: boolean;
    readonly taxJurisdiction: string;
    readonly shippingApproved: boolean;
    readonly label: string;
    readonly updatedByUserId: string | null;
  }): Promise<{
    readonly countryCode: string;
    readonly enabled: boolean;
    readonly taxJurisdiction: string;
    readonly shippingApproved: boolean;
    readonly label: string;
  }> {
    const record = await this.destinations.upsert(input.countryCode, {
      environment: this.environment,
      enabled: input.enabled,
      taxJurisdiction: input.taxJurisdiction,
      shippingApproved: input.shippingApproved,
      label: input.label,
      updatedByUserId: input.updatedByUserId,
    });
    return {
      countryCode: record.countryCode,
      enabled: record.enabled,
      taxJurisdiction: record.taxJurisdiction,
      shippingApproved: record.shippingApproved,
      label: record.label,
    };
  }

  /**
   * Prices each cart line and collects the reasons a line cannot be bought.
   *
   * The current effective price is used, never the last-known price, and a line whose currency is
   * not the settlement currency is refused rather than converted, because no conversion is
   * implemented.
   */
  private priceLines(
    cartLines: readonly CartSnapshotLine[],
    blockers: CheckoutBlocker[],
  ): readonly {
    lineId: string;
    targetKind: CheckoutLineTargetKind;
    variantId: string | null;
    bundleId: string | null;
    sku: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPriceMinor: number;
    unitCurrency: string;
    discountBasisPoints: number;
    priceChanged: boolean;
    grossMinor: number;
  }[] {
    return cartLines.map((line) => {
      if (!line.purchasable) {
        blockers.push({ code: 'PRODUCT_UNAVAILABLE', lineId: line.lineId, sku: line.sku });
      }
      if (line.quantity < 1 || line.quantity > MAX_CHECKOUT_LINE_QUANTITY) {
        blockers.push({ code: 'QUANTITY_UNSUPPORTED', lineId: line.lineId, sku: line.sku });
      }
      if (line.currentUnitCurrency !== SETTLEMENT_CURRENCY) {
        blockers.push({ code: 'CURRENCY_NOT_SETTLED', lineId: line.lineId, sku: line.sku });
      }
      return {
        lineId: line.lineId,
        targetKind: line.targetKind,
        variantId: line.variantId,
        bundleId: line.bundleId,
        sku: line.sku,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPriceMinor: line.currentUnitPriceMinor,
        unitCurrency: line.currentUnitCurrency,
        discountBasisPoints: line.discountBasisPoints,
        priceChanged:
          line.lastKnownUnitPriceMinor !== line.currentUnitPriceMinor ||
          line.lastKnownUnitCurrency !== line.currentUnitCurrency,
        grossMinor: line.currentUnitPriceMinor * line.quantity,
      };
    });
  }

  /**
   * Reads the availability of every line and collects the lines that exceed it.
   *
   * A line whose stock is short blocks the quote, because a customer must not be told a total for
   * something the warehouse cannot fulfil.
   */
  private async readAvailability(
    lines: readonly {
      lineId: string;
      targetKind: CheckoutLineTargetKind;
      variantId: string | null;
      bundleId: string | null;
      sku: string;
      quantity: number;
    }[],
    blockers: CheckoutBlocker[],
  ): Promise<void> {
    const targets: AvailabilityTarget[] = lines.map((line) =>
      line.targetKind === 'BUNDLE' && line.bundleId !== null
        ? { kind: 'BUNDLE', bundleId: line.bundleId }
        : { kind: 'VARIANT', variantId: line.variantId ?? '' },
    );
    const readings = await this.inventory.readAvailability(targets);
    const combinedAvailable = await this.inventory.canReserve(
      lines.map((line) =>
        line.bundleId !== null
          ? { kind: 'BUNDLE' as const, bundleId: line.bundleId, quantity: line.quantity }
          : { kind: 'VARIANT' as const, sku: line.sku, quantity: line.quantity },
      ),
    );
    if (
      !combinedAvailable &&
      readings.every((reading, index) => reading.available >= (lines[index]?.quantity ?? 0))
    ) {
      blockers.push({ code: 'INSUFFICIENT_STOCK' });
    }
    readings.forEach((reading, index) => {
      const line = lines[index];
      if (line === undefined) return;
      if (reading.available < line.quantity) {
        blockers.push({ code: 'INSUFFICIENT_STOCK', lineId: line.lineId, sku: line.sku });
      }
    });
  }
}
