/**
 * Sample-data previews for checkout (Stage 3 checkout boards).
 *
 * NOT LIVE API DATA — the backend checkout contract (quotes, orders, payment
 * attempts) arrives in stage F06, so these typed records stand in. Everything
 * is clearly labelled sample data; nothing here implies stock was reserved or
 * a payment was processed.
 */

import type { StoreImage } from '../data/types';

function image(src: string, alt: string, width: number, height: number): StoreImage {
  return { src: `/images/${src}`, alt, width, height };
}

/** The products shown in the checkout order summary, derived from the cart
 *  sample lines (the same records the cart page shows). */
export const checkoutItems = [
  {
    name: 'Enamelled Cast-Iron Casserole',
    variant: 'Terracotta · 24 cm',
    sku: 'SKU HC-CI-CAS-24-TER',
    qty: 1,
    price: 4850,
    was: 5700,
    image: image('cookware-casserole.webp', 'Enamelled Cast-Iron Casserole, Terracotta', 720, 900),
  },
  {
    name: 'Stoneware Dinner Plates, Set of 4',
    variant: '27 cm · Oat',
    qty: 2,
    unitPrice: 1680,
    price: 3360,
    image: image('tableware-plates.webp', 'Stoneware dinner plates, oat', 720, 900),
  },
  {
    name: 'The First Kitchen Set',
    variant: 'Ready-packed set',
    sku: 'SKU HC-BUN-FKS',
    qty: 1,
    price: 6200,
    image: image('bundle-first-kitchen-set.webp', 'The First Kitchen Set bundle', 720, 900),
  },
  {
    name: 'Morning Coffee Set',
    variant: 'Grinder, server, 2 mugs',
    sku: 'SKU HC-BUN-MCS',
    qty: 1,
    price: 2850,
    image: image('bundle-morning-coffee-set.webp', 'Morning Coffee Set bundle', 720, 900),
  },
] as const;

/** Totals mirroring the boards' order confirmation (5 items). */
export const checkoutTotals = {
  itemsCount: 5,
  subtotal: 17260,
  savings: 850,
  delivery: 120,
  tax: 1210,
  total: 18590,
} as const;

/** Shipping methods offered at checkout (illustrative fees — confirmed at
 *  order creation, not reserved here). */
export const shippingMethods = [
  {
    code: 'standard',
    label: 'Standard delivery',
    desc: '3–5 business days',
    price: 120,
    default: true,
  },
  {
    code: 'express',
    label: 'Express delivery',
    desc: '1–2 business days',
    price: 250,
    default: false,
  },
  {
    code: 'pickup',
    label: 'Store pickup',
    desc: 'Free — Nordhaven showroom, Cairo',
    price: 0,
    default: false,
  },
] as const;

/** Payment methods offered at checkout. Card details go to the payment
 *  provider and are never stored by Nordhaven Commerce (per the boards). */
export const paymentMethods = [
  {
    code: 'card',
    label: 'Credit or debit card',
    desc: 'Card ending · Paid',
    hint: 'Card details are entered securely with our payment provider. Your card number goes directly to them and is not stored by Nordhaven Commerce.',
  },
  {
    code: 'wallet',
    label: 'Wallet',
    desc: 'Mobile wallet approval',
    hint: 'After you place your order, you’ll get a request to approve the payment in your wallet app.',
  },
  {
    code: 'cod',
    label: 'Cash on delivery',
    desc: 'Pay the courier on delivery',
    hint: 'The courier may not carry change. Have the exact amount ready.',
  },
] as const;

/** The sample order number and date shown on the confirmation board. */
export const orderSample = {
  number: 'HC-260421-0047',
  placed: 'Placed 21 Apr 2026',
  status: 'Paid',
} as const;
