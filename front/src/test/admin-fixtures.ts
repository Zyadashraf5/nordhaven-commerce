import type { AdminProduct } from '../lib/api/admin-types';
import { orderFor } from './commerce-fixtures';

/** Contract-shaped admin fixtures (openapi.json 1.3.0) for the admin component tests. */

export const adminProduct: AdminProduct = {
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
  images: [
    {
      url: 'http://localhost:3003/images/cookware-casserole.webp',
      altText: 'Casserole',
      position: 0,
    },
  ],
  attributes: [{ name: 'Material', value: 'Enamelled cast iron', position: 0 }],
  variants: [
    {
      id: 'v1',
      sku: 'HC-CI-CAS-24-TER',
      color: 'Terracotta',
      size: '24 cm',
      material: null,
      position: 0,
      createdAt: '',
      updatedAt: '',
    },
  ],
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
};

export const adminCategories = {
  categories: [
    {
      id: 'c1',
      name: 'Cookware',
      slug: 'cookware',
      parentId: null,
      position: 0,
      children: [],
      createdAt: '',
      updatedAt: '',
    },
  ],
};
export const adminBrands = {
  brands: [{ id: 'b1', name: 'Atelier Nile', slug: 'atelier-nile', createdAt: '', updatedAt: '' }],
};

export const productPage = {
  items: [
    {
      id: adminProduct.id,
      name: adminProduct.name,
      slug: adminProduct.slug,
      status: adminProduct.status,
      baseCurrency: 'EGP',
      basePriceMinor: 570000,
      discountBasisPoints: 1500,
      effectivePriceMinor: 484500,
      brand: adminProduct.brand,
      category: adminProduct.category,
      createdAt: '',
      updatedAt: '',
    },
  ],
  nextCursor: null,
};

export const adminOrder = orderFor();

export const customersPage = {
  customers: [
    {
      customerId: 'cust-1',
      email: 'nadia@example.test',
      role: 'CUSTOMER',
      accountCreatedAt: '2026-10-23T00:00:00Z',
      orderCount: 1,
      reviewCount: 0,
      shipmentCount: 0,
      returnCount: 0,
    },
  ],
  nextCursor: null,
};

export const customerDetail = {
  ...customersPage.customers[0],
  orderIds: [adminOrder.id],
  reviewIds: [],
  shipmentIds: [],
  returnIds: [],
  recordsTruncated: false,
};

export const pendingAttempt = {
  id: 'pa-1',
  orderId: adminOrder.id,
  provider: 'LOCAL_TEST',
  providerReference: 'local-test-payment-pa-1',
  status: 'PENDING',
  statusReason: null,
  amountMinor: 484500,
  currency: 'EGP',
  refundedMinor: 0,
  pendingRefundMinor: 0,
  createdAt: '2026-10-24T08:01:00Z',
  succeededAt: null,
  failedAt: null,
};
