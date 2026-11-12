import type { ApiProductDetail } from '../lib/api/catalog-types';
import type { ApiCart, ApiCartLine, ApiCheckoutQuote, ApiOrder } from '../lib/api/commerce-types';

/**
 * Contract-shaped fixtures for the cart / checkout / order component tests.
 * Shapes follow openapi.json 1.3.0; values mirror the F06 test catalogue.
 */

export const signedInSession = {
  authenticated: true,
  principal: {
    role: 'CUSTOMER',
    user: {
      id: 'u1',
      email: 'nadia@example.test',
      role: 'CUSTOMER',
      createdAt: '2026-10-23T00:00:00Z',
    },
    session: {
      id: 's1',
      clientLabel: null,
      createdAt: '2026-10-23T00:00:00Z',
      lastUsedAt: '2026-10-23T00:00:00Z',
      expiresAt: '2026-11-23T00:00:00Z',
      current: true,
    },
  },
};

export const signedOutSession = { authenticated: false };

export const casseroleDetail: ApiProductDetail = {
  id: 'p-casserole',
  name: 'Enamelled Cast-Iron Casserole',
  slug: 'enamelled-cast-iron-casserole',
  status: 'PUBLISHED',
  baseCurrency: 'EGP',
  basePriceMinor: 570000,
  discountBasisPoints: 1500,
  effectivePriceMinor: 484500,
  description: 'A casserole.',
  brand: { id: 'b1', name: 'Atelier Nile', slug: 'atelier-nile' },
  category: { id: 'c1', name: 'Cookware', slug: 'cookware' },
  images: [{ url: 'http://localhost:3003/images/casserole.webp', altText: null, position: 0 }],
  attributes: [],
  variants: [
    {
      id: 'v-24-ter',
      sku: 'HC-CI-CAS-24-TER',
      color: 'Terracotta',
      size: '24 cm',
      material: 'Cast iron',
      position: 0,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'v-28-sag',
      sku: 'HC-CI-CAS-28-SAG',
      color: 'Sage',
      size: '28 cm',
      material: 'Cast iron',
      position: 1,
      createdAt: '',
      updatedAt: '',
    },
  ],
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
} as unknown as ApiProductDetail;

export function cartLine(overrides: Partial<ApiCartLine> = {}): ApiCartLine {
  return {
    id: 'line-1',
    targetKind: 'VARIANT',
    variantId: 'v-28-sag',
    bundleId: null,
    sku: 'HC-CI-CAS-28-SAG',
    productId: 'p-casserole',
    productName: 'Enamelled Cast-Iron Casserole',
    productSlug: 'enamelled-cast-iron-casserole',
    quantity: 1,
    lastKnownUnitPriceMinor: 484500,
    lastKnownUnitCurrency: 'EGP',
    currentUnitPriceMinor: 484500,
    currentUnitCurrency: 'EGP',
    priceChanged: false,
    purchasable: true,
    ...overrides,
  };
}

export const cartOf = (...lines: ApiCartLine[]): ApiCart => ({
  lines,
  updatedAt: '2026-10-24T08:00:00Z',
});

export function quoteFor(overrides: Partial<ApiCheckoutQuote> = {}): ApiCheckoutQuote {
  return {
    currency: 'EGP',
    destinationCountryCode: 'EG',
    taxJurisdiction: 'EG',
    ready: true,
    blockers: [],
    lines: [
      {
        lineId: 'line-1',
        targetKind: 'VARIANT',
        variantId: 'v-28-sag',
        bundleId: null,
        sku: 'HC-CI-CAS-28-SAG',
        productId: 'p-casserole',
        productName: 'Enamelled Cast-Iron Casserole',
        quantity: 1,
        unitPriceMinor: 484500,
        unitCurrency: 'EGP',
        priceChanged: false,
        taxClassification: 'STANDARD',
        taxRuleId: 'r1',
        taxRateBasisPoints: 1400,
        taxInclusive: true,
        netMinor: 425000,
        taxMinor: 59500,
        totalMinor: 484500,
      },
    ],
    netSubtotalMinor: 425000,
    taxTotalMinor: 59500,
    totalMinor: 484500,
    roundingRule: 'half-up-per-line',
    fingerprint: 'f'.repeat(64),
    ...overrides,
  };
}

export function orderFor(overrides: Partial<ApiOrder> = {}): ApiOrder {
  return {
    id: '0d2f6a1c-1111-4222-8333-944445555666',
    status: 'PENDING_PAYMENT',
    statusReason: null,
    currency: 'EGP',
    destinationCountryCode: 'EG',
    taxJurisdiction: 'EG',
    subtotalMinor: 425000,
    taxTotalMinor: 59500,
    totalMinor: 484500,
    refundedMinor: 0,
    quoteFingerprint: 'f'.repeat(64),
    reservationId: 'res-1',
    expiresAt: '2099-01-01T00:15:00Z',
    paidAt: null,
    cancelledAt: null,
    createdAt: '2026-10-24T08:00:00Z',
    updatedAt: '2026-10-24T08:00:00Z',
    lines: [
      {
        id: 'ol-1',
        bundleId: null,
        variantId: 'v-28-sag',
        productId: 'p-casserole',
        productName: 'Enamelled Cast-Iron Casserole',
        sku: 'HC-CI-CAS-28-SAG',
        quantity: 1,
        unitPriceMinor: 484500,
        unitCurrency: 'EGP',
        discountBasisPoints: 1500,
        netMinor: 425000,
        taxMinor: 59500,
        totalMinor: 484500,
        taxClassification: 'STANDARD',
        taxInclusive: true,
        taxRateBasisPoints: 1400,
        composition: [],
      },
    ],
    ...overrides,
  };
}

export const address = {
  id: 'a1',
  recipientName: 'Nadia Tester',
  line1: '14 Example Street',
  line2: 'Apartment 6',
  city: 'Zamalek',
  region: 'Cairo',
  postalCode: '11211',
  countryCode: 'EG',
  phone: '+20 100 000 0000',
  isDefault: true,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
};

export const shippingOptions = {
  environment: 'TEST',
  chargeCollected: false,
  options: [
    {
      code: 'F06-TEST-STANDARD',
      label: 'Standard delivery (test)',
      amountMinor: 0,
      currency: 'EGP',
      destinationCountryCode: 'EG',
    },
  ],
};
