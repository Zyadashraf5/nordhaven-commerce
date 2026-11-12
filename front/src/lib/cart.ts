import { formatMoney } from '../data/money';
import type { Money, StoreImage } from '../data/types';

/**
 * The cart presentation engine (Stage 3 cart boards).
 *
 * Pure functions + message builders: no React, no fetch. The demo cart pages
 * feed this module with typed sample items; when the real cart contract
 * lands (stage F06) the same engine runs on API lines.
 *
 * Sample prices are plain whole-EGP amounts (the boards quote EGP 4,850 and
 * friends); they are turned into the minor-unit `Money` contract only at the
 * formatting edge. No line here ever implies inventory was reserved: the
 * reserve happens at order creation on the backend, later stages.
 */

export type CartLineKind = 'product' | 'fixed' | 'dynamic';

/** "What's in the box" row of a fixed set (one packed-goods SKU). */
export interface PackedBoxRow {
  name: string;
  variant: string;
  /** "× 1" */
  qtyText: string;
  image: StoreImage;
}

/** One predefined component of a dynamic set. Availability derives from it. */
export interface SetComponentRow {
  name: string;
  variant: string;
  /** Short variant for the narrow layout. */
  variantShort?: string | undefined;
  image?: StoreImage | undefined;
  /** How many of this component one set needs. */
  perSet: number;
  /** Component stock. A set is available while stock ≥ perSet × qty for all. */
  stock: number;
}

/** A cart catalog entry (product or set) as the cart needs it. */
export interface CartCatalogItem {
  key: string;
  kind: CartLineKind;
  name: string;
  /** Shorter name used by the narrow layout. */
  nameShort: string;
  variant: string;
  variantShort: string;
  sku: string;
  href: string;
  image: StoreImage;
  /** Sample prices are whole EGP; converted to minor units when formatted. */
  priceEgp: number;
  wasEgp?: number | undefined;
  /** Sellable units of this line (for sets: usable sets). */
  stock: number;
  /** Board's low-stock line shows the count ("Only 3 left"). */
  low?: boolean | undefined;
  /** Fixed set only: the packed box contents. */
  packedBox?: PackedBoxRow[] | undefined;
  /** Dynamic set only: the predefined components. */
  components?: SetComponentRow[] | undefined;
  /** Set when the price rose since the item was added (review notice). */
  priceChangedFromEgp?: number | undefined;
  /**
   * Live cart (F06): the public API exposes no stock figure, so availability
   * is decided at checkout. `stock` is then only the API's quantity ceiling,
   * and the line shows "Availability confirmed at checkout" instead of a count.
   */
  stockKnown?: false | undefined;
  /** Live cart: why the line can't be bought (e.g. the product was unpublished). */
  unavailableReason?: { title: string; body: string } | undefined;
}

export interface CartLineSpec {
  key: string;
  qty: number;
}

/* ------------------------------------------------------------------ *
 * Line resolution
 * ------------------------------------------------------------------ */

export type AvailabilityTone = 'ok' | 'low' | 'out' | 'unknown';

export interface ResolvedSetComponent {
  component: SetComponentRow;
  ok: boolean;
  /** "× 2" for the current quantity. */
  qtyText: string;
  /** "In stock" / "Out of stock". */
  status: string;
  /** "2 per set", only when the set needs more than one. */
  perText: string | null;
}

export interface ResolvedCartLine {
  item: CartCatalogItem;
  spec: CartLineSpec;
  maxQty: number;
  available: boolean;
  /** Availability status label: text for the page. */
  availability: { tone: AvailabilityTone; text: string };
  atMax: boolean;
  maxText: string | null;
  /** Line totals, formatted ("EGP 9,700"). */
  total: string;
  wasTotal: string | null;
  saveText: string | null;
  /** "EGP 1,680 each" — only while available with qty > 1. */
  each: string | null;
  /** "Price updated since you added it: was …, now …". */
  priceChangeNote: string | null;
  /** Out-of-stock explanation shown in the line. */
  unavailable: { title: string; body: string } | null;
  /** Fixed set: the packed box rows. */
  packedBox: PackedBoxRow[] | null;
  /** Dynamic set: per-component availability at the picked quantity. */
  components: ResolvedSetComponent[] | null;
  /** Accordion label: "What's in the box · 3 items · ships as one box". */
  setPanelLabel: string;
}

function money(amountEgp: number): Money {
  return { amountMinor: Math.round(amountEgp * 100), currency: 'EGP' };
}

function egp(amountEgp: number): string {
  return formatMoney(money(amountEgp));
}

/** How many sets of a dynamic item can be made for the picked quantity. */
function dynamicMax(item: CartCatalogItem): number {
  const components = item.components;
  if (components === undefined || components.length === 0) return item.stock;
  return Math.min(
    ...components.map((component) =>
      component.perSet <= 0 ? component.stock : Math.floor(component.stock / component.perSet),
    ),
  );
}

export function resolveCartLine(item: CartCatalogItem, spec: CartLineSpec): ResolvedCartLine {
  const isFixed = item.kind === 'fixed';
  const isDynamic = item.kind === 'dynamic';
  const qty = Math.max(1, spec.qty);

  const maxQty = isDynamic ? dynamicMax(item) : item.stock;
  const available = maxQty >= 1 && qty <= maxQty;
  const atMax = available && qty >= maxQty;

  /* Availability label per the boards. */
  let tone: AvailabilityTone = 'ok';
  let text = 'In stock';
  if (!available) {
    tone = 'out';
    text =
      item.unavailableReason !== undefined
        ? 'Not available'
        : isDynamic
          ? 'Set unavailable'
          : 'Out of stock';
  } else if (item.stockKnown === false) {
    tone = 'unknown';
    text = 'Availability confirmed at checkout';
  } else if (item.low) {
    tone = 'low';
    text = `Only ${item.stock} left`;
  } else if (isFixed) {
    text = 'In stock as a packed set';
  } else if (isDynamic) {
    text = `All ${item.components?.length ?? 0} items in stock`;
  }

  /* Stock ceiling hint (only the boards' three flavours). */
  let maxText: string | null = null;
  if (atMax && item.stockKnown === false) {
    maxText = `That’s the most one cart line can hold (${maxQty})`;
  } else if (atMax) {
    if (item.low) maxText = `You’ve added all ${maxQty} we have left`;
    else if (isDynamic) maxText = `That’s as many sets as we can make up right now (${maxQty})`;
    else maxText = `Only ${maxQty} available`;
  }

  /* Unavailable explanation. A dynamic set names the out-of-stock parts. */
  let unavailable: ResolvedCartLine['unavailable'] = null;
  if (!available) {
    const components = item.components;
    const outs = components === undefined ? [] : components.filter((c) => c.stock < c.perSet);
    if (item.unavailableReason !== undefined) {
      unavailable = item.unavailableReason;
    } else if (isDynamic && outs.length > 0) {
      unavailable = {
        title: `Unavailable — ${outs
          .map((c) => `${c.name} (${c.variant})`)
          .join(' and ')} is out of stock`,
        body: 'This set is made of individual items, so it can only be ordered while every item is in stock. It isn’t included in your total.',
      };
    } else {
      unavailable = {
        title: 'No longer available',
        body: 'We’ve run out of this item, so it isn’t included in your total. Move it to your wishlist to keep it for later.',
      };
    }
  }

  /* Per-component rows at the picked quantity. */
  const components =
    isDynamic && item.components !== undefined
      ? item.components.map((component) => {
          const needed = component.perSet * qty;
          const ok = component.stock >= needed;
          return {
            component,
            ok,
            qtyText: `× ${needed}`,
            status: ok ? 'In stock' : 'Out of stock',
            perText: component.perSet > 1 ? `${component.perSet} per set` : null,
          };
        })
      : null;

  /* Line money. An unavailable line shows its price struck through. */
  const total = egp(item.priceEgp * qty);
  const showWas = item.wasEgp !== undefined && available;
  const wasTotal = showWas ? egp((item.wasEgp ?? item.priceEgp) * qty) : null;
  const saveText =
    showWas && item.wasEgp !== undefined
      ? `You save ${egp((item.wasEgp - item.priceEgp) * qty)}`
      : null;
  const each = qty > 1 && available ? `${egp(item.priceEgp)} each` : null;

  /* Price-change review notice (the rising line). */
  const priceChangeNote =
    item.priceChangedFromEgp !== undefined && available
      ? `Price updated since you added it: was ${egp(item.priceChangedFromEgp)}, now ${egp(item.priceEgp)}`
      : null;

  const setPanelLabel = isFixed
    ? 'What’s in the box · 3 items · ships as one box'
    : isDynamic
      ? 'Items in this set · 3 items · each checked for stock'
      : '';

  return {
    item,
    spec,
    maxQty,
    available,
    availability: { tone, text },
    atMax,
    maxText,
    total,
    wasTotal,
    saveText,
    each,
    priceChangeNote,
    unavailable,
    packedBox: item.packedBox ?? null,
    components,
    setPanelLabel,
  };
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

export interface CartSummary {
  /** Sum of quantities over every line (header badge). */
  allCount: number;
  /** "5 items" (badge text). */
  itemsText: string;
  /** "Subtotal (5 items)". */
  subLabel: string;
  subtotal: string;
  discount: string | null;
  /** Estimated total. Prices are illustrative in this milestone. */
  total: string;
  blocked: boolean;
  blockTitle: string;
  blockText: string;
  excludedText: string | null;
}

export function summariseCart(items: CartCatalogItem[], lines: CartLineSpec[]): CartSummary {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const resolved = lines
    .map((spec) => {
      const item = byKey.get(spec.key);
      return item === undefined ? null : resolveCartLine(item, spec);
    })
    .filter((line): line is ResolvedCartLine => line !== null);

  const allCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const live = resolved.filter((line) => line.available);
  const count = live.reduce((sum, line) => sum + line.spec.qty, 0);
  const subtotalMinor = live.reduce(
    (sum, line) => sum + (line.item.wasEgp ?? line.item.priceEgp) * line.spec.qty,
    0,
  );
  const discountEgp = live.reduce(
    (sum, line) =>
      line.item.wasEgp !== undefined
        ? sum + (line.item.wasEgp - line.item.priceEgp) * line.spec.qty
        : sum,
    0,
  );

  const bad = resolved.filter((line) => !line.available);
  const badNames = bad.map((line) => line.item.nameShort).join(' and ');
  const plural = bad.length > 1;

  return {
    allCount,
    itemsText: `${allCount} ${allCount === 1 ? 'item' : 'items'}`,
    subLabel: `Subtotal (${count} ${count === 1 ? 'item' : 'items'})`,
    subtotal: egp(subtotalMinor),
    discount: discountEgp > 0 ? `−${egp(discountEgp)}` : null,
    total: egp(subtotalMinor - discountEgp),
    blocked: bad.length > 0,
    blockTitle: `${bad.length} ${plural ? 'items' : 'item'} in your cart ${plural ? 'are' : 'is'} unavailable`,
    blockText: `${badNames} ${plural ? 'can’t be ordered right now. Remove them or move them' : 'can’t be ordered right now. Remove it or move it'} to your wishlist to continue.`,
    excludedText:
      bad.length === 0
        ? null
        : `${bad.length} unavailable ${plural ? 'items aren’t' : 'item isn’t'} included`,
  };
}
