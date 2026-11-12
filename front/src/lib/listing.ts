import type { StorefrontBundle, StorefrontProduct } from '../data/types';
import { catalogPriceBands } from '../data/catalog-sample';

/**
 * The listing engine for the Product Listing Page.
 *
 * Everything here is a pure, framework-free function over plain data, so the
 * whole behaviour of the approved boards — facet counts, sorting, pagination
 * and the URL contract — is unit-testable without React or a network.
 *
 * Facet semantics (from the boards' implementation notes): the count beside
 * each option is computed over the listings the OTHER facets leave, so a
 * facet never counts its own options into a corner.
 */

/* ------------------------------------------------------------------ *
 * The listing model
 * ------------------------------------------------------------------ */

export interface CatalogListing {
  kind: 'product' | 'bundle';
  /** Bundles only: fixed (own stock) or dynamic (derived from components). */
  bundleKind?: 'fixed' | 'dynamic' | undefined;
  slug: string;
  name: string;
  nameShort?: string | undefined;
  summary: string;
  /** Card note: variant note for products, the boards' "items · stock" line for bundles. */
  note: string;
  /** The shorter note the narrow layout uses (bundle cards only differ). */
  noteShort?: string | undefined;
  brand: { name: string; slug: string };
  categorySlug: string;
  /** The category and its parent(s): selecting a parent category lists its children's products too. */
  categoryPath?: string[] | undefined;
  priceMinor: number;
  previousPriceMinor?: number | undefined;
  discountBadge?: string | undefined;
  /** `unknown`: live catalogue data carries no stock figure (see AvailabilityState). */
  availability: 'ok' | 'out' | 'preorder' | 'unknown';
  /** Position in the source order (the API's deterministic order for live data). */
  rank?: number | undefined;
  /** ISO creation time; "Newest" sorts by it when present. */
  createdAt?: string | undefined;
  /** Extra text the search matches (live data: description and category name). */
  searchText?: string | undefined;
  /** The availability sentence the board shows under the price. */
  availabilityText: string;
  /** Its narrow-layout variant ("✓ In stock as a set"); same text when absent. */
  availabilityShort?: string | undefined;
  listings: ('featured' | 'new_in' | 'on_offer')[];
  colourKeys: string[];
  materials: string[];
  href: string;
  image: { src: string; alt: string };
  /** Colour swatches for cards with swappable variants. */
  swatches?: { id: string; label: string; hex: string; inStock: boolean }[] | undefined;
  /** Card action, following the boards' card-action table. */
  action: 'add' | 'choose' | 'view' | 'view-set';
}

export type ListingSort = 'featured' | 'new' | 'price_asc' | 'price_desc' | 'best_match';
export type ListingTypeFilter = 'single' | 'fixed-set' | 'dynamic-set';

export interface ListingQuery {
  q?: string | undefined;
  categories: string[];
  types: ListingTypeFilter[];
  priceBands: string[];
  colours: string[];
  materials: string[];
  brands: string[];
  inStockOnly: boolean;
  onOfferOnly: boolean;
  listing?: 'new_in' | 'on_offer' | undefined;
  sort: ListingSort;
  page: number;
}

/** The approved board shows all twelve listings teasers per view. */
export const LISTING_PAGE_SIZE = 12;

export const DEFAULT_LISTING_QUERY: ListingQuery = {
  categories: [],
  types: [],
  priceBands: [],
  colours: [],
  materials: [],
  brands: [],
  inStockOnly: false,
  onOfferOnly: false,
  sort: 'featured',
  page: 1,
};

/* ------------------------------------------------------------------ *
 * URL contract (the boards carry filters and the page in the URL)
 * ------------------------------------------------------------------ */

const SORT_VALUES: ListingSort[] = ['featured', 'new', 'price_asc', 'price_desc', 'best_match'];
const TYPE_VALUES: ListingTypeFilter[] = ['single', 'fixed-set', 'dynamic-set'];
const LISTING_VALUES = ['new_in', 'on_offer'] as const;

function splitMulti(params: URLSearchParams, key: string): string[] {
  const values = [...params.getAll(key).flatMap((value) => value.split(','))];
  return [...new Set(values.filter(Boolean))];
}

export function parseListingQuery(search: string | URLSearchParams): ListingQuery {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search)
      : new URLSearchParams(search.toString());
  const categoryValues = splitMulti(params, 'category');
  const q = params.get('q');
  const sortParam = params.get('sort');
  const listingParam = params.get('listing');
  const pageParam = Number.parseInt(params.get('page') ?? '', 10);

  return {
    q: q && q.trim() ? q.trim() : undefined,
    categories: categoryValues,
    types: splitMulti(params, 'type').filter((value): value is ListingTypeFilter =>
      (TYPE_VALUES as string[]).includes(value),
    ),
    priceBands: splitMulti(params, 'price'),
    colours: splitMulti(params, 'colour'),
    materials: splitMulti(params, 'material'),
    brands: splitMulti(params, 'brand'),
    inStockOnly: params.get('stock') === '1',
    onOfferOnly: params.get('offer') === '1',
    listing:
      listingParam && (LISTING_VALUES as readonly string[]).includes(listingParam)
        ? (listingParam as ListingQuery['listing'])
        : undefined,
    sort:
      sortParam && SORT_VALUES.includes(sortParam as ListingSort)
        ? (sortParam as ListingSort)
        : 'featured',
    page: Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1,
  };
}

export function serializeListingQuery(query: ListingQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.categories.length === 1) {
    params.set('category', query.categories[0] ?? '');
  } else {
    query.categories.forEach((value) => params.append('category', value));
  }
  query.types.forEach((value) => params.append('type', value));
  query.priceBands.forEach((value) => params.append('price', value));
  query.colours.forEach((value) => params.append('colour', value));
  query.materials.forEach((value) => params.append('material', value));
  query.brands.forEach((value) => params.append('brand', value));
  if (query.inStockOnly) params.set('stock', '1');
  if (query.onOfferOnly) params.set('offer', '1');
  if (query.listing) params.set('listing', query.listing);
  if (query.sort !== 'featured') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/** Any facet switch resets the page — jumping to page 3 of a new list is nonsense. */
export function resetPage(query: ListingQuery): ListingQuery {
  return query.page === 1 ? query : { ...query, page: 1 };
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

function matchesQuery(listing: CatalogListing, q: string | undefined): boolean {
  if (!q) return true;
  const haystack = [
    listing.name,
    listing.nameShort,
    listing.summary,
    listing.note,
    listing.brand.name,
    listing.searchText,
    ...listing.materials,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function inPriceBand(listing: CatalogListing, bandIds: string[]): boolean {
  return catalogPriceBands
    .filter((band) => bandIds.includes(band.id))
    .some((band) => {
      const price = listing.priceMinor; // minor units (piastres)
      return price >= band.from * 100 && price < band.to * 100;
    });
}

function matchesType(listing: CatalogListing, types: ListingTypeFilter[]): boolean {
  if (types.length === 0) return true;
  return types.some((type) => {
    if (type === 'single') return listing.kind === 'product';
    if (type === 'fixed-set') return listing.kind === 'bundle' && listing.bundleKind === 'fixed';
    return listing.kind === 'bundle' && listing.bundleKind === 'dynamic';
  });
}

interface FacetSelections {
  categories: string[];
  types: ListingTypeFilter[];
  priceBands: string[];
  colours: string[];
  materials: string[];
  brands: string[];
  inStockOnly: boolean;
  onOfferOnly: boolean;
  listing?: 'new_in' | 'on_offer' | undefined;
  q?: string | undefined;
}

const FACET_GROUPS: (keyof FacetSelections)[] = [
  'categories',
  'types',
  'priceBands',
  'colours',
  'materials',
  'brands',
  'inStockOnly',
  'onOfferOnly',
  'listing',
  'q',
];

function applyFacet(
  listing: CatalogListing,
  facet: keyof FacetSelections,
  selection: FacetSelections,
): boolean {
  switch (facet) {
    case 'categories':
      return (
        selection.categories.length === 0 ||
        (listing.categoryPath ?? [listing.categorySlug]).some((slug) =>
          selection.categories.includes(slug),
        )
      );
    case 'types':
      return matchesType(listing, selection.types);
    case 'priceBands':
      return selection.priceBands.length === 0 || inPriceBand(listing, selection.priceBands);
    case 'colours':
      return (
        selection.colours.length === 0 ||
        listing.colourKeys.some((key) => selection.colours.includes(key))
      );
    case 'materials':
      return (
        selection.materials.length === 0 ||
        listing.materials.some((material) => selection.materials.includes(material))
      );
    case 'brands':
      return selection.brands.length === 0 || selection.brands.includes(listing.brand.slug);
    case 'inStockOnly':
      return !selection.inStockOnly || listing.availability === 'ok';
    case 'onOfferOnly':
      return !selection.onOfferOnly || listing.previousPriceMinor !== undefined;
    case 'listing':
      return !selection.listing || listing.listings.includes(selection.listing);
    case 'q':
      return matchesQuery(listing, selection.q);
    default:
      return true;
  }
}

function applySelection(
  listing: CatalogListing,
  selection: FacetSelections,
  except?: keyof FacetSelections,
): boolean {
  return FACET_GROUPS.filter((facet) => facet !== except).every((facet) =>
    applyFacet(listing, facet, selection),
  );
}

function selectionOf(query: ListingQuery): FacetSelections {
  return {
    categories: query.categories,
    types: query.types,
    priceBands: query.priceBands,
    colours: query.colours,
    materials: query.materials,
    brands: query.brands,
    inStockOnly: query.inStockOnly,
    onOfferOnly: query.onOfferOnly,
    listing: query.listing,
    q: query.q,
  };
}

export function filterListings(listings: CatalogListing[], query: ListingQuery): CatalogListing[] {
  const selection = selectionOf(query);
  return listings.filter((listing) => applySelection(listing, selection));
}

/* ------------------------------------------------------------------ *
 * Facet counts
 * ------------------------------------------------------------------ */

export interface FacetOption {
  value: string;
  label: string;
  /** Swatch hex, for colour chips only. */
  hex?: string;
  count: number;
}

/**
 * Counts for one checkbox group. The group's selection is replaced by the
 * single option and then applied over the other facets' result — so each
 * option shows how many listings it would bring in right now.
 */
export function facetOptions(
  universe: CatalogListing[],
  query: ListingQuery,
  facet: Exclude<keyof FacetSelections, 'inStockOnly' | 'onOfferOnly' | 'listing' | 'q'>,
  optionValues: { value: string; label: string; hex?: string }[],
): FacetOption[] {
  return optionValues.map((option) => {
    const withOption = { ...selectionOf(query), [facet]: [option.value] } as FacetSelections;
    const count = universe.filter((listing) => applySelection(listing, withOption)).length;
    return { ...option, count };
  });
}

/**
 * Counts for the Availability switches: how many listings a switch would
 * bring in if toggled, counted over the other facets' result.
 */
export function facetSwitchCounts(
  universe: CatalogListing[],
  query: ListingQuery,
  which: 'inStockOnly' | 'onOfferOnly',
): number {
  const selection: FacetSelections = { ...selectionOf(query), [which]: true };
  return universe.filter((listing) => applySelection(listing, selection)).length;
}

/* ------------------------------------------------------------------ *
 * Searching ranking + sort
 * ------------------------------------------------------------------ */

const FEATURED_ORDER = new Map<string, number>();

/** Records the approved board's featured order. */
export function setFeaturedOrder(order: string[]): void {
  order.forEach((slug, index) => FEATURED_ORDER.set(slug, index));
}

function featuredRank(listing: CatalogListing): number {
  return listing.rank ?? FEATURED_ORDER.get(listing.slug) ?? Number.MAX_SAFE_INTEGER;
}

function bestMatchRank(listing: CatalogListing, q: string): number {
  const needle = q.toLowerCase();
  const name = listing.name.toLowerCase();
  const short = (listing.nameShort ?? '').toLowerCase();
  const rest = [listing.summary, listing.note, listing.brand.name, ...listing.materials]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (name === needle || short === needle) return 0;
  if (name.startsWith(needle) || short.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  if (rest.includes(needle)) return 3;
  return 4;
}

const SORT_LABELS: Record<
  Exclude<ListingSort, 'best_match'>,
  { label: string; group: 'sort' | 'match' }
> = {
  featured: { label: 'Featured', group: 'sort' },
  new: { label: 'Newest', group: 'sort' },
  price_asc: { label: 'Price: low to high', group: 'sort' },
  price_desc: { label: 'Price: high to low', group: 'sort' },
};

export function sortOptions(hasQuery: boolean): { value: ListingSort; label: string }[] {
  const base = Object.entries(SORT_LABELS).map(([value, meta]) => ({
    value: value as Exclude<ListingSort, 'best_match'>,
    label: meta.label,
  }));
  return hasQuery ? [{ value: 'best_match', label: 'Best match' }, ...base] : base;
}

export function sortListings(listings: CatalogListing[], query: ListingQuery): CatalogListing[] {
  const sorted = [...listings];
  switch (query.sort) {
    case 'price_asc':
      sorted.sort((a, b) => a.priceMinor - b.priceMinor || featuredRank(a) - featuredRank(b));
      break;
    case 'price_desc':
      sorted.sort((a, b) => b.priceMinor - a.priceMinor || featuredRank(a) - featuredRank(b));
      break;
    case 'best_match':
      sorted.sort(
        (a, b) =>
          bestMatchRank(a, query.q ?? '') - bestMatchRank(b, query.q ?? '') ||
          featuredRank(a) - featuredRank(b),
      );
      break;
    case 'new':
      sorted.sort(
        (a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
          Number(b.listings.includes('new_in')) - Number(a.listings.includes('new_in')) ||
          featuredRank(a) - featuredRank(b),
      );
      break;
    default:
      sorted.sort((a, b) => featuredRank(a) - featuredRank(b));
  }
  return sorted;
}

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

export interface ListingPage<T> {
  items: T[];
  total: number;
  shown: number;
  page: number;
  hasMore: boolean;
  /** "Showing 12 of 12 products" — the boards' progress label. */
  progressLabel: string;
  /** True once the visitor has seen the full result set. */
  complete: boolean;
}

export function paginate<T>(items: T[], page: number): ListingPage<T> {
  const total = items.length;
  const safePage = Math.max(1, page);
  const shown = Math.min(total, safePage * LISTING_PAGE_SIZE);
  return {
    items: items.slice(0, shown),
    total,
    shown,
    page: safePage,
    hasMore: shown < total,
    progressLabel: `Showing ${shown} of ${total} product${total === 1 ? '' : 's'}`,
    complete: shown >= total,
  };
}

/* ------------------------------------------------------------------ *
 * Card adapters (data record → PLP card model)
 * ------------------------------------------------------------------ */

/**
 * The boards' card-action table:
 * one sellable SKU, in stock        → Add to cart (solid)
 * varies by one attribute            → Add to cart for that SKU (solid)
 * varies by two or more attributes   → Choose options (outline)
 * out of stock                       → disabled, names the reason
 * pre-order item                     → View details — no card add
 * fixed or dynamic bundle            → View set only
 */
export function toCatalogListing(product: StorefrontProduct, href: string): CatalogListing {
  const colourValues = product.options.find((option) => option.attribute === 'colour')?.values;
  const sizeCount =
    product.options.find((option) => option.attribute === 'size')?.values.length ?? 0;
  const swatches = colourValues?.map((value) => ({
    id: value.id,
    label: value.label,
    hex: value.swatchHex ?? '#EFE8DE',
    inStock:
      value.inStock && (value.availableSizes === undefined || value.availableSizes.length > 0),
  }));
  const twoAttributes = Boolean(swatches && swatches.length > 1) && sizeCount > 0;
  return {
    kind: 'product',
    slug: product.slug,
    name: product.nameShort ?? product.name,
    nameShort: product.nameShort,
    summary: product.summary,
    note: product.variantNote ?? product.summary,
    brand: { name: product.brand.name, slug: product.brand.slug },
    categorySlug: product.category.slug,
    priceMinor: product.price.amountMinor,
    previousPriceMinor: product.previousPrice?.amountMinor,
    discountBadge: product.discountBadge,
    availability:
      product.availability === 'out_of_stock'
        ? 'out'
        : product.availability === 'preorder'
          ? 'preorder'
          : product.availability === 'unknown'
            ? 'unknown'
            : 'ok',
    availabilityText: product.availabilityText,
    listings: [...product.listings],
    colourKeys: product.colourKeys ?? [],
    materials: product.materials ?? [],
    href,
    image: { src: product.image.src, alt: product.image.alt },
    swatches: swatches && swatches.length > 1 ? swatches : undefined,
    action: twoAttributes ? 'choose' : product.availability === 'preorder' ? 'view' : 'add',
  };
}

export interface BundleCardOverrides {
  /** The boards' note line, adapted to live component stock. */
  note: string;
  availabilityText: string;
}

export function bundleToCatalogListing(
  bundle: StorefrontBundle,
  href: string,
  overrides?: Partial<BundleCardOverrides>,
): CatalogListing {
  const outOfStock = bundle.kind === 'fixed' ? !bundle.inStock : !bundle.available;
  const inStockCount = bundle.components.filter((component) => component.inStock).length;
  const isFixed = bundle.kind === 'fixed';
  const defaults: BundleCardOverrides = isFixed
    ? {
        note: `${bundle.components.length} items · one packed box`,
        availabilityText: outOfStock ? 'Out of stock' : '✓ In stock as a packed set',
      }
    : {
        note:
          inStockCount === bundle.components.length
            ? `${bundle.components.length} items · each in stock`
            : `${inStockCount} of ${bundle.components.length} items in stock`,
        availabilityText: outOfStock ? 'Not available right now' : '✓ All items in stock',
      };
  const note = overrides?.note ?? defaults.note;
  const availabilityText = overrides?.availabilityText ?? defaults.availabilityText;
  return {
    kind: 'bundle',
    bundleKind: bundle.kind,
    slug: bundle.slug,
    name: bundle.name,
    summary: bundle.summary,
    note,
    noteShort: isFixed
      ? `${bundle.components.length} items · one box`
      : `${bundle.components.length} items`,
    brand: { name: 'Nordhaven Commerce', slug: 'nordhaven-commerce' },
    categorySlug: 'sets-and-bundles',
    priceMinor: bundle.price.amountMinor,
    previousPriceMinor: undefined,
    discountBadge: undefined,
    availability: outOfStock ? 'out' : 'ok',
    availabilityText,
    availabilityShort: isFixed
      ? outOfStock
        ? availabilityText
        : '✓ In stock as a set'
      : availabilityText,
    listings: outOfStock ? [] : ['featured'],
    colourKeys: bundle.colourKeys ?? [],
    materials: bundle.materials ?? [],
    href,
    image: { src: bundle.image.src, alt: bundle.image.alt },
    action: 'view-set',
  };
}
