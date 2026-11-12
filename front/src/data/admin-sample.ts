/**
 * Shared F05 admin demo data.
 *
 * NOT LIVE API DATA — the backend admin read contracts (M13) arrive in F06.
 * These typed records mirror the backend state enums (read from openapi.json)
 * so components can be replaced by live responses without changing a single
 * component. Everything is clearly labelled sample data; no payment, refund,
 * stock adjustment, order transition, or notification is real.
 *
 * Records are consistent across screens: the same order/pre-order/return ids,
 * dates, amounts, product ids, customer ids and shipment ids appear on the
 * list, the detail and the fulfilment views.
 */

import { egp } from './money';
import type { Money } from './types';

/* ------------------------------------------------------------------ *
 * Status types (mirror the backend enums in openapi.json)
 * ------------------------------------------------------------------ */

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PAID_PENDING_ALLOCATION'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FULFILLED'
  | 'REFUNDED';

export type PreOrderStatus =
  | 'AWAITING_STOCK'
  | 'STOCK_RESERVED'
  | 'AWAITING_PAYMENT'
  | 'CONVERTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RECEIVED'
  | 'REFUNDED'
  | 'CANCELLED';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ShipmentStatus = 'PREPARED' | 'PACKED' | 'HANDED_OVER' | 'DELIVERED' | 'CANCELLED';

export type NotificationStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export type PaymentAttemptStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export type InventoryMovementType = 'ADJUSTMENT' | 'RESERVATION' | 'RELEASE';

export type BundleKind = 'fixed' | 'dynamic';

/* ------------------------------------------------------------------ *
 * Money helpers
 * ------------------------------------------------------------------ */

/** EGP from a whole-EGP number. */

/* ------------------------------------------------------------------ *
 * Shared identity
 * ------------------------------------------------------------------ */

export const adminIdentity = {
  name: 'Admin Operator',
  email: 'admin@nordhaven.example',
  role: 'ADMIN',
  mfaEnrolled: true,
} as const;

/* ------------------------------------------------------------------ *
 * Operational overview (M13 FR-005 / FR-006 / FR-007)
 * ------------------------------------------------------------------ */

export interface OperationalCount {
  label: string;
  count: number;
  trend?: string; // e.g. "+12 vs yesterday"
}

export interface OperationalOverview {
  ordersByState: Record<OrderStatus, number>;
  shipmentsByState: Record<ShipmentStatus, number>;
  returnsByState: Record<ReturnStatus, number>;
  reviewsByState: Record<ReviewStatus, number>;
  notificationsByState: Record<NotificationStatus, number>;
  accounts: number;
  collectedMoney: Money; // sum of succeeded attempts
  refundedMoney: Money; // sum of succeeded refunds
  pendingRefundMoney: Money; // sum of pending refunds
  currency: 'EGP';
}

export const operationalOverview: OperationalOverview = {
  ordersByState: {
    PENDING_PAYMENT: 2,
    PAID: 14,
    PAID_PENDING_ALLOCATION: 3,
    PAYMENT_FAILED: 1,
    CANCELLED: 2,
    EXPIRED: 1,
    FULFILLED: 28,
    REFUNDED: 0,
  },
  shipmentsByState: {
    PREPARED: 2,
    PACKED: 1,
    HANDED_OVER: 6,
    DELIVERED: 28,
    CANCELLED: 2,
  },
  returnsByState: {
    REQUESTED: 3,
    APPROVED: 2,
    REJECTED: 1,
    RECEIVED: 4,
    REFUNDED: 2,
    CANCELLED: 0,
  },
  reviewsByState: {
    PENDING: 2,
    APPROVED: 18,
    REJECTED: 1,
  },
  notificationsByState: {
    PENDING: 1,
    DELIVERED: 42,
    FAILED: 0,
    SKIPPED: 0,
  },
  accounts: 124,
  collectedMoney: egp(18590 + 6964), // two paid orders
  refundedMoney: egp(1424),
  pendingRefundMoney: egp(0),
  currency: 'EGP',
} as const;

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export interface F05OrderLine {
  name: string;
  variant?: string;
  sku: string;
  qty: number;
  price: Money;
  lineTotal: Money;
}

export interface F05Order {
  id: string;
  number: string;
  status: OrderStatus;
  statusReason?: string;
  customer: { name: string; email: string };
  placed: string;
  placedAt: string;
  updated: string;
  updatedAt: string;
  paidAt?: string;
  subtotal: Money;
  savings: Money;
  delivery: Money;
  tax: Money;
  total: Money;
  itemCount: number;
  paymentStatus: string;
  paymentMethod: string;
  shipMethod: string;
  tracking?: string;
  shippedOn?: string;
  lines: F05OrderLine[];
}

const kettleImg = {
  src: '/images/kettle-pourover.webp',
  alt: 'Pour-Over Kettle, 1 L, brushed steel',
  width: 720,
  height: 900,
};
const casseroleImg = {
  src: '/images/cookware-casserole.webp',
  alt: 'Enamelled Cast-Iron Casserole, Terracotta',
  width: 720,
  height: 900,
};
const platesImg = {
  src: '/images/tableware-plates.webp',
  alt: 'Stoneware Dinner Plates, Set of 4',
  width: 720,
  height: 900,
};

function adminLine(
  overrides: Partial<F05OrderLine> & {
    image?: { src: string; alt: string; width: number; height: number };
  },
): F05OrderLine {
  return {
    sku: 'SKU HC-SAMPLE',
    qty: 1,
    price: egp(0),
    ...overrides,
    lineTotal: egp(((overrides.price?.amountMinor ?? 0) / 100) * (overrides.qty ?? 1)),
  } as F05OrderLine;
}

export const f05Orders: F05Order[] = [
  {
    id: 'ord-260421-0047',
    number: 'HC-260421-0047',
    status: 'FULFILLED',
    customer: { name: 'Mariam Adel', email: 'mariam.adel@example.com' },
    placed: '21 Apr 2026',
    placedAt: '2026-04-21T10:00:00Z',
    updated: 'Shipped 22 Apr 2026',
    updatedAt: '2026-04-22T09:00:00Z',
    paidAt: '2026-04-21T10:05:00Z',
    subtotal: egp(17260),
    savings: egp(850),
    delivery: egp(120),
    tax: egp(1210),
    total: egp(18590),
    itemCount: 5,
    paymentStatus: 'Paid',
    paymentMethod: 'Credit or debit card · Card ending 4242',
    shipMethod: 'Standard delivery · EGP 120',
    tracking: 'TRK 5830 2917 44',
    shippedOn: '22 Apr 2026',
    lines: [
      adminLine({
        name: 'Enamelled Cast-Iron Casserole',
        variant: 'Terracotta · 24 cm',
        sku: 'HC-CI-CAS-24-TER',
        qty: 1,
        price: egp(4850),
        image: casseroleImg,
      }),
      adminLine({
        name: 'Stoneware Dinner Plates, Set of 4',
        variant: '27 cm · Oat',
        sku: 'HC-SW-DSH-30-OAT',
        qty: 2,
        price: egp(1680),
        image: platesImg,
      }),
      adminLine({
        name: 'The First Kitchen Set',
        variant: 'Ready-packed set',
        sku: 'HC-SET-FIRST-01',
        qty: 1,
        price: egp(6200),
      }),
      adminLine({
        name: 'Morning Coffee Set',
        variant: 'Grinder, server, 2 mugs',
        sku: 'HC-BUN-MCS',
        qty: 1,
        price: egp(2850),
        image: kettleImg,
      }),
    ],
  },
  {
    id: 'ord-260418-0012',
    number: 'HC-260418-0012',
    status: 'FULFILLED',
    customer: { name: 'Mariam Adel', email: 'mariam.adel@example.com' },
    placed: '18 Apr 2026',
    placedAt: '2026-04-18T11:30:00Z',
    updated: 'Shipped 19 Apr 2026',
    updatedAt: '2026-04-19T14:00:00Z',
    paidAt: '2026-04-18T11:35:00Z',
    subtotal: egp(6100),
    savings: egp(0),
    delivery: egp(120),
    tax: egp(744),
    total: egp(6964),
    itemCount: 2,
    paymentStatus: 'Paid',
    paymentMethod: 'Credit or debit card · Card ending 4242',
    shipMethod: 'Standard delivery · EGP 120',
    tracking: 'TRK 5830 2917 43',
    shippedOn: '19 Apr 2026',
    lines: [
      adminLine({
        name: 'Enamelled Cast-Iron Casserole',
        variant: 'Terracotta · 24 cm',
        sku: 'HC-CI-CAS-24-TER',
        qty: 1,
        price: egp(4850),
        image: casseroleImg,
      }),
      adminLine({
        name: 'Olive Wood Serving Board, Large',
        variant: '45 × 22 cm',
        sku: 'HC-OW-SB-45',
        qty: 1,
        price: egp(1250),
      }),
    ],
  },
  {
    id: 'ord-260415-0033',
    number: 'HC-260415-0033',
    status: 'PAYMENT_FAILED',
    statusReason: 'Card declined by provider',
    customer: { name: 'Khaled Nassar', email: 'khaled.nassar@example.com' },
    placed: '15 Apr 2026',
    placedAt: '2026-04-15T16:20:00Z',
    updated: 'Payment failed',
    updatedAt: '2026-04-15T16:25:00Z',
    subtotal: egp(2390),
    savings: egp(0),
    delivery: egp(120),
    tax: egp(301),
    total: egp(2811),
    itemCount: 1,
    paymentStatus: 'Payment failed',
    paymentMethod: '—',
    shipMethod: '—',
    lines: [
      adminLine({
        name: 'Pour-Over Kettle, 1 L',
        variant: 'Brushed steel',
        sku: 'HC-ST-KTL-1L',
        qty: 1,
        price: egp(2390),
        image: kettleImg,
      }),
    ],
  },
] as const;

/* ------------------------------------------------------------------ *
 * Pre-orders
 * ------------------------------------------------------------------ */

export interface F05PreOrder {
  id: string;
  number: string;
  status: PreOrderStatus;
  statusReason?: string;
  customer: { name: string; email: string };
  placed: string;
  placedAt: string;
  name: string;
  variant: string;
  sku: string;
  qty: number;
  price: Money;
  restock?: string;
  paymentWindow?: string;
  convertedOrder?: string;
}

export const f05PreOrders: F05PreOrder[] = [
  {
    id: 'po-260402-0031',
    number: 'PO-260402-0031',
    status: 'AWAITING_STOCK',
    customer: { name: 'Mariam Adel', email: 'mariam.adel@example.com' },
    placed: '2 Apr 2026',
    placedAt: '2026-04-02T11:42:00Z',
    name: 'Pour-Over Kettle, 1 L',
    variant: 'Brushed steel',
    sku: 'HC-ST-KTL-1L',
    qty: 1,
    price: egp(2390),
    restock: 'Expected back in stock: date not confirmed yet',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Returns
 * ------------------------------------------------------------------ */

export interface F05ReturnLine {
  name: string;
  variant: string;
  qty: number;
  amount: Money;
}

export interface F05Return {
  id: string;
  number: string;
  orderNumber: string;
  orderDate: string;
  customer: { name: string; email: string };
  status: ReturnStatus;
  statusReason?: string;
  requested: string;
  requestedAt: string;
  decidedAt?: string;
  items: F05ReturnLine[];
  total: Money;
  reason?: string;
  details?: string;
  refundStatus?: string;
  refundAmount?: Money;
  refundNote?: string;
}

export const f05Returns: F05Return[] = [
  {
    id: 'ret-260422-001',
    number: 'RET-260422-001',
    orderNumber: 'HC-260418-0012',
    orderDate: '22 Apr 2026',
    customer: { name: 'Mariam Adel', email: 'mariam.adel@example.com' },
    status: 'REQUESTED',
    requested: 'Requested 22 Apr 2026',
    requestedAt: '2026-04-22T10:00:00Z',
    items: [
      { name: 'Olive Wood Serving Board, Large', variant: '45 × 22 cm', qty: 1, amount: egp(1250) },
    ],
    total: egp(1250),
    reason: 'Damaged on arrival',
    details: 'The board arrived with a chip on one corner.',
    refundStatus: 'PENDING',
  },
  {
    id: 'ret-260420-002',
    number: 'RET-260420-002',
    orderNumber: 'HC-260421-0047',
    orderDate: '23 Apr 2026',
    customer: { name: 'Omar Salah', email: 'omar.salah@example.com' },
    status: 'APPROVED',
    requested: 'Requested 23 Apr 2026',
    requestedAt: '2026-04-23T09:00:00Z',
    decidedAt: '2026-04-24T10:00:00Z',
    items: [
      {
        name: 'Stoneware Dinner Plates, Set of 4',
        variant: '27 cm · Oat',
        qty: 1,
        amount: egp(1680),
      },
    ],
    total: egp(1680),
    reason: 'Wrong item sent',
    details: 'Received bakeware instead of tableware.',
    refundStatus: 'SUCCEEDED',
    refundAmount: egp(1680),
    refundNote: 'Refunded to original payment method.',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

export interface F05Review {
  id: string;
  productId: string;
  productName: string;
  productVariant: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  createdAt: string;
  moderatedAt?: string;
  moderationReason?: string;
}

export const f05Reviews: F05Review[] = [
  {
    id: 'rev-260425-001',
    productId: 'prod-casserole',
    productName: 'Enamelled Cast-Iron Casserole',
    productVariant: 'Terracotta · 24 cm',
    orderId: 'ord-260418-0012',
    orderNumber: 'HC-260418-0012',
    customerName: 'Mariam A.',
    rating: 5,
    title: 'Excellent heat retention',
    body: 'Keeps a stew simmering for hours and goes straight from hob to table.',
    status: 'APPROVED',
    verifiedPurchase: true,
    createdAt: '2026-04-20T09:00:00Z',
    moderatedAt: '2026-04-20T14:30:00Z',
  },
  {
    id: 'rev-260426-002',
    productId: 'prod-casserole',
    productName: 'Enamelled Cast-Iron Casserole',
    productVariant: 'Sage · 28 cm',
    orderId: 'ord-260421-0047',
    orderNumber: 'HC-260421-0047',
    customerName: 'Omar S.',
    rating: 4,
    title: 'Heavy but worth it',
    body: 'Very heavy, as expected for cast iron. Beautiful colour.',
    status: 'PENDING',
    verifiedPurchase: true,
    createdAt: '2026-04-26T11:00:00Z',
  },
  {
    id: 'rev-260427-003',
    productId: 'prod-kettle',
    productName: 'Pour-Over Kettle, 1 L',
    productVariant: 'Brushed steel',
    orderId: 'ord-260415-0033',
    orderNumber: 'HC-260415-0033',
    customerName: 'Khaled N.',
    rating: 1,
    title: 'Never arrived',
    body: 'Payment failed and I never received the item.',
    status: 'REJECTED',
    verifiedPurchase: false,
    createdAt: '2026-04-27T10:00:00Z',
    moderatedAt: '2026-04-27T11:00:00Z',
    moderationReason: 'Not a verified purchase — order was not paid.',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export interface F05Notification {
  id: string;
  kind: 'order' | 'payment' | 'pre-order' | 'return' | 'review' | 'security';
  title: string;
  body: string;
  status: NotificationStatus;
  time: string;
  retryable: boolean;
}

export const f05Notifications: F05Notification[] = [
  {
    id: 'ntf-1',
    kind: 'order',
    title: 'Your order HC-260421-0047 has shipped',
    body: 'Your items are on their way. You’ll get delivery updates here.',
    status: 'DELIVERED',
    time: '22 Apr 2026',
    retryable: false,
  },
  {
    id: 'ntf-2',
    kind: 'payment',
    title: 'Payment failed for order HC-260415-0033',
    body: 'Card declined by provider. No payment was taken.',
    status: 'FAILED',
    time: '15 Apr 2026',
    retryable: true,
  },
  {
    id: 'ntf-3',
    kind: 'review',
    title: 'Your review was published',
    body: 'Your review of Enamelled Cast-Iron Casserole is now live.',
    status: 'DELIVERED',
    time: '20 Apr 2026',
    retryable: false,
  },
] as const;

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export interface F05Customer {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
  orderCount: number;
  reviewCount: number;
  shipmentCount: number;
  returnCount: number;
  createdAt: string;
}

export const f05Customers: F05Customer[] = [
  {
    id: 'cust-1',
    name: 'Mariam Adel',
    email: 'mariam.adel@example.com',
    role: 'CUSTOMER',
    orderCount: 2,
    reviewCount: 2,
    shipmentCount: 2,
    returnCount: 1,
    createdAt: '10 Mar 2026',
  },
  {
    id: 'cust-2',
    name: 'Omar Salah',
    email: 'omar.salah@example.com',
    role: 'CUSTOMER',
    orderCount: 1,
    reviewCount: 1,
    shipmentCount: 1,
    returnCount: 1,
    createdAt: '12 Mar 2026',
  },
  {
    id: 'cust-3',
    name: 'Khaled Nassar',
    email: 'khaled.nassar@example.com',
    role: 'CUSTOMER',
    orderCount: 1,
    reviewCount: 1,
    shipmentCount: 0,
    returnCount: 0,
    createdAt: '14 Mar 2026',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Shipments
 * ------------------------------------------------------------------ */

export interface F05ShipmentEvent {
  title: string;
  place: string;
  time: string;
}

export interface F05Shipment {
  id: string;
  orderId: string;
  orderNumber: string;
  status: ShipmentStatus;
  statusReason?: string;
  carrier: string;
  method: string;
  trackingNo?: string;
  events: F05ShipmentEvent[];
}

export const f05Shipments: F05Shipment[] = [
  {
    id: 'shp-260418-0012',
    orderId: 'ord-260418-0012',
    orderNumber: 'HC-260418-0012',
    status: 'DELIVERED',
    carrier: 'Nordhaven courier',
    method: 'Standard delivery',
    trackingNo: 'TRK 5830 2917 43',
    events: [
      { title: 'Prepared', place: 'Nordhaven warehouse, Cairo', time: '18 Apr 2026, 10:12' },
      { title: 'Packed', place: 'Nordhaven warehouse, Cairo', time: '18 Apr 2026, 11:05' },
      { title: 'Handed over', place: 'Cairo depot', time: '18 Apr 2026, 14:02' },
      { title: 'Delivered', place: 'Zamalek, Cairo', time: '19 Apr 2026, 10:30' },
    ],
  },
] as const;

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

export interface F05InventoryRow {
  sku: string;
  name: string;
  variant: string;
  onHand: number;
  reserved: number;
  available: number;
  low: boolean;
}

export const f05Inventory: F05InventoryRow[] = [
  {
    sku: 'HC-CI-CAS-24-TER',
    name: 'Enamelled Cast-Iron Casserole',
    variant: 'Terracotta · 24 cm',
    onHand: 12,
    reserved: 1,
    available: 11,
    low: false,
  },
  {
    sku: 'HC-CI-CAS-28-TER',
    name: 'Enamelled Cast-Iron Casserole',
    variant: 'Terracotta · 28 cm',
    onHand: 8,
    reserved: 0,
    available: 8,
    low: false,
  },
  {
    sku: 'HC-CI-CAS-24-SAG',
    name: 'Enamelled Cast-Iron Casserole',
    variant: 'Sage · 24 cm',
    onHand: 3,
    reserved: 0,
    available: 3,
    low: true,
  },
  {
    sku: 'HC-CI-CAS-28-SAG',
    name: 'Enamelled Cast-Iron Casserole',
    variant: 'Sage · 28 cm',
    onHand: 0,
    reserved: 0,
    available: 0,
    low: false,
  },
  {
    sku: 'HC-SW-DSH-30-OAT',
    name: 'Stoneware Dinner Plates, Set of 4',
    variant: '27 cm · Oat',
    onHand: 12,
    reserved: 1,
    available: 11,
    low: false,
  },
  {
    sku: 'HC-ST-KTL-1L',
    name: 'Pour-Over Kettle, 1 L',
    variant: 'Brushed steel',
    onHand: 0,
    reserved: 1,
    available: 0,
    low: false,
  },
] as const;

export interface F05InventoryMovement {
  id: string;
  sku: string;
  type: InventoryMovementType;
  quantity: number;
  reason?: string;
  createdAt: string;
}

export const f05InventoryMovements: F05InventoryMovement[] = [
  {
    id: 'mov-1',
    sku: 'HC-CI-CAS-24-SAG',
    type: 'RESERVATION',
    quantity: -1,
    reason: 'Pre-order PO-260409-0017',
    createdAt: '9 Apr 2026, 16:20',
  },
  {
    id: 'mov-2',
    sku: 'HC-CI-CAS-24-TER',
    type: 'ADJUSTMENT',
    quantity: 5,
    reason: 'Restock received',
    createdAt: '5 Apr 2026, 09:00',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Bundles
 * ------------------------------------------------------------------ */

export interface F05Bundle {
  id: string;
  slug: string;
  kind: BundleKind;
  name: string;
  price: Money;
  inStock: boolean;
  stock: number;
  components: { name: string; qty: number }[];
}

export const f05Bundles: F05Bundle[] = [
  {
    id: 'bun-1',
    slug: 'the-first-kitchen-set',
    kind: 'fixed',
    name: 'The First Kitchen Set',
    price: egp(6200),
    inStock: true,
    stock: 6,
    components: [
      { name: 'Enamelled Cast-Iron Casserole', qty: 1 },
      { name: 'Olive Wood Serving Board', qty: 1 },
      { name: 'Linen Tea Towels', qty: 3 },
    ],
  },
  {
    id: 'bun-2',
    slug: 'morning-coffee-set',
    kind: 'dynamic',
    name: 'Morning Coffee Set',
    price: egp(2850),
    inStock: true,
    stock: 3,
    components: [
      { name: 'Hand Coffee Grinder', qty: 1 },
      { name: 'Glass Coffee Server', qty: 1 },
      { name: 'Stoneware Mugs', qty: 2 },
    ],
  },
] as const;

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

export interface F05AuditEvent {
  id: string;
  actor: 'ADMIN' | 'CUSTOMER' | 'SYSTEM';
  action: string;
  route: string;
  granted: boolean;
  createdAt: string;
}

export const f05AuditEvents: F05AuditEvent[] = [
  {
    id: 'aud-1',
    actor: 'ADMIN',
    action: 'read operational picture',
    route: '/admin',
    granted: true,
    createdAt: '22 Apr 2026, 09:15',
  },
  {
    id: 'aud-2',
    actor: 'CUSTOMER',
    action: 'read administrative route',
    route: '/admin/orders',
    granted: false,
    createdAt: '22 Apr 2026, 08:40',
  },
  {
    id: 'aud-3',
    actor: 'ADMIN',
    action: 'approve return RET-260420-002',
    route: '/admin/returns/ret-260420-002',
    granted: true,
    createdAt: '24 Apr 2026, 10:00',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Users / roles / MFA
 * ------------------------------------------------------------------ */

export interface F05AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN';
  mfaEnrolled: boolean;
  lastSeen: string;
}

export const f05AdminUsers: F05AdminUser[] = [
  {
    id: 'user-1',
    name: 'Admin Operator',
    email: 'admin@nordhaven.example',
    role: 'ADMIN',
    mfaEnrolled: true,
    lastSeen: '22 Apr 2026, 09:15',
  },
] as const;

/* ------------------------------------------------------------------ *
 * System states gallery
 * ------------------------------------------------------------------ */

export interface F05StateRow {
  area: string;
  state: string;
  meaning: string;
}

export const f05StateRows: F05StateRow[] = [
  { area: 'Orders', state: 'FULFILLED', meaning: 'Order paid, allocated and shipped.' },
  { area: 'Orders', state: 'PAYMENT_FAILED', meaning: 'Payment declined; no charge taken.' },
  {
    area: 'Pre-orders',
    state: 'AWAITING_STOCK',
    meaning: 'Placed, waiting for restock; no payment taken.',
  },
  { area: 'Pre-orders', state: 'AWAITING_PAYMENT', meaning: 'Back in stock; payment window open.' },
  { area: 'Returns', state: 'REQUESTED', meaning: 'Awaiting admin decision.' },
  { area: 'Returns', state: 'REFUNDED', meaning: 'Return received and refund succeeded.' },
  { area: 'Reviews', state: 'PENDING', meaning: 'Awaiting moderation.' },
  { area: 'Reviews', state: 'REJECTED', meaning: 'Not published; reason recorded.' },
  { area: 'Shipments', state: 'HANDED_OVER', meaning: 'With the courier.' },
  { area: 'Notifications', state: 'FAILED', meaning: 'Delivery attempt failed; retryable.' },
] as const;
