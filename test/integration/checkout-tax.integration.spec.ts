import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { CheckoutService } from '../../apps/api/src/modules/checkout/application/checkout.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { TaxService } from '../../apps/api/src/modules/tax/application/tax.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import type { AuthenticatedPrincipal } from '../../apps/api/src/platform/security/principal';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetCheckoutDatabase } from '../helpers/checkout-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CUSTOMER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b74';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

function principalFor(userId: string): AuthenticatedPrincipal {
  return {
    userId,
    role: 'CUSTOMER',
    sessionId: '7f1e0d9c-8b7a-4695-8432-1f0e9d8c7b75',
    sessionExpiresAt: new Date('2026-10-21T12:00:00.000Z'),
  };
}

describe('Checkout and Tax integration', () => {
  let app: Application;
  let database: DatabaseService;
  let categories: CategoryService;
  let brands: BrandService;
  let products: ProductService;
  let carts: CartService;
  let inventory: InventoryService;
  let taxes: TaxService;
  let checkout: CheckoutService;

  const customer = principalFor(CUSTOMER_USER_ID);

  beforeAll(async () => {
    const created = await createApplication({ configuration: testConfigurationFor('integration') });
    app = created.app;
    database = app.get(DatabaseService);
    categories = app.get(CategoryService);
    brands = app.get(BrandService);
    products = app.get(ProductService);
    carts = app.get(CartService);
    inventory = app.get(InventoryService);
    taxes = app.get(TaxService);
    checkout = app.get(CheckoutService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetIdentityDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  afterEach(async () => {
    await resetIdentityDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  async function seedPublished(
    options: {
      name?: string;
      basePriceMinor?: number;
      baseCurrency?: string;
      publish?: boolean;
    } = {},
  ): Promise<{ productId: string; variantId: string }> {
    const name = options.name ?? 'Oak Dining Table';
    const category = await categories.create({ name: `Category ${name}` });
    const brand = await brands.create({ name: `Brand ${name}` });
    const product = await products.create({
      name,
      description: `${name} description.`,
      categoryId: category.id,
      brandId: brand.id,
      basePriceMinor: options.basePriceMinor ?? 129900,
      baseCurrency: options.baseCurrency ?? 'EGP',
    });
    const variant = await products.createVariant(product.id, {
      sku: `SKU-${name.replace(/\s+/g, '-')}`,
    });
    if (options.publish !== false) {
      await products.setStatus(product.id, 'PUBLISHED');
    }
    return { productId: product.id, variantId: variant.id };
  }

  async function approveDestination(
    overrides: Partial<{ enabled: boolean; shippingApproved: boolean }> = {},
  ) {
    return checkout.configureDestination({
      countryCode: 'EG',
      enabled: overrides.enabled ?? true,
      taxJurisdiction: 'EG',
      shippingApproved: overrides.shippingApproved ?? true,
      label: 'Egypt',
      updatedByUserId: null,
    });
  }

  async function configureStandardTax(rateBasisPoints = 1400, taxInclusive = false) {
    return taxes.createRule({
      environment: 'TEST',
      jurisdiction: 'EG',
      classification: 'STANDARD',
      rateBasisPoints,
      taxInclusive,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      priority: 0,
      updatedByUserId: null,
    });
  }

  describe('the tax configuration', () => {
    it('stores a rule and lists it', async () => {
      const created = await configureStandardTax();

      const rules = await taxes.listRules();

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        id: created.id,
        environment: 'TEST',
        jurisdiction: 'EG',
        classification: 'STANDARD',
        rateBasisPoints: 1400,
        taxInclusive: false,
      });
    });

    it('refuses a duplicate rule for the same jurisdiction, classification, and start', async () => {
      await configureStandardTax();

      await expect(configureStandardTax()).rejects.toMatchObject({ code: 'TAX_RULE_CONFLICT' });
    });

    it('stores a product classification and returns it', async () => {
      const { productId } = await seedPublished();

      await taxes.setClassification(productId, 'REDUCED');

      expect(await taxes.classificationOf(productId)).toBe('REDUCED');
    });

    it('returns the standard classification for a product with none', async () => {
      const { productId } = await seedPublished();

      expect(await taxes.classificationOf(productId)).toBe('STANDARD');
    });

    it('refuses a classification for a product that does not exist', async () => {
      await expect(
        taxes.setClassification('6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b99', 'REDUCED'),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('removes a classification and returns the product to the standard one', async () => {
      const { productId } = await seedPublished();
      await taxes.setClassification(productId, 'REDUCED');

      await taxes.clearClassification(productId);

      expect(await taxes.classificationOf(productId)).toBe('STANDARD');
    });
  });

  describe('the checkout destinations', () => {
    it('stores a destination and lists it', async () => {
      await approveDestination();

      const destinations = await checkout.listDestinations();

      expect(destinations).toHaveLength(1);
      expect(destinations[0]).toMatchObject({
        countryCode: 'EG',
        enabled: true,
        taxJurisdiction: 'EG',
        shippingApproved: true,
      });
    });

    it('replaces a destination on a second call', async () => {
      await approveDestination();
      await approveDestination({ shippingApproved: false });

      const destinations = await checkout.listDestinations();

      expect(destinations).toHaveLength(1);
      expect(destinations[0]?.shippingApproved).toBe(false);
    });
  });

  describe('the quote', () => {
    it('prices the cart, the tax, and the total exactly', async () => {
      const { variantId } = await seedPublished();
      await approveDestination();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 2);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(true);
      expect(quote.blockers).toEqual([]);
      expect(quote.currency).toBe('EGP');
      expect(quote.netSubtotalMinor).toBe(259800);
      expect(quote.taxTotalMinor).toBe(36372);
      expect(quote.totalMinor).toBe(296172);
      expect(quote.netSubtotalMinor + quote.taxTotalMinor).toBe(quote.totalMinor);
      expect(quote.lines[0]).toMatchObject({
        variantId,
        quantity: 2,
        unitPriceMinor: 129900,
        taxRateBasisPoints: 1400,
        taxInclusive: false,
        netMinor: 259800,
        taxMinor: 36372,
        totalMinor: 296172,
      });
    });

    it('is identical for the same cart and destination', async () => {
      const { variantId } = await seedPublished();
      await approveDestination();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);

      const first = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });
      const second = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(second.totalMinor).toBe(first.totalMinor);
      expect(second.fingerprint).toBe(first.fingerprint);
    });

    it('reports an empty cart as not ready', async () => {
      await approveDestination();
      await configureStandardTax(1400);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(false);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('CART_EMPTY');
    });

    it('reports an unsupported destination as not ready', async () => {
      const { variantId } = await seedPublished();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'US',
      });

      expect(quote.ready).toBe(false);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('DESTINATION_NOT_SUPPORTED');
    });

    it('reports a destination without an approved shipping rule as not ready', async () => {
      const { variantId } = await seedPublished();
      await approveDestination({ shippingApproved: false });
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(false);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('SHIPPING_NOT_APPROVED');
    });

    it('reports a missing tax rule as not ready and never assumes a zero rate', async () => {
      const { variantId } = await seedPublished();
      await approveDestination();
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(false);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('TAX_RULE_MISSING');
    });

    it('reports a product that is no longer published as not ready', async () => {
      const { productId, variantId } = await seedPublished();
      await approveDestination();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);
      await products.setStatus(productId, 'DRAFT');

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(false);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('PRODUCT_UNAVAILABLE');
    });

    it('reports insufficient stock as not ready', async () => {
      const { variantId } = await seedPublished();
      await approveDestination();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 1, null);
      await carts.addItem(customer, variantId, 5);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(false);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('INSUFFICIENT_STOCK');
    });

    it('reports a price change and prices at the current price', async () => {
      const { productId, variantId } = await seedPublished();
      await approveDestination();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);
      await products.setDiscount(productId, 5000);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(true);
      expect(quote.lines[0]?.priceChanged).toBe(true);
      // 129900 less a fifty percent discount: floor(129900 * 5000 / 10000) is 64950, so the
      // effective price is 129900 - 64950 = 64950.
      expect(quote.lines[0]?.unitPriceMinor).toBe(64950);
      expect(quote.netSubtotalMinor).toBe(64950);
    });

    it('refuses a price that is not in the settlement currency', async () => {
      const { variantId } = await seedPublished({ name: 'Imported Vase', baseCurrency: 'USD' });
      await approveDestination();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(false);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('CURRENCY_NOT_SETTLED');
    });

    it('never quotes another customer cart', async () => {
      const { variantId } = await seedPublished();
      await approveDestination();
      await configureStandardTax(1400);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);

      const other = principalFor('6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b76');
      const quote = await checkout.quote({
        customerId: other.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.lines).toEqual([]);
      expect(quote.blockers.map((blocker) => blocker.code)).toContain('CART_EMPTY');
    });

    it('extracts the tax from a tax-inclusive price', async () => {
      const { variantId } = await seedPublished({
        name: 'Tax Inclusive Vase',
        basePriceMinor: 114000,
      });
      await approveDestination();
      await configureStandardTax(1400, true);
      await inventory.setOnHand(variantId, 10, null);
      await carts.addItem(customer, variantId, 1);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(true);
      expect(quote.lines[0]?.taxInclusive).toBe(true);
      expect(quote.netSubtotalMinor).toBe(100000);
      expect(quote.taxTotalMinor).toBe(14000);
      expect(quote.totalMinor).toBe(114000);
    });

    it('assesses each line under the rule of its own classification', async () => {
      const standard = await seedPublished({ name: 'Standard Item', basePriceMinor: 100000 });
      const reduced = await seedPublished({ name: 'Reduced Item', basePriceMinor: 100000 });
      await taxes.setClassification(reduced.productId, 'REDUCED');
      await approveDestination();
      await configureStandardTax(1400);
      await taxes.createRule({
        environment: 'TEST',
        jurisdiction: 'EG',
        classification: 'REDUCED',
        rateBasisPoints: 500,
        taxInclusive: false,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: null,
        priority: 0,
        updatedByUserId: null,
      });
      await inventory.setOnHand(standard.variantId, 10, null);
      await inventory.setOnHand(reduced.variantId, 10, null);
      await carts.addItem(customer, standard.variantId, 1);
      await carts.addItem(customer, reduced.variantId, 1);

      const quote = await checkout.quote({
        customerId: customer.userId,
        destinationCountryCode: 'EG',
      });

      expect(quote.ready).toBe(true);
      // 100000 at fourteen percent is 14000, and 100000 at five percent is 5000.
      expect(quote.taxTotalMinor).toBe(14000 + 5000);
      const byClassification = new Map(
        quote.lines.map((line) => [line.taxClassification, line.taxRateBasisPoints]),
      );
      expect(byClassification.get('STANDARD')).toBe(1400);
      expect(byClassification.get('REDUCED')).toBe(500);
    });
  });
  it('retains attributed tax rule and classification history after deletion', async () => {
    const { productId } = await seedPublished();
    const rule = await taxes.createRule({
      environment: 'TEST',
      jurisdiction: 'EG',
      classification: 'STANDARD',
      rateBasisPoints: 1400,
      taxInclusive: false,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      priority: 0,
      updatedByUserId: CUSTOMER_USER_ID,
    });
    await taxes.setClassification(productId, 'REDUCED', CUSTOMER_USER_ID);
    await taxes.clearClassification(productId, CUSTOMER_USER_ID);
    await taxes.removeRule(rule.id, CUSTOMER_USER_ID);
    const events = await database.prisma.taxConfigurationEvent.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(events).toHaveLength(4);
    expect(events.every((event) => event.actorUserId === CUSTOMER_USER_ID)).toBe(true);
    expect(events.find((event) => event.action === 'DELETE')).toMatchObject({
      target: 'rule:' + rule.id,
      before: { rateBasisPoints: 1400 },
      after: null,
    });
    expect(events.find((event) => event.action === 'CLEAR')).toMatchObject({
      before: { classification: 'REDUCED' },
      after: null,
    });
    expect(await database.prisma.taxRule.count()).toBe(0);
    expect(await database.prisma.taxClassification.count()).toBe(0);
  });

  it('serializes competing destination replacements and records the actual predecessor', async () => {
    const input = {
      countryCode: 'EG',
      enabled: true,
      taxJurisdiction: 'EG',
      shippingApproved: true,
      label: 'initial',
      updatedByUserId: CUSTOMER_USER_ID,
    };
    await checkout.configureDestination(input);
    await Promise.all(
      ['first', 'second'].map((label) => checkout.configureDestination({ ...input, label })),
    );
    const events = await database.prisma.checkoutConfigurationEvent.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(events).toHaveLength(3);
    const created = events.find((event) => event.action === 'CREATE');
    const firstReplacement = events.find(
      (event) =>
        event.action === 'REPLACE' &&
        JSON.stringify(event.before) === JSON.stringify(created?.after),
    );
    const secondReplacement = events.find(
      (event) =>
        event.action === 'REPLACE' &&
        JSON.stringify(event.before) === JSON.stringify(firstReplacement?.after),
    );
    expect(created).toBeDefined();
    expect(firstReplacement).toBeDefined();
    expect(secondReplacement).toBeDefined();
    expect(firstReplacement?.id).not.toBe(secondReplacement?.id);
    expect(events.every((event) => event.actorUserId === CUSTOMER_USER_ID)).toBe(true);
    const current = await database.prisma.checkoutDestination.findFirstOrThrow();
    expect(secondReplacement?.after).toMatchObject({ label: current.label });
  });

  it('rolls configuration changes back when their audit fact cannot be persisted', async () => {
    const input = {
      countryCode: 'EG',
      enabled: true,
      taxJurisdiction: 'EG',
      shippingApproved: true,
      label: 'before',
      updatedByUserId: CUSTOMER_USER_ID,
    };
    await checkout.configureDestination(input);
    // Invalid actor identifiers must never leave partial configuration or audit writes.
    await expect(
      checkout.configureDestination({ ...input, label: 'after', updatedByUserId: 'invalid-actor' }),
    ).rejects.toThrow();
    expect((await database.prisma.checkoutDestination.findFirstOrThrow()).label).toBe('before');
    expect(await database.prisma.checkoutConfigurationEvent.count()).toBe(1);
    const { productId } = await seedPublished();
    await expect(taxes.setClassification(productId, 'REDUCED', 'invalid-actor')).rejects.toThrow();
    expect(await database.prisma.taxClassification.count()).toBe(0);
    expect(await database.prisma.taxConfigurationEvent.count()).toBe(0);
  });
});
