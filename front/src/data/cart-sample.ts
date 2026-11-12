import type { Money, ProductOptionValue, StoreImage } from './types';
import type { CartCatalogItem, CartLineSpec, PackedBoxRow, SetComponentRow } from '../lib/cart';
import { getCatalogBundle, getCatalogProduct } from '../lib/catalog';

/**
 * The Stage 3 demo cart & wishlist sample.
 *
 * NOT LIVE API DATA — the backend has no cart, wishlist or order endpoints in
 * this milestone (they arrive in stage F06), so these typed records stand in.
 * Everything is derived from the accepted Stage 1/2 records (names, images,
 * prices, SKUs, variant stocks) plus the small amounts the boards showed that
 * the records do not carry, marked with `Sample` at the constant blocks.
 */

const product = (slug: string) => getCatalogProduct(slug);
const bundle = (slug: string) => getCatalogBundle(slug);

const casserole = product('enamelled-cast-iron-casserole');

/* Variant stocks per the boards' picker (Sample): terracotta 12/8, sage 3/—,
   cream —/—. The wishlist "Choose options" prototype and the casserole cart
   lines both read this map. */
const CASSEROLE_VARIANT_STOCK: Record<string, number> = {
  'terracotta:24': 12,
  'terracotta:28': 8,
  'sage:24': 3,
  'sage:28': 0,
  'cream:24': 0,
  'cream:28': 0,
};

const casseroleColour = (id: string): ProductOptionValue | undefined =>
  casserole?.options
    .find((option) => option.attribute === 'colour')
    ?.values.find((value) => value.id === id);

const casseroleSize = (id: string): ProductOptionValue | undefined =>
  casserole?.options
    .find((option) => option.attribute === 'size')
    ?.values.find((value) => value.label.startsWith(`${id}`));

/** Sample records quote minor units; the cart engine wants whole-EGP ints. */
function egpOf(money: Money): number {
  return money.amountMinor / 100;
}

export const DEMO_CART_LINES: CartLineSpec[] = [
  { key: 'enamelled-cast-iron-casserole:terracotta:24', qty: 1 },
  { key: 'enamelled-cast-iron-casserole:sage:24', qty: 1 },
  { key: 'stoneware-dinner-plates-set-of-4', qty: 2 },
  { key: 'olive-wood-serving-board', qty: 1 },
  { key: 'the-first-kitchen-set', qty: 1 },
  { key: 'morning-coffee-set', qty: 1 },
  { key: 'glass-storage-jars-set-of-3', qty: 1 },
];

/** Wishlist item keys per the approved wishlist board. */
export const DEMO_WISHLIST_KEYS: string[] = [
  'enamelled-cast-iron-casserole',
  'olive-wood-serving-board',
  'glass-storage-jars-set-of-3',
  'pour-over-kettle-1l',
  'the-first-kitchen-set',
  'morning-coffee-set',
  'linen-tea-towels-set-of-3',
  'stoneware-baking-dish-30cm',
  'glass-coffee-server-600ml',
];

/* ------------------------------------------------------------------ *
 * Casserole variants (all six, so every picker combination lands)
 * ------------------------------------------------------------------ */

const COLOURS = [
  { id: 'terracotta', label: 'Terracotta' },
  { id: 'sage', label: 'Sage' },
  { id: 'cream', label: 'Cream' },
] as const;

const SIZES = [
  { id: '24', label: '24 cm' },
  { id: '28', label: '28 cm' },
] as const;

function casseroleCartItems(): CartCatalogItem[] {
  if (casserole === undefined) return [];
  const items: CartCatalogItem[] = [];
  for (const colour of COLOURS) {
    const colourValue = casseroleColour(colour.id);
    for (const size of SIZES) {
      const sizeValue = casseroleSize(size.id);
      const key = `${casserole.slug}:${colour.id}:${size.id}`;
      const stock = CASSEROLE_VARIANT_STOCK[`${colour.id}:${size.id}`] ?? 0;
      const sku = colourValue?.sku ?? casserole.sku ?? '';
      const price = sizeValue?.price ?? casserole.price;
      const was = sizeValue?.previousPrice ?? casserole.previousPrice;
      items.push({
        key,
        kind: 'product',
        name: casserole.name,
        nameShort: 'Casserole',
        variant: `${colour.label} · ${size.label}`,
        variantShort: `${colour.label}, ${size.label}`,
        sku,
        href: `/products/${casserole.slug}?sku=${encodeURIComponent(sku)}&size=${size.id}`,
        image: colourValue?.image ?? casserole.image,
        priceEgp: egpOf(price),
        wasEgp: was === undefined ? undefined : egpOf(was),
        stock,
        low: stock > 0 && stock <= 3,
      });
    }
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Sample stocks the boards showed for non-variant lines
 * ------------------------------------------------------------------ */

const SAMPLE_STOCKS = {
  plates: 12,
  board: 12,
  jars: 0,
  towels: 8,
  dish: 9,
  server: 5,
  fixedSet: 6,
} as const;

/** The board's review-notice example: this line's price rose from 1180. */
const BOARD_PRICE_CHANGED_FROM = 1180;

/* ------------------------------------------------------------------ *
 * Bundles
 * ------------------------------------------------------------------ */

const fixedBundle = bundle('the-first-kitchen-set');
const dynamicBundle = bundle('morning-coffee-set');

const fixedBundleRecord = fixedBundle;

function fixedCartBundle(): CartCatalogItem | undefined {
  if (fixedBundleRecord === undefined) return undefined;
  const packedBox: PackedBoxRow[] = [];
  const casseroleImage = casseroleColour('terracotta')?.image ?? casserole?.image;
  const boardImage = product('olive-wood-serving-board')?.image;
  const towelsImage = product('linen-tea-towels-set-of-3')?.image;
  if (casseroleImage !== undefined) {
    packedBox.push({
      name: 'Enamelled Cast-Iron Casserole',
      variant: 'Terracotta · 24 cm',
      qtyText: '× 1',
      image: casseroleImage,
    });
  }
  if (boardImage !== undefined) {
    packedBox.push({
      name: 'Olive Wood Serving Board',
      variant: 'Large · 45 × 22 cm',
      qtyText: '× 1',
      image: boardImage,
    });
  }
  if (towelsImage !== undefined) {
    packedBox.push({
      name: 'Linen Tea Towels',
      variant: 'Oat, terracotta, sage',
      qtyText: '× 3',
      image: towelsImage,
    });
  }
  return {
    key: fixedBundleRecord.slug,
    kind: 'fixed',
    name: fixedBundleRecord.name,
    nameShort: fixedBundleRecord.name,
    variant: '3 items · packed in one box',
    variantShort: '3 items · one box',
    sku: fixedBundleRecord.sku ?? '',
    href: `/bundles/${fixedBundleRecord.slug}`,
    image: fixedBundleRecord.image,
    priceEgp: egpOf(fixedBundleRecord.price),
    stock: SAMPLE_STOCKS.fixedSet,
    packedBox,
  };
}

/** Per-component stock, exact board values (grinder 6, server 5, mugs 10 of 2 per set). */
const DYNAMIC_COMPONENT_STOCK = [6, 5, 10];

function dynamicCartBundle(): CartCatalogItem | undefined {
  if (dynamicBundle === undefined) return undefined;
  const components: SetComponentRow[] = dynamicBundle.components.map(
    (component, index): SetComponentRow => ({
      name: component.name,
      variant: component.lineShort ?? component.nameShort ?? component.name,
      variantShort: component.lineShort ?? component.nameShort,
      image: component.image,
      perSet: component.quantity,
      stock: DYNAMIC_COMPONENT_STOCK[index] ?? 5,
    }),
  );
  return {
    key: dynamicBundle.slug,
    kind: 'dynamic',
    name: dynamicBundle.name,
    nameShort: dynamicBundle.name,
    variant: '3 items · sent as individual items',
    variantShort: '3 items · one box',
    /* The Stage 3 cart board shows a cart-line code for the dynamic set as well:
       its own set record carries no SKU (F02 rule); this Sample line code stands
       in for the cart row only. */
    sku: 'HC-SET-COFFEE-01',
    href: `/bundles/${dynamicBundle.slug}`,
    image: dynamicBundle.image,
    priceEgp: egpOf(dynamicBundle.price),
    stock: 0,
    components,
  };
}

/* ------------------------------------------------------------------ *
 * Single-item lines
 * ------------------------------------------------------------------ */

const plates = product('stoneware-dinner-plates-set-of-4');
const boardRecord = product('olive-wood-serving-board');
const jars = product('glass-storage-jars-set-of-3');
const towels = product('linen-tea-towels-set-of-3');
const dish = product('stoneware-baking-dish-30cm');
const server = product('glass-coffee-server-600ml');

function simpleItems(): CartCatalogItem[] {
  const list: CartCatalogItem[] = [];
  if (plates !== undefined) {
    list.push({
      key: plates.slug,
      kind: 'product',
      name: plates.name,
      nameShort: 'Dinner Plates, Set of 4',
      /* Sample variant + line code, per the board cart row. */
      variant: '27 cm · Oat',
      variantShort: '27 cm · Oat',
      sku: 'HC-SW-PLT-27-OAT',
      href: `/products/${plates.slug}`,
      image: plates.image,
      priceEgp: egpOf(plates.price),
      stock: SAMPLE_STOCKS.plates,
    });
  }
  if (boardRecord !== undefined) {
    list.push({
      key: boardRecord.slug,
      kind: 'product',
      name: boardRecord.name,
      nameShort: 'Olive Wood Serving Board',
      variant: 'Large · 45 × 22 cm',
      variantShort: 'Large · 45 × 22 cm',
      sku: 'HC-OW-BRD-L',
      href: `/products/${boardRecord.slug}`,
      image: boardRecord.image,
      priceEgp: egpOf(boardRecord.price),
      /* Sample: the board shows this line with a price-change notice. */
      priceChangedFromEgp: BOARD_PRICE_CHANGED_FROM,
      stock: SAMPLE_STOCKS.board,
    });
  }
  if (jars !== undefined) {
    list.push({
      key: jars.slug,
      kind: 'product',
      name: jars.name,
      nameShort: 'Glass Storage Jars',
      variant: '0.5 · 0.8 · 1.2 L',
      variantShort: '0.5 · 0.8 · 1.2 L',
      sku: 'HC-GL-JAR-3',
      href: `/products/${jars.slug}`,
      image: jars.image,
      priceEgp: egpOf(jars.price),
      stock: SAMPLE_STOCKS.jars,
    });
  }
  if (towels !== undefined) {
    list.push({
      key: towels.slug,
      kind: 'product',
      name: towels.name,
      nameShort: 'Linen Tea Towels',
      variant: 'Oat, terracotta, sage',
      variantShort: 'Oat, terracotta, sage',
      /* Sample line code. */
      sku: 'HC-LN-TOW-3',
      href: `/products/${towels.slug}`,
      image: towels.image,
      priceEgp: egpOf(towels.price),
      wasEgp: towels.previousPrice === undefined ? undefined : egpOf(towels.previousPrice),
      stock: SAMPLE_STOCKS.towels,
    });
  }
  if (dish !== undefined) {
    list.push({
      key: dish.slug,
      kind: 'product',
      name: dish.name,
      nameShort: 'Stoneware Baking Dish',
      variant: '30 cm · Oat glaze',
      variantShort: '30 cm · Oat glaze',
      /* Sample line code. */
      sku: 'HC-SW-BSH-30',
      href: `/products/${dish.slug}`,
      image: dish.image,
      priceEgp: egpOf(dish.price),
      stock: SAMPLE_STOCKS.dish,
    });
  }
  if (server !== undefined) {
    list.push({
      key: server.slug,
      kind: 'product',
      name: server.name,
      nameShort: 'Glass Coffee Server',
      variant: '600 ml · Borosilicate',
      variantShort: '600 ml · Borosilicate',
      /* Sample line code. */
      sku: 'HC-GL-SRV-6',
      href: `/products/${server.slug}`,
      image: server.image,
      priceEgp: egpOf(server.price),
      stock: SAMPLE_STOCKS.server,
    });
  }
  return list;
}

/* ------------------------------------------------------------------ *
 * Assembled sample
 * ------------------------------------------------------------------ */

export const CART_ITEMS: CartCatalogItem[] = [
  ...casseroleCartItems(),
  ...simpleItems(),
  ...[fixedCartBundle(), dynamicCartBundle()].filter(
    (item): item is CartCatalogItem => item !== undefined,
  ),
];

export function findCartItem(key: string): CartCatalogItem | undefined {
  return CART_ITEMS.find((item) => item.key === key);
}

/** Wishlist page record: item key â†’ the product / bundle it links to. */
export interface WishlistCatalogEntry {
  key: string;
  brand: string;
  name: string;
  nameShort: string;
  note: string;
  image: StoreImage;
  /** "From" prices (variables) render prefix "From". */
  priceEgp: number;
  wasEgp?: number | undefined;
  href: string;
  kind: 'options' | 'add' | 'out' | 'pre' | 'view';
  /** Only for kind 'view': the packed-goods flavour of the set. */
  setKind?: 'fixed' | 'dynamic' | undefined;
  /** Only for kind 'pre': the pre-order permission note. */
  preOrderNote?: string | undefined;
}

/** The wishlist record assembled from the catalog w/ board presentation. */
function wishlistEntries(): WishlistCatalogEntry[] {
  const entries: WishlistCatalogEntry[] = [];
  if (casserole !== undefined) {
    entries.push({
      key: casserole.slug,
      brand: 'Atelier Nile',
      name: casserole.name,
      nameShort: 'Casserole',
      note: '3 colours · 2 sizes',
      image: casseroleColour('terracotta')?.image ?? casserole.image,
      priceEgp: egpOf(casserole.price),
      wasEgp: casserole.previousPrice === undefined ? undefined : egpOf(casserole.previousPrice),
      href: `/products/${casserole.slug}`,
      kind: 'options',
    });
  }
  if (boardRecord !== undefined) {
    entries.push({
      key: boardRecord.slug,
      brand: 'Olea',
      name: boardRecord.name,
      nameShort: 'Olive Wood Serving Board',
      note: 'Large · 45 × 22 cm',
      image: boardRecord.image,
      priceEgp: egpOf(boardRecord.price),
      href: `/products/${boardRecord.slug}`,
      kind: 'add',
    });
  }
  if (jars !== undefined) {
    entries.push({
      key: jars.slug,
      brand: 'Clearline',
      name: jars.name,
      nameShort: 'Glass Storage Jars',
      note: '0.5 · 0.8 · 1.2 L',
      image: jars.image,
      priceEgp: egpOf(jars.price),
      href: `/products/${jars.slug}`,
      kind: 'out',
    });
  }
  const kettle = product('pour-over-kettle-1l');
  if (kettle !== undefined) {
    entries.push({
      key: kettle.slug,
      brand: 'Brew Works',
      name: kettle.name,
      nameShort: 'Pour-Over Kettle',
      note: 'Brushed steel',
      image: kettle.image,
      priceEgp: egpOf(kettle.price),
      href: `/products/${kettle.slug}`,
      kind: 'pre',
      preOrderNote: 'Pre-order · charged only when in stock',
    });
  }
  const fixedEntry = fixedCartBundle();
  if (fixedEntry !== undefined) {
    entries.push({
      key: fixedEntry.key,
      brand: 'Nordhaven Commerce',
      name: fixedEntry.name,
      nameShort: fixedEntry.nameShort,
      note: '3 items · one packed box',
      image: fixedEntry.image,
      priceEgp: fixedEntry.priceEgp,
      href: fixedEntry.href,
      kind: 'view',
      setKind: 'fixed',
    });
  }
  const dynamicEntry = dynamicCartBundle();
  if (dynamicEntry !== undefined) {
    entries.push({
      key: dynamicEntry.key,
      brand: 'Nordhaven Commerce',
      name: dynamicEntry.name,
      nameShort: dynamicEntry.nameShort,
      note: '3 items · each in stock',
      image: dynamicEntry.image,
      priceEgp: dynamicEntry.priceEgp,
      href: dynamicEntry.href,
      kind: 'view',
      setKind: 'dynamic',
    });
  }
  if (towels !== undefined) {
    entries.push({
      key: towels.slug,
      brand: 'Delta Linen',
      name: towels.name,
      nameShort: 'Linen Tea Towels',
      note: 'Oat, terracotta, sage',
      image: towels.image,
      priceEgp: egpOf(towels.price),
      wasEgp: towels.previousPrice === undefined ? undefined : egpOf(towels.previousPrice),
      href: `/products/${towels.slug}`,
      kind: 'add',
    });
  }
  if (dish !== undefined) {
    entries.push({
      key: dish.slug,
      brand: 'Kiln Studio',
      name: dish.name,
      nameShort: 'Stoneware Baking Dish',
      note: 'Oat glaze',
      image: dish.image,
      priceEgp: egpOf(dish.price),
      href: `/products/${dish.slug}`,
      kind: 'add',
    });
  }
  if (server !== undefined) {
    entries.push({
      key: server.slug,
      brand: 'Brew Works',
      name: server.name,
      nameShort: 'Glass Coffee Server',
      note: 'Borosilicate glass',
      image: server.image,
      priceEgp: egpOf(server.price),
      href: `/products/${server.slug}`,
      kind: 'add',
    });
  }
  return entries;
}

/** Wishlist sample, matched by the card grid order of the board. */
export const WISHLIST_ENTRIES: WishlistCatalogEntry[] = wishlistEntries();
