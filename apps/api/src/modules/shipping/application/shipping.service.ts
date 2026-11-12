import { NOTIFICATION_SENDER, type NotificationSender } from '../../notification';
import { DatabaseService } from '../../../platform/database/database.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import {
  ENVIRONMENT_CONFIGURATION,
  environmentScopeFor,
  SETTLEMENT_CURRENCY,
  type EnvironmentConfiguration,
  type EnvironmentScopeValue,
} from '../../../platform/config/environment';
import { INVENTORY_RESTOCK, type InventoryRestock, type RestockLine } from '../../inventory';
import { ORDER_LEDGER, type OrderLedger, type OrderSnapshot } from '../../order';
import { PAYMENT_REFUNDS, type PaymentRefunds } from '../../payments';
import {
  type ReturnRecord,
  type ShipmentRecord,
  type ShipmentStatusValue,
  type ShippingFulfillment,
  type ShippingOption,
} from '../contracts';
import {
  ShippingRepository,
  type ReturnEventAttributes,
  type ShipmentEventAttributes,
} from '../persistence/shipping.repository';
import { returnTransitionPermitted, shipmentTransitionPermitted } from './shipping-transitions';

/** The states an order may hold before a shipment may be created for it. */
const FULFILLABLE_ORDER_STATUSES: readonly string[] = ['PAID', 'FULFILLED'];

/** The states an order may hold before a return may be requested against it. */
const RETURNABLE_ORDER_STATUSES: readonly string[] = ['PAID', 'FULFILLED'];

/**
 * The Shipping and Fulfillment capability.
 *
 * The service owns the rules; the repository owns the atomicity. Every other capability is reached
 * through a published contract: the order is read through the Orders capability's ledger, the
 * returned goods go back into stock through the Inventory capability's restock contract, and the
 * money is returned through the Payments capability's refund contract.
 *
 * **The service never invents a commercial fact.** A shipping method's amount is a configured
 * value, a tracking reference is an administrator's own text, and a destination is an
 * administrator's own approval. There is no rate calculation, no carrier, and no delivery estimate,
 * because HC-DEC-013 leaves them open.
 */
@Injectable()
export class ShippingService implements ShippingFulfillment {
  public constructor(
    private readonly shipping: ShippingRepository,
    private readonly database: DatabaseService,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(ORDER_LEDGER) private readonly orders: OrderLedger,
    @Inject(INVENTORY_RESTOCK) private readonly inventory: InventoryRestock,
    @Inject(PAYMENT_REFUNDS) private readonly payments: PaymentRefunds,
    @Inject(ENVIRONMENT_CONFIGURATION)
    private readonly configuration: EnvironmentConfiguration,
  ) {}

  /** The environment whose configuration applies to this request. */
  public get environment(): EnvironmentScopeValue {
    return environmentScopeFor(this.configuration.nodeEnv);
  }

  // -------------------------------------------------------------------------------------------
  // The shipping configuration.
  // -------------------------------------------------------------------------------------------

  /** Every shipping destination of this environment. */
  public async listDestinations() {
    return this.shipping.listDestinations(this.environment);
  }

  /** Creates or replaces a shipping destination of this environment. */
  public async configureDestination(input: {
    readonly countryCode: string;
    readonly enabled: boolean;
    readonly label: string;
    readonly carrierCode: string | null;
    readonly updatedByUserId: string | null;
  }) {
    if (this.environment === 'PRODUCTION')
      throw new ServiceUnavailableException('Shipping activation is not approved');
    if (input.label.trim().length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'label', message: 'Invalid value' }],
      });
    }
    return this.shipping.upsertDestination({
      countryCode: input.countryCode,
      environment: this.environment,
      enabled: input.enabled,
      label: input.label.trim(),
      carrierCode: input.carrierCode,
      updatedByUserId: input.updatedByUserId,
    });
  }

  /** Every shipping method of this environment. */
  public async listMethods() {
    return this.shipping.listMethods(this.environment);
  }

  /** Creates or replaces a shipping method of this environment. */
  public async configureMethod(input: {
    readonly code: string;
    readonly label: string;
    readonly destinationCountryCode: string | null;
    readonly amountMinor: number;
    readonly currency: string;
    readonly active: boolean;
    readonly updatedByUserId: string | null;
  }) {
    if (this.environment === 'PRODUCTION')
      throw new ServiceUnavailableException('Shipping activation is not approved');
    if (input.label.trim().length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'label', message: 'Invalid value' }],
      });
    }
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'amountMinor', message: 'Invalid value' }],
      });
    }
    if (input.amountMinor > 2_147_483_647) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'amountMinor', message: 'Invalid value' }],
      });
    }
    if (input.currency !== SETTLEMENT_CURRENCY) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'currency', message: 'Invalid value' }],
      });
    }
    return this.shipping.upsertMethod({
      code: input.code.trim().toUpperCase(),
      environment: this.environment,
      label: input.label.trim(),
      destinationCountryCode: input.destinationCountryCode,
      amountMinor: input.amountMinor,
      currency: input.currency,
      active: input.active,
      updatedByUserId: input.updatedByUserId,
    });
  }

  /**
   * The configured shipping options of a destination.
   *
   * A destination with no approved row has **no** options: the platform says so rather than
   * inventing one, and it never computes a rate.
   */
  public async optionsFor(destinationCountryCode: string): Promise<readonly ShippingOption[]> {
    if (this.environment === 'PRODUCTION') return [];
    const destination = await this.shipping.findDestination(
      destinationCountryCode,
      this.environment,
    );
    if (destination === null || !destination.enabled) return [];
    const methods = await this.shipping.listMethods(this.environment);
    return methods
      .filter(
        (method) =>
          method.active &&
          (method.destinationCountryCode === null ||
            method.destinationCountryCode === destinationCountryCode),
      )
      .map((method) => ({
        code: method.code,
        label: method.label,
        amountMinor: method.amountMinor,
        currency: method.currency,
        destinationCountryCode: method.destinationCountryCode,
      }));
  }

  // -------------------------------------------------------------------------------------------
  // The shipments.
  // -------------------------------------------------------------------------------------------

  /** Creates the shipment that fulfils an order. */
  public async createShipment(input: {
    readonly orderId: string;
    readonly methodCode: string;
    readonly actorUserId: string | null;
  }): Promise<ShipmentRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`order:${input.orderId}`);
      const order = await this.orders.findOrderById(input.orderId);
      if (order === null) throw AppError.orderNotFound();
      if (!FULFILLABLE_ORDER_STATUSES.includes(order.status)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ path: 'orderId', message: 'The order is not paid' }],
        });
      }
      if ((await this.shipping.findShipmentByOrder(order.id)) !== null) {
        throw AppError.shipmentAlreadyExists();
      }

      const destination = await this.shipping.findDestination(
        order.destinationCountryCode,
        this.environment,
      );
      if (destination === null || !destination.enabled) {
        throw AppError.shippingDestinationNotFound();
      }

      const method = await this.shipping.findMethod(input.methodCode, this.environment);
      if (method === null || !method.active) throw AppError.shippingMethodNotFound();
      if (
        method.destinationCountryCode !== null &&
        method.destinationCountryCode !== order.destinationCountryCode
      ) {
        throw AppError.shippingMethodNotFound();
      }

      const event: ShipmentEventAttributes = {
        eventType: 'SHIPMENT_CREATED',
        previousStatus: null,
        nextStatus: 'PREPARED',
        actor: 'ADMIN',
        actorUserId: input.actorUserId,
        reason: null,
        detail: {
          orderId: order.id,
          methodCode: method.code,
          amountMinor: method.amountMinor,
          currency: method.currency,
        },
      };

      try {
        return await this.shipping.createShipment({
          orderId: order.id,
          customerId: order.customerId,
          destinationCountryCode: order.destinationCountryCode,
          destinationLabel: destination.label,
          methodCode: method.code,
          methodLabel: method.label,
          amountMinor: method.amountMinor,
          currency: method.currency,
          carrierCode: destination.carrierCode,
          lines: order.lines.map((line) => ({
            orderLineId: line.id,
            quantity: line.quantity,
          })),
          event,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw AppError.shipmentAlreadyExists();
        throw error;
      }
    });
  }

  /** One shipment by its identifier. */
  public async shipmentOf(shipmentId: string): Promise<ShipmentRecord | null> {
    return this.shipping.findShipmentById(shipmentId);
  }

  /** The shipment that fulfils an order, when one exists. */
  public async findShipmentForOrder(orderId: string): Promise<ShipmentRecord | null> {
    return this.shipping.findShipmentByOrder(orderId);
  }

  /** The shipments of one customer, newest first. */
  public async listShipmentsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly ShipmentRecord[]> {
    return this.shipping.listShipmentsForCustomer(customerId, limit);
  }

  /** Every shipment, newest first. */
  public async listShipments(limit: number): Promise<readonly ShipmentRecord[]> {
    return this.shipping.listShipments(limit);
  }

  /** Every shipment, newest first, for the administrative surface. */
  public async listAll(limit: number): Promise<readonly ShipmentRecord[]> {
    return this.shipping.listShipments(limit);
  }

  /** The shipments of one customer, newest first, for the administrative surface. */
  public async listForCustomerOf(
    customerId: string,
    limit: number,
  ): Promise<readonly ShipmentRecord[]> {
    return this.shipping.listShipmentsForCustomer(customerId, limit);
  }

  /** Every return, newest first, for the administrative surface. */
  public async listAllReturns(limit: number): Promise<readonly ReturnRecord[]> {
    return this.shipping.listReturns(limit);
  }

  /** The returns of one customer, newest first, for the administrative surface. */
  public async listReturnsForCustomerOf(
    customerId: string,
    limit: number,
  ): Promise<readonly ReturnRecord[]> {
    return this.shipping.listReturnsForCustomer(customerId, limit);
  }

  /** The recorded transitions of a shipment. */
  public async shipmentEvents(shipmentId: string) {
    return this.shipping.listShipmentEvents(shipmentId);
  }

  /**
   * Moves a shipment to the next state of its lifecycle.
   *
   * A transition that is not permitted is refused and **recorded**, while the shipment's own state
   * is left unchanged, so an operator can see what was attempted.
   */
  public async transitionShipment(input: {
    readonly shipmentId: string;
    readonly to: ShipmentStatusValue;
    readonly actorUserId: string | null;
    readonly reason: string | null;
  }): Promise<ShipmentRecord> {
    const shipment = await this.shipping.findShipmentById(input.shipmentId);
    if (shipment === null) throw AppError.shipmentNotFound();
    if (!shipmentTransitionPermitted(shipment.status, input.to)) {
      await this.shipping.recordShipmentEvent(input.shipmentId, {
        eventType: 'SHIPMENT_TRANSITION_REFUSED',
        previousStatus: shipment.status,
        nextStatus: input.to,
        actor: 'ADMIN',
        actorUserId: input.actorUserId,
        reason: 'TRANSITION_NOT_PERMITTED',
      });
      throw AppError.shipmentNotTransitionable();
    }

    const now = new Date();
    const event: ShipmentEventAttributes = {
      eventType: `SHIPMENT_${input.to}`,
      previousStatus: shipment.status,
      nextStatus: input.to,
      actor: 'ADMIN',
      actorUserId: input.actorUserId,
      reason: input.reason,
    };
    const changed = await this.database.transaction(async () => {
      const result = await this.shipping.transitionShipment(
        input.shipmentId,
        shipment.status,
        input.to,
        event,
        {
          statusReason: input.reason,
          ...(input.to === 'HANDED_OVER' ? { dispatchedAt: now } : {}),
          ...(input.to === 'DELIVERED' ? { deliveredAt: now } : {}),
          ...(input.to === 'CANCELLED' ? { cancelledAt: now } : {}),
        },
      );
      if (result !== null && (input.to === 'HANDED_OVER' || input.to === 'DELIVERED'))
        await this.notifications.notify({
          kind: input.to === 'HANDED_OVER' ? 'SHIPMENT_HANDED_OVER' : 'SHIPMENT_DELIVERED',
          recipientUserId: shipment.customerId,
          subject: 'Shipment status update',
          body:
            'The platform recorded ' +
            input.to.toLowerCase() +
            ' for your shipment. This is an administrative record, not carrier verification.',
          metadata: { shipmentId: shipment.id, orderId: shipment.orderId },
          idempotencyKey: `shipment:${shipment.id}:${input.to}`,
        });
      return result;
    });
    if (changed === null) {
      // A concurrent transition won the race; the shipment is already in another state.
      const current = await this.shipping.findShipmentById(input.shipmentId);
      if (current === null) throw AppError.shipmentNotFound();
      const record = () =>
        this.shipping.recordShipmentEvent(input.shipmentId, {
          eventType: 'SHIPMENT_TRANSITION_REFUSED',
          previousStatus: current.status,
          nextStatus: input.to,
          actor: 'ADMIN',
          actorUserId: input.actorUserId,
          reason: 'CONCURRENT_TRANSITION',
        });
      if (this.database.inTransaction) this.database.afterRollback(record);
      else await record();
      throw AppError.shipmentNotTransitionable();
    }
    return changed;
  }

  /**
   * Sets the tracking reference of a shipment.
   *
   * The reference is the administrator's own text. No carrier is contacted, so the platform never
   * presents it as carrier-verified tracking.
   */
  public async setTracking(input: {
    readonly shipmentId: string;
    readonly trackingReference: string;
    readonly actorUserId: string | null;
  }): Promise<ShipmentRecord> {
    const reference = input.trackingReference.trim();
    if (reference.length === 0 || reference.length > 200) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'trackingReference', message: 'Invalid value' }],
      });
    }
    const shipment = await this.shipping.findShipmentById(input.shipmentId);
    if (shipment === null) throw AppError.shipmentNotFound();
    if (shipment.status === 'DELIVERED' || shipment.status === 'CANCELLED') {
      throw AppError.shipmentNotTransitionable();
    }
    const changed = await this.shipping.transitionShipment(
      input.shipmentId,
      shipment.status,
      shipment.status,
      {
        eventType: 'SHIPMENT_TRACKING_SET',
        previousStatus: shipment.status,
        nextStatus: shipment.status,
        actor: 'ADMIN',
        actorUserId: input.actorUserId,
        reason: null,
        detail: { trackingReference: reference },
      },
      { trackingReference: reference },
    );
    if (changed === null) throw AppError.shipmentNotTransitionable();
    return changed;
  }

  // -------------------------------------------------------------------------------------------
  // The returns.
  // -------------------------------------------------------------------------------------------

  /**
   * Records a customer's request to return part or all of an order.
   *
   * The request holds no money and moves no stock: the return is a separate aggregate with its own
   * lifecycle, so a requested return is exactly that.
   */
  public async requestReturn(input: {
    readonly orderId: string;
    readonly customerId: string;
    readonly reasonCode: string;
    readonly lines: readonly { readonly orderLineId: string; readonly quantity: number }[];
  }): Promise<ReturnRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`return-order:${input.orderId}`);
      const order = await this.orders.findOrderById(input.orderId);
      // An order that belongs to another customer is answered exactly like one that never existed.
      if (order === null || order.customerId !== input.customerId) throw AppError.orderNotFound();
      if (!RETURNABLE_ORDER_STATUSES.includes(order.status)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ path: 'orderId', message: 'The order is not paid' }],
        });
      }
      if (input.lines.length === 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ path: 'lines', message: 'Invalid value' }],
        });
      }

      const claimed = await this.shipping.claimedReturnLines(order.id);
      const allocations = this.allocateReturnAmounts(order, input.lines, claimed);
      const event: ReturnEventAttributes = {
        eventType: 'RETURN_REQUESTED',
        previousStatus: null,
        nextStatus: 'REQUESTED',
        actor: 'CUSTOMER',
        actorUserId: input.customerId,
        reason: input.reasonCode,
        detail: { orderId: order.id, lines: allocations.map((line) => line.quantity) },
      };
      return this.shipping.createReturn({
        orderId: order.id,
        customerId: input.customerId,
        reasonCode: input.reasonCode.trim(),
        currency: order.currency,
        totalMinor: allocations.reduce((total, line) => total + line.amountMinor, 0),
        lines: allocations.map((line) => ({
          orderLineId: line.orderLineId,
          quantity: line.quantity,
          amountMinor: line.amountMinor,
        })),
        event,
      });
    });
  }

  /** One return by its identifier. */
  public async returnOf(returnId: string): Promise<ReturnRecord | null> {
    return this.shipping.findReturnById(returnId);
  }

  /** The returns of one customer, newest first. */
  public async listReturnsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly ReturnRecord[]> {
    return this.shipping.listReturnsForCustomer(customerId, limit);
  }

  /** Every return, newest first. */
  public async listReturns(limit: number): Promise<readonly ReturnRecord[]> {
    return this.shipping.listReturns(limit);
  }

  /** The recorded transitions of a return. */
  public async returnEvents(returnId: string) {
    return this.shipping.listReturnEvents(returnId);
  }

  /**
   * Approves or rejects a requested return.
   *
   * The decision is the administrator's, because the eligibility window and the conditions are a
   * merchant policy and HC-DEC-012 leaves that policy open.
   */
  public async decideReturn(input: {
    readonly returnId: string;
    readonly decision: 'APPROVED' | 'REJECTED';
    readonly actorUserId: string | null;
    readonly reason: string | null;
  }): Promise<ReturnRecord> {
    const record = await this.shipping.findReturnById(input.returnId);
    if (record === null) throw AppError.returnNotFound();
    if (!returnTransitionPermitted(record.status, input.decision)) {
      await this.shipping.recordReturnEvent(input.returnId, {
        eventType: 'RETURN_TRANSITION_REFUSED',
        previousStatus: record.status,
        nextStatus: input.decision,
        actor: 'ADMIN',
        actorUserId: input.actorUserId,
        reason: 'TRANSITION_NOT_PERMITTED',
      });
      throw AppError.returnNotTransitionable();
    }
    const changed = await this.shipping.transitionReturn(
      input.returnId,
      record.status,
      input.decision,
      {
        eventType: `RETURN_${input.decision}`,
        previousStatus: record.status,
        nextStatus: input.decision,
        actor: 'ADMIN',
        actorUserId: input.actorUserId,
        reason: input.reason,
      },
      { decidedAt: new Date() },
    );
    if (changed === null) throw AppError.returnNotTransitionable();
    return changed;
  }

  /** Cancels a return that has not been received. */
  public async cancelReturn(input: {
    readonly returnId: string;
    readonly customerId: string | null;
    readonly actor: 'CUSTOMER' | 'ADMIN';
    readonly actorUserId: string | null;
    readonly reason: string | null;
  }): Promise<ReturnRecord> {
    const record = await this.shipping.findReturnById(input.returnId);
    if (record === null) throw AppError.returnNotFound();
    if (input.actor === 'CUSTOMER' && record.customerId !== input.customerId) {
      throw AppError.returnNotFound();
    }
    if (!returnTransitionPermitted(record.status, 'CANCELLED')) {
      await this.shipping.recordReturnEvent(input.returnId, {
        eventType: 'RETURN_TRANSITION_REFUSED',
        previousStatus: record.status,
        nextStatus: 'CANCELLED',
        actor: input.actor,
        actorUserId: input.actorUserId,
        reason: 'TRANSITION_NOT_PERMITTED',
      });
      throw AppError.returnNotTransitionable();
    }
    const changed = await this.shipping.transitionReturn(
      input.returnId,
      record.status,
      'CANCELLED',
      {
        eventType: 'RETURN_CANCELLED',
        previousStatus: record.status,
        nextStatus: 'CANCELLED',
        actor: input.actor,
        actorUserId: input.actorUserId,
        reason: input.reason,
      },
      { cancelledAt: new Date() },
    );
    if (changed === null) throw AppError.returnNotTransitionable();
    return changed;
  }

  /**
   * Receives a return: the goods arrive, the administrator decides what goes back into stock, and
   * the money is returned through the Payments capability.
   *
   * The operation is **idempotent**. The restock is keyed by the return's own business key, the
   * refund is keyed by the return's own business key, and the state change is conditional, so a
   * repeated receive restocks nothing and refunds nothing a second time.
   */
  public async receiveReturn(input: {
    readonly returnId: string;
    readonly actorUserId: string | null;
    readonly restockLineIds: readonly string[];
    readonly refund: boolean;
  }): Promise<ReturnRecord> {
    const record = await this.database.transaction(async () => {
      await this.database.lock(`return-receipt:${input.returnId}`);
      return this.receiveGoods(input);
    });
    if (!input.refund || record.status === 'REFUNDED') return record;
    return this.refundReceivedReturn(record, input.actorUserId);
  }

  private async receiveGoods(input: {
    readonly returnId: string;
    readonly actorUserId: string | null;
    readonly restockLineIds: readonly string[];
    readonly refund: boolean;
  }): Promise<ReturnRecord> {
    let record = await this.shipping.findReturnById(input.returnId);
    if (record === null) throw AppError.returnNotFound();

    if (
      new Set(input.restockLineIds).size !== input.restockLineIds.length ||
      input.restockLineIds.some((id) => !record?.lines.some((line) => line.id === id))
    )
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'restockLineIds', message: 'Invalid value' }],
      });
    if (record.status === 'RECEIVED' || record.status === 'REFUNDED') {
      // The goods already arrived. The restock and the refund are repeated, and both are keyed.
    } else if (record.status === 'APPROVED') {
      const moved = await this.shipping.transitionReturn(
        input.returnId,
        'APPROVED',
        'RECEIVED',
        {
          eventType: 'RETURN_RECEIVED',
          previousStatus: 'APPROVED',
          nextStatus: 'RECEIVED',
          actor: 'ADMIN',
          actorUserId: input.actorUserId,
          reason: null,
        },
        { receivedAt: new Date() },
      );
      if (moved === null) {
        record = await this.shipping.findReturnById(input.returnId);
        if (record === null) throw AppError.returnNotFound();
        if (record.status !== 'RECEIVED' && record.status !== 'REFUNDED') {
          throw AppError.returnNotTransitionable();
        }
      } else {
        record = moved;
      }
    } else {
      await this.shipping.recordReturnEvent(input.returnId, {
        eventType: 'RETURN_TRANSITION_REFUSED',
        previousStatus: record.status,
        nextStatus: 'RECEIVED',
        actor: 'ADMIN',
        actorUserId: input.actorUserId,
        reason: 'TRANSITION_NOT_PERMITTED',
      });
      throw AppError.returnNotTransitionable();
    }

    const restocked = await this.restockReturnedGoods(record, input.restockLineIds);
    if (restocked.length > 0) {
      await this.shipping.recordReturnEvent(input.returnId, {
        eventType: 'RETURN_RESTOCKED',
        previousStatus: record.status,
        nextStatus: record.status,
        actor: 'ADMIN',
        actorUserId: input.actorUserId,
        reason: null,
        detail: { lines: restocked },
      });
    }

    return (await this.shipping.findReturnById(input.returnId)) ?? record;
  }

  /**
   * Puts the returned goods back into stock, through the Inventory capability.
   *
   * The restock is keyed by the return's own business key, so a repeated receive cannot double the
   * stock, and the returned line is marked conditionally, so a second attempt does not repeat it.
   */
  private async restockReturnedGoods(
    record: ReturnRecord,
    restockLineIds: readonly string[],
  ): Promise<readonly string[]> {
    const wanted = new Set(restockLineIds);
    const lines = record.lines.filter((line) => wanted.has(line.id) && !line.restocked);
    if (lines.length === 0) return [];

    const order = await this.orders.findOrderById(record.orderId);
    if (order === null) throw AppError.orderNotFound();
    const orderLines = new Map(order.lines.map((line) => [line.id, line]));

    const requests: RestockLine[] = [];
    const keysByLine = new Map<string, string[]>();
    for (const line of lines) {
      const orderLine = orderLines.get(line.orderLineId);
      if (orderLine === undefined) throw AppError.orderNotFound();
      const base = `return:${record.id}:line:${line.id}`;
      if (orderLine.bundleId !== null && orderLine.bundleKind === 'DYNAMIC') {
        if (orderLine.composition.length === 0) throw AppError.inventoryConflict();
        const keys: string[] = [];
        for (const component of orderLine.composition) {
          const quantity = component.quantity * line.quantity;
          if (
            !Number.isSafeInteger(component.quantity) ||
            component.quantity < 1 ||
            !Number.isSafeInteger(quantity) ||
            quantity > 2147483647
          )
            throw AppError.inventoryConflict();
          const reference = base + ':component:' + component.variantId;
          keys.push(reference);
          requests.push({
            target: { kind: 'VARIANT', variantId: component.variantId },
            quantity,
            reference,
          });
        }
        keysByLine.set(line.id, keys);
      } else {
        if (orderLine.bundleId !== null && orderLine.bundleKind !== 'FIXED')
          throw AppError.inventoryConflict();
        if (orderLine.bundleId === null && orderLine.variantId === null)
          throw AppError.inventoryConflict();
        requests.push({
          target:
            orderLine.bundleId !== null
              ? { kind: 'BUNDLE', bundleId: orderLine.bundleId }
              : { kind: 'VARIANT', variantId: orderLine.variantId ?? '' },
          quantity: line.quantity,
          reference: base,
        });
        keysByLine.set(line.id, [base]);
      }
    }
    const outcome = await this.inventory.restock({
      lines: requests,
      reason: `return:${record.id}`,
    });
    const applied = new Set(outcome.lines.map((line) => line.reference));
    const marked: string[] = [];
    for (const line of lines) {
      const keys = keysByLine.get(line.id);
      if (
        keys !== undefined &&
        keys.length > 0 &&
        keys.every((key) => applied.has(key)) &&
        (await this.shipping.markReturnLineRestocked(line.id))
      )
        marked.push(line.id);
    }
    return marked;
  }

  /**
   * Returns the money through the Payments capability.
   *
   * The Payments capability owns the cumulative refund limit, so a refund that would exceed what
   * can still be refunded is refused by it, and the refusal is recorded on the return rather than
   * replaced with a partial refund.
   */
  private async refundReceivedReturn(
    record: ReturnRecord,
    actorUserId: string | null,
  ): Promise<ReturnRecord> {
    try {
      const refund =
        record.totalMinor === 0
          ? { refundId: null, status: 'SUCCEEDED' as const, amountMinor: 0 }
          : await this.payments.refundOrder({
              orderId: record.orderId,
              customerId: record.customerId,
              amountMinor: record.totalMinor,
              reason: `return:${record.id}`,
              idempotencyKey: `return:${record.id}:refund`,
              actorUserId,
            });
      const succeeded = refund.status === 'SUCCEEDED';
      const changed = await this.database.transaction(async () => {
        const result = await this.shipping.transitionReturn(
          record.id,
          'RECEIVED',
          succeeded ? 'REFUNDED' : 'RECEIVED',
          {
            eventType: succeeded ? 'RETURN_REFUNDED' : `RETURN_REFUND_${refund.status}`,
            previousStatus: 'RECEIVED',
            nextStatus: succeeded ? 'REFUNDED' : 'RECEIVED',
            actor: 'ADMIN',
            actorUserId,
            reason: null,
            detail: { refundId: refund.refundId, amountMinor: refund.amountMinor },
          },
          { refundId: refund.refundId, refundStatus: succeeded ? 'COMPLETED' : refund.status },
        );
        if (result !== null && succeeded)
          await this.notifications.notify({
            kind: 'RETURN_REFUNDED',
            recipientUserId: record.customerId,
            subject: 'Return refund recorded',
            body: 'The platform recorded the refund outcome for your return.',
            metadata: { returnId: record.id, orderId: record.orderId, refundId: refund.refundId },
            idempotencyKey: `return:${record.id}:refunded-notice`,
          });
        return result;
      });
      if (changed === null) {
        const current = await this.shipping.findReturnById(record.id);
        if (current === null) throw AppError.returnNotFound();
        return current;
      }
      return changed;
    } catch (error) {
      await this.shipping.transitionReturn(
        record.id,
        'RECEIVED',
        'RECEIVED',
        {
          eventType: 'RETURN_REFUND_REFUSED',
          previousStatus: 'RECEIVED',
          nextStatus: 'RECEIVED',
          actor: 'ADMIN',
          actorUserId,
          reason: 'REFUND_REFUSED',
        },
        { refundStatus: error instanceof AppError ? 'REFUSED' : 'UNKNOWN' },
      );
      throw error;
    }
  }

  /**
   * The exact amounts the returned lines cover.
   *
   * Allocate the new cumulative integer share less the already claimed amount. Cancelled/rejected
   * claims release both units and money; exhausting a line refunds its exact snapshotted total.
   */
  private allocateReturnAmounts(
    order: OrderSnapshot,
    lines: readonly { readonly orderLineId: string; readonly quantity: number }[],
    claimed: readonly {
      readonly orderLineId: string;
      readonly quantity: number;
      readonly amountMinor: number | null;
    }[],
  ): readonly { orderLineId: string; quantity: number; amountMinor: number }[] {
    const seen = new Set<string>();
    return lines.map((requested) => {
      const line = order.lines.find((candidate) => candidate.id === requested.orderLineId);
      const prior = claimed.filter((candidate) => candidate.orderLineId === requested.orderLineId);
      const quantity = prior.reduce((n, c) => n + c.quantity, 0);
      if (
        line === undefined ||
        seen.has(requested.orderLineId) ||
        !Number.isSafeInteger(requested.quantity) ||
        requested.quantity < 1 ||
        quantity + requested.quantity > line.quantity
      )
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ path: 'lines', message: 'Invalid or previously claimed quantity' }],
        });
      if (prior.some((c) => c.amountMinor === null)) throw AppError.returnNotTransitionable();
      seen.add(requested.orderLineId);
      const allocated = prior.reduce((n, c) => n + (c.amountMinor ?? 0), 0);
      const amountMinor =
        Number(
          (BigInt(line.totalMinor) * BigInt(quantity + requested.quantity)) / BigInt(line.quantity),
        ) - allocated;
      if (amountMinor < 0 || amountMinor + allocated > line.totalMinor)
        throw AppError.returnNotTransitionable();
      return { orderLineId: line.id, quantity: requested.quantity, amountMinor };
    });
  }
  public async shipmentStateCounts(): Promise<readonly { state: string; count: number }[]> {
    return this.shipping.shipmentStateCounts();
  }
  public async shipmentCustomerIdsAfter(
    cursor: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    return this.shipping.shipmentCustomerIdsAfter(cursor, limit);
  }
  public async shipmentCustomerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    return this.shipping.shipmentCustomerCounts(ids);
  }
  public async shipmentIdsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly string[]> {
    return this.shipping.shipmentIdsForCustomer(customerId, limit);
  }
  public async returnStateCounts(): Promise<readonly { state: string; count: number }[]> {
    return this.shipping.returnStateCounts();
  }
  public async returnCustomerIdsAfter(
    cursor: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    return this.shipping.returnCustomerIdsAfter(cursor, limit);
  }
  public async returnCustomerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    return this.shipping.returnCustomerCounts(ids);
  }
  public async returnIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]> {
    return this.shipping.returnIdsForCustomer(customerId, limit);
  }
}

/** True when the database refused a unique constraint. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
