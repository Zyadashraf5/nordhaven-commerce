import { homepageSample } from '../data/homepage-sample';
import {
  bundleToCatalogListing,
  toCatalogListing,
  setFeaturedOrder,
  type CatalogListing,
} from './listing';
import {
  catalogBundleExtras,
  catalogPdpExtras,
  catalogSkuSample,
  catalogStage2Products,
} from '../data/catalog-sample';
import type { StorefrontBundle, StorefrontProduct } from '../data/types';

/**
 * The single seam between the Stage 2 catalog pages and their data source.
 *
 * Milestone F02 is a visual milestone, the same way the homepage was: the
 * listings reproduce the approved Stage 2 boards using clearly identified
 * sample data. When catalog endpoints are connected, only this module
 * changes — the listing engine in `lib/listing.ts` and every component
 * already consume the plain domain shapes.
 *
 * The sample data is never presented as live API data. The announcement bar
 * states the currency, the PLP copy describes what filtering really does
 * (client-side over this sample), and bundle add-to-cart stays disabled with
 * explicit copy until the bundles contract exists.
 */

/* ------------------------------------------------------------------ *
 * Brand voices from the approved boards (Sample brand names)
 * ------------------------------------------------------------------ */

const BOARD_BRANDS: Record<string, StorefrontProduct['brand']> = {
  'enamelled-cast-iron-casserole': {
    id: 'brand-atelier-nile',
    name: 'Atelier Nile',
    slug: 'atelier-nile',
  },
  'olive-wood-serving-board': { id: 'brand-olea', name: 'Olea', slug: 'olea' },
  'stoneware-dinner-plates-set-of-4': {
    id: 'brand-kiln-studio',
    name: 'Kiln Studio',
    slug: 'kiln-studio',
  },
  'stoneware-mug-350ml': { id: 'brand-kiln-studio', name: 'Kiln Studio', slug: 'kiln-studio' },
  'steel-hand-coffee-grinder': { id: 'brand-brew-works', name: 'Brew Works', slug: 'brew-works' },
  'glass-coffee-server-600ml': { id: 'brand-brew-works', name: 'Brew Works', slug: 'brew-works' },
  'pour-over-kettle-1l': { id: 'brand-brew-works', name: 'Brew Works', slug: 'brew-works' },
  'glass-storage-jars-set-of-3': { id: 'brand-clearline', name: 'Clearline', slug: 'clearline' },
};

function withBoardBrand(product: StorefrontProduct): StorefrontProduct {
  const boardBrand = BOARD_BRANDS[product.slug];
  return boardBrand ? { ...product, brand: boardBrand } : product;
}

/** PDP extras carry the facet fields the listing cards read. */
function withExtras(product: StorefrontProduct): StorefrontProduct {
  const extras = catalogPdpExtras[product.slug];
  const merged = extras ? { ...product, ...extras } : product;
  return withSampleSku(merged);
}

/**
 * The sample SKU codes: per-colour codes are injected into (copies of) the
 * option values so the option model stays untouched for the homepage; plain
 * codes are set on the record itself.
 */
function withSampleSku(product: StorefrontProduct): StorefrontProduct {
  const entry = catalogSkuSample[product.slug];
  if (entry === undefined) return product;
  if (typeof entry === 'string') {
    return product.sku === undefined ? { ...product, sku: entry } : product;
  }
  const colourOption = product.options.find((option) => option.attribute === 'colour');
  if (colourOption === undefined) {
    const first = Object.values(entry)[0];
    return first === undefined || product.sku !== undefined ? product : { ...product, sku: first };
  }
  const options = product.options.map((option) => {
    if (option !== colourOption) return option;
    return {
      ...option,
      values: option.values.map((value) => {
        const injected = value.sku ?? entry[value.id];
        return injected === undefined ? value : { ...value, sku: injected };
      }),
    };
  });
  const first = colourOption.values[0]?.id;
  const fallback = first === undefined ? undefined : entry[first];
  return fallback === undefined || product.sku !== undefined
    ? { ...product, options }
    : { ...product, options, sku: fallback };
}

/** Shared homepage products + the three Stage 2 additions from the PLP board. */
const allCatalogProducts: StorefrontProduct[] = [
  ...homepageSample.products.map(withBoardBrand).map(withExtras),
  ...catalogStage2Products.map(withSampleSku),
];

export function getCatalogProduct(slug: string): StorefrontProduct | undefined {
  const base = allCatalogProducts.find((product) => product.slug === slug);
  if (!base) return undefined;
  const extras = catalogPdpExtras[slug];
  return extras ? { ...base, ...extras } : base;
}

/* ------------------------------------------------------------------ *
 * PDP body merge (Sample body data keyed by slug)
 * ------------------------------------------------------------------ */

export function getCatalogBundle(slug: string): StorefrontBundle | undefined {
  const base = homepageSample.bundles.find((bundle) => bundle.slug === slug);
  if (!base) return undefined;
  const extras = catalogBundleExtras[slug];
  return extras ? { ...base, ...extras } : base;
}

/* ------------------------------------------------------------------ *
 * The twelve listings, in the approved board's featured order
 * ------------------------------------------------------------------ */

/**
 * The board's card order (board-04). The engine reads it through
 * `setFeaturedOrder` so pure tests can reproduce it on their own data.
 */
const FEATURED_ORDER = [
  'enamelled-cast-iron-casserole',
  'olive-wood-serving-board',
  'stoneware-dinner-plates-set-of-4',
  'stoneware-mug-350ml',
  'stoneware-baking-dish-30cm',
  'steel-hand-coffee-grinder',
  'linen-tea-towels-set-of-3',
  'glass-coffee-server-600ml',
  'glass-storage-jars-set-of-3',
  'pour-over-kettle-1l',
  'the-first-kitchen-set',
  'morning-coffee-set',
];

export function buildCatalogListings(): CatalogListing[] {
  const productCards = allCatalogProducts.map((product) =>
    toCatalogListing(product, `/products/${product.slug}`),
  );
  const bundleCards = homepageSample.bundles.map((bundle) =>
    bundleToCatalogListing(bundle, `/bundles/${bundle.slug}`),
  );
  const inBoard = [...productCards, ...bundleCards].filter((listing) =>
    FEATURED_ORDER.includes(listing.slug),
  );
  const rank = new Map(FEATURED_ORDER.map((slug, index) => [slug, index]));
  return inBoard.sort((a, b) => (rank.get(a.slug) ?? 0) - (rank.get(b.slug) ?? 0));
}

setFeaturedOrder(FEATURED_ORDER);

/** Module-level singleton — the sample data is static. */
const listings = buildCatalogListings();

export function getCatalogListings(): CatalogListing[] {
  return listings;
}
