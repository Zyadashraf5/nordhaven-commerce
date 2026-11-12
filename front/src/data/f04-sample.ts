/**
 * Shared F04 demo data — orders, pre-orders, returns, reviews, notifications
 * and shipments.
 *
 * NOT LIVE API DATA — the backend contracts for orders, pre-orders, returns,
 * reviews, notifications and shipments arrive in stage F06. These typed
 * records mirror the approved Stage 4 boards and the backend state enums
 * (read from openapi.json) so components can be replaced by live responses
 * without changing a single component. Everything is clearly labelled sample
 * data; no payment, refund, shipment carrier or email/SMS delivery is real.
 *
 * Records are consistent across screens: the same order/pre-order/return ids,
 * dates and amounts appear on the list, the detail and the tracking views.
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

/* ------------------------------------------------------------------ *
 * Shared identity (boards: Mariam Adel)
 * ------------------------------------------------------------------ */

export const f04Identity = {
  name: 'Mariam Adel',
  email: 'mariam.adel@example.com',
  phone: '+20 100 000 0000',
} as const;

export const f04Address = {
  label: 'Home',
  name: 'Mariam Adel',
  line1: '14 Example Street, Apartment 6',
  line2: 'Zamalek, Cairo 11211, Egypt',
  phone: '+20 100 000 0000',
} as const;

/* ------------------------------------------------------------------ *
 * Money helpers
 * ------------------------------------------------------------------ */

export interface F04OrderLine {
  name: string;
  variant?: string;
  sku: string;
  qty: number;
  price: Money;
  lineTotal: Money;
  image: { src: string; alt: string; width: number; height: number };
  returnNote?: string;
  bundleLabel?: string;
  includes?: string;
}

function line(
  overrides: Partial<F04OrderLine> & {
    image?: { src: string; alt: string; width: number; height: number };
  },
): F04OrderLine {
  const base: F04OrderLine = {
    name: 'Sample product',
    variant: '',
    sku: 'SKU HC-SAMPLE',
    qty: 1,
    price: egp(0),
    lineTotal: egp(0),
    image: {
      src: '/images/cookware-casserole.webp',
      alt: 'Sample product',
      width: 720,
      height: 900,
    },
    ...overrides,
  };
  if (overrides.image) base.image = overrides.image;
  base.lineTotal = egp((base.price.amountMinor / 100) * base.qty);
  return base;
}

/* ------------------------------------------------------------------ *
 * Orders (boards: Orders desktop / mobile / tablet, order detail RTL)
 * ------------------------------------------------------------------ */

export interface F04Order {
  id: string;
  number: string;
  status: OrderStatus;
  statusReason?: string;
  placed: string; // display
  placedAt: string; // ISO
  updated: string;
  updatedAt: string;
  paidAt?: string;
  cancelledAt?: string;
  expiresAt?: string;
  subtotal: Money;
  savings: Money; // offer discount
  delivery: Money;
  tax: Money;
  total: Money;
  refunded: Money;
  itemCount: number;
  note?: string; // e.g. stock-cap message
  actLabel?: string; // list action label
  paymentStatus: string;
  paymentMethod: string;
  paymentNote?: string;
  shipMethod: string;
  tracking?: string;
  shippedOn?: string;
  hold?: string; // "Your items are held for ..."
  msgTitle?: string;
  msgBody?: string;
  lines: F04OrderLine[];
}

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
const boardImg = {
  src: '/images/bundle-first-kitchen-set.webp',
  alt: 'The First Kitchen Set bundle',
  width: 720,
  height: 900,
};
const kettleImg = {
  src: '/images/kettle-pourover.webp',
  alt: 'Pour-Over Kettle, 1 L, brushed steel',
  width: 720,
  height: 900,
};

export const f04Orders: F04Order[] = [
  {
    id: 'ord-260421-0047',
    number: 'HC-260421-0047',
    status: 'FULFILLED',
    placed: 'Placed 21 Apr 2026',
    placedAt: '2026-04-21T10:00:00Z',
    updated: 'Shipped 22 Apr 2026',
    updatedAt: '2026-04-22T09:00:00Z',
    paidAt: '2026-04-21T10:05:00Z',
    subtotal: egp(17260),
    savings: egp(850),
    delivery: egp(120),
    tax: egp(1210),
    total: egp(18590),
    refunded: egp(0),
    itemCount: 5,
    paymentStatus: 'Paid',
    paymentMethod: 'Credit or debit card · Card ending 4242',
    shipMethod: 'Standard delivery · EGP 120',
    tracking: 'TRK 5830 2917 44',
    shippedOn: 'Shipped 22 Apr 2026',
    lines: [
      line({
        name: 'Enamelled Cast-Iron Casserole',
        variant: 'Terracotta · 24 cm',
        sku: 'HC-CI-CAS-24-TER',
        qty: 1,
        price: egp(4850),
        image: casseroleImg,
      }),
      line({
        name: 'Stoneware Dinner Plates, Set of 4',
        variant: '27 cm · Oat',
        sku: 'HC-SW-DSH-30-OAT',
        qty: 2,
        price: egp(1680),
        image: platesImg,
      }),
      line({
        name: 'The First Kitchen Set',
        variant: 'Ready-packed set',
        sku: 'HC-SET-FIRST-01',
        qty: 1,
        price: egp(6200),
        image: boardImg,
        bundleLabel: 'Ready-packed set',
        includes: '3 items · ships as one box',
      }),
      line({
        name: 'Morning Coffee Set',
        variant: 'Grinder, server, 2 mugs',
        sku: 'HC-BUN-MCS',
        qty: 1,
        price: egp(2850),
        image: kettleImg,
        bundleLabel: 'Set of individual items',
        includes: '3 items · each checked for stock',
      }),
    ],
  },
  {
    id: 'ord-260418-0012',
    number: 'HC-260418-0012',
    status: 'FULFILLED',
    placed: 'Placed 18 Apr 2026',
    placedAt: '2026-04-18T11:30:00Z',
    updated: 'Shipped 19 Apr 2026',
    updatedAt: '2026-04-19T14:00:00Z',
    paidAt: '2026-04-18T11:35:00Z',
    subtotal: egp(6100),
    savings: egp(0),
    delivery: egp(120),
    tax: egp(744),
    total: egp(6964),
    refunded: egp(0),
    itemCount: 2,
    paymentStatus: 'Paid',
    paymentMethod: 'Credit or debit card · Card ending 4242',
    shipMethod: 'Standard delivery · EGP 120',
    tracking: 'TRK 5830 2917 43',
    shippedOn: 'Shipped 19 Apr 2026',
    lines: [
      line({
        name: 'Enamelled Cast-Iron Casserole',
        variant: 'Terracotta · 24 cm',
        sku: 'HC-CI-CAS-24-TER',
        qty: 1,
        price: egp(4850),
        image: casseroleImg,
      }),
      line({
        name: 'Olive Wood Serving Board, Large',
        variant: '45 × 22 cm',
        sku: 'HC-OW-SB-45',
        qty: 1,
        price: egp(1250),
        image: boardImg,
      }),
    ],
  },
  {
    id: 'ord-260415-0033',
    number: 'HC-260415-0033',
    status: 'PAYMENT_FAILED',
    statusReason: 'Card declined by provider',
    placed: 'Placed 15 Apr 2026',
    placedAt: '2026-04-15T16:20:00Z',
    updated: 'Payment failed',
    updatedAt: '2026-04-15T16:25:00Z',
    subtotal: egp(2390),
    savings: egp(0),
    delivery: egp(120),
    tax: egp(301),
    total: egp(2811),
    refunded: egp(0),
    itemCount: 1,
    note: 'Your payment didn’t go through. No payment was taken.',
    actLabel: 'Pay again',
    paymentStatus: 'Payment failed',
    paymentMethod: '—',
    shipMethod: '—',
    lines: [
      line({
        name: 'Pour-Over Kettle, 1 L',
        variant: 'Brushed steel',
        sku: 'HC-ST-KTL-1L',
        qty: 1,
        price: egp(2390),
        image: kettleImg,
      }),
    ],
  },
  {
    id: 'ord-260410-0021',
    number: 'HC-260410-0021',
    status: 'CANCELLED',
    statusReason: 'Cancelled by you',
    placed: 'Placed 10 Apr 2026',
    placedAt: '2026-04-10T09:15:00Z',
    updated: 'Cancelled 12 Apr 2026',
    updatedAt: '2026-04-12T10:00:00Z',
    cancelledAt: '2026-04-12T10:00:00Z',
    subtotal: egp(1150),
    savings: egp(0),
    delivery: egp(120),
    tax: egp(154),
    total: egp(1424),
    refunded: egp(1424),
    itemCount: 1,
    paymentStatus: 'Refunded',
    paymentMethod: 'Refunded to original payment method',
    shipMethod: '—',
    lines: [
      line({
        name: 'Stoneware Baking Dish, 30 cm',
        variant: 'Oat glaze',
        sku: 'HC-SW-BD-30',
        qty: 1,
        price: egp(1150),
        image: platesImg,
      }),
    ],
  },
] as const;

/* ------------------------------------------------------------------ *
 * Pre-orders (boards: Pre-orders desktop / mobile, product state gallery)
 * ------------------------------------------------------------------ */

export interface F04PreOrder {
  id: string;
  number: string;
  status: PreOrderStatus;
  statusReason?: string;
  placed: string;
  placedAt: string;
  name: string;
  variant: string;
  sku: string;
  qty: number;
  price: Money;
  image: { src: string; alt: string; width: number; height: number };
  restock?: string; // "Expected back in stock: date not confirmed yet" / date
  paymentWindow?: string; // "Complete payment by 24 Apr 2026, 18:00"
  convertedOrder?: string; // HC- number when paid
  convertedAt?: string;
}

export const f04PreOrders: F04PreOrder[] = [
  {
    id: 'po-260402-0031',
    number: 'PO-260402-0031',
    status: 'AWAITING_STOCK',
    placed: 'Placed 2 Apr 2026',
    placedAt: '2026-04-02T11:42:00Z',
    name: 'Pour-Over Kettle, 1 L',
    variant: 'Brushed steel',
    sku: 'HC-ST-KTL-1L',
    qty: 1,
    price: egp(2390),
    image: kettleImg,
    restock: 'Expected back in stock: date not confirmed yet',
  },
  {
    id: 'po-260409-0017',
    number: 'PO-260409-0017',
    status: 'CANCELLED',
    statusReason: 'Cancelled by you',
    placed: 'Placed 9 Apr 2026',
    placedAt: '2026-04-09T16:20:00Z',
    name: 'Enamelled Cast-Iron Casserole',
    variant: 'Cream · 28 cm',
    sku: 'HC-CI-CAS-28-CR',
    qty: 1,
    price: egp(5950),
    image: casseroleImg,
    restock: 'Cancelled by you 21 Apr 2026',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Returns (boards: Returns desktop / mobile / tablet)
 * ------------------------------------------------------------------ */

export interface F04ReturnLine {
  name: string;
  variant: string;
  qty: number;
  amount: Money;
  outcome?: string; // e.g. "Refund approved"
}

export interface F04Return {
  id: string;
  number: string;
  orderNumber: string;
  orderDate: string;
  status: ReturnStatus;
  statusReason?: string;
  requested: string;
  requestedAt: string;
  decidedAt?: string;
  items: F04ReturnLine[];
  total: Money;
  reason?: string;
  details?: string;
  photos: { name: string }[];
  refundStatus?: string;
  refundAmount?: Money;
  refundNote?: string;
  messageTitle?: string;
  messageBody?: string;
}

export const f04Returns: F04Return[] = [
  {
    id: 'ret-260422-001',
    number: 'RET-260422-001',
    orderNumber: 'HC-260418-0012',
    orderDate: '22 Apr 2026',
    status: 'REQUESTED',
    requested: 'Requested 22 Apr 2026',
    requestedAt: '2026-04-22T10:00:00Z',
    items: [
      {
        name: 'Olive Wood Serving Board, Large',
        variant: '45 × 22 cm',
        qty: 1,
        amount: egp(1250),
      },
    ],
    total: egp(1250),
    reason: 'Damaged on arrival',
    details: 'The board arrived with a chip on one corner.',
    photos: [{ name: 'board-chip.jpg' }],
    messageTitle: 'We’re reviewing your request',
    messageBody:
      'We’ll tell you in your account notifications. If it’s approved, you’ll get instructions for sending the items back.',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Reviews (boards: Reviews desktop / mobile / tablet)
 * ------------------------------------------------------------------ */

export interface F04Review {
  id: string;
  productId: string;
  productName: string;
  productVariant: string;
  orderId: string;
  orderNumber: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  createdAt: string;
  moderatedAt?: string;
  moderationReason?: string;
  images: { src: string; alt: string }[];
}

export const f04Reviews: F04Review[] = [
  {
    id: 'rev-260425-001',
    productId: 'prod-casserole',
    productName: 'Enamelled Cast-Iron Casserole',
    productVariant: 'Terracotta · 24 cm',
    orderId: 'ord-260418-0012',
    orderNumber: 'HC-260418-0012',
    rating: 5,
    title: 'Excellent heat retention',
    body: 'Keeps a stew simmering for hours and goes straight from hob to table.',
    status: 'APPROVED',
    verifiedPurchase: true,
    createdAt: '2026-04-20T09:00:00Z',
    moderatedAt: '2026-04-20T14:30:00Z',
    images: [],
  },
  {
    id: 'rev-260426-002',
    productId: 'prod-casserole',
    productName: 'Enamelled Cast-Iron Casserole',
    productVariant: 'Sage · 28 cm',
    orderId: 'ord-260421-0047',
    orderNumber: 'HC-260421-0047',
    rating: 4,
    title: 'Heavy but worth it',
    body: 'Very heavy, as expected for cast iron. Beautiful colour.',
    status: 'PENDING',
    verifiedPurchase: true,
    createdAt: '2026-04-26T11:00:00Z',
    images: [],
  },
] as const;

/* ------------------------------------------------------------------ *
 * Notifications (boards: Notifications desktop / mobile / tablet)
 * ------------------------------------------------------------------ */

export interface F04Notification {
  id: string;
  kind: 'order' | 'payment' | 'pre-order' | 'return' | 'review' | 'security';
  title: string;
  body: string;
  tag?: string; // e.g. "Order"
  catLabel?: string; // category label
  status: NotificationStatus;
  time: string; // display
  unread: boolean;
  action?: string; // link text
  actionHref?: string;
}

export const f04Notifications: F04Notification[] = [
  {
    id: 'ntf-1',
    kind: 'order',
    title: 'Your order HC-260421-0047 has shipped',
    body: 'Your items are on their way. You’ll get delivery updates here.',
    tag: 'Order',
    status: 'DELIVERED',
    time: '22 Apr 2026',
    unread: false,
    action: 'View order',
    actionHref: '/account/orders/ord-260421-0047',
  },
  {
    id: 'ntf-2',
    kind: 'review',
    title: 'Your review was published',
    body: 'Your review of Enamelled Cast-Iron Casserole is now live on the product page.',
    tag: 'Review',
    status: 'DELIVERED',
    time: '20 Apr 2026',
    unread: true,
    action: 'See it',
    actionHref: '/products/enamelled-cast-iron-casserole',
  },
  {
    id: 'ntf-3',
    kind: 'pre-order',
    title: 'Your Pour-Over Kettle is back in stock',
    body: "We've set one aside for you. Pay now to confirm your pre-order.",
    tag: 'Pre-order',
    status: 'DELIVERED',
    time: '20 Apr 2026',
    unread: true,
    action: 'View pre-order',
    actionHref: '/account/pre-orders',
  },
] as const;

/* ------------------------------------------------------------------ *
 * Shipments (boards: Shipment tracking desktop / mobile)
 * ------------------------------------------------------------------ */

export interface F04ShipmentEvent {
  title: string;
  place: string;
  time: string;
}

export interface F04Shipment {
  id: string;
  orderId: string;
  orderNumber: string;
  status: ShipmentStatus;
  statusReason?: string;
  heroLabel: string;
  heroDesc: string;
  estimate?: string; // courier's estimated delivery
  updated?: string; // last scan
  trackingNo?: string;
  carrier: string;
  method: string;
  events: F04ShipmentEvent[];
  delay?: boolean;
  exception?: boolean;
  supportCase?: { id: string; agent: string; note: string };
}

export const f04Shipments: F04Shipment[] = [
  {
    id: 'shp-260418-0012',
    orderId: 'ord-260418-0012',
    orderNumber: 'HC-260418-0012',
    status: 'DELIVERED',
    heroLabel: 'Delivered',
    heroDesc: 'Your parcel was delivered on 19 Apr 2026.',
    estimate: '19 Apr 2026',
    trackingNo: 'TRK 5830 2917 43',
    carrier: 'Nordhaven courier',
    method: 'Standard delivery',
    events: [
      { title: 'Prepared', place: 'Nordhaven warehouse, Cairo', time: '18 Apr 2026, 10:12' },
      { title: 'Packed', place: 'Nordhaven warehouse, Cairo', time: '18 Apr 2026, 11:05' },
      { title: 'Handed over', place: 'Cairo depot', time: '18 Apr 2026, 14:02' },
      { title: 'Delivered', place: 'Zamalek, Cairo', time: '19 Apr 2026, 10:30' },
    ],
  },
] as const;

/* ------------------------------------------------------------------ *
 * Ready to review (boards: Reviews My reviews)
 * ------------------------------------------------------------------ */

export interface F04ReadyToReview {
  name: string;
  variant: string;
  orderNumber: string;
  delivered: string;
}

export const f04ReadyToReview: F04ReadyToReview[] = [
  {
    name: 'Pour-Over Kettle, 1 L',
    variant: 'Brushed steel',
    orderNumber: 'HC-260421-0047',
    delivered: '22 Apr 2026',
  },
] as const;
