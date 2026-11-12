/**
 * Storefront domain types.
 *
 * These mirror the shape the NestJS catalog API already exposes
 * (`GET /api/v1/catalog/products`, `GET /api/v1/catalog/categories`) so the
 * sample data used by the homepage can be replaced by live responses without
 * changing a single component. See `src/lib/api/` for the mapping layer.
 */

export type CurrencyCode = 'EGP';

export interface Money {
  /** Exact integer minor units (piastres for EGP), matching the API's minor-unit contract. */
  amountMinor: number;
  currency: CurrencyCode;
}

export interface StoreImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * `unknown`: the live catalogue API carries no stock figure, so the storefront
 * says availability is confirmed at checkout instead of claiming a state.
 */
export type AvailabilityState = 'in_stock' | 'partial' | 'out_of_stock' | 'preorder' | 'unknown';

export type ProductOptionAttribute = 'colour' | 'size';

export interface ProductOptionValue {
  id: string;
  label: string;
  inStock: boolean;
  /** Colour values render a swatch chip. */
  swatchHex?: string;
  /** Per-colour photography. Absent for the two casserole colours that the design artifact did not ship. */
  image?: StoreImage;
  sku?: string;
  price?: Money;
  previousPrice?: Money;
  /**
   * Ids of the sellable size options for this colour. A colour with an empty
   * list is out of stock in every size — the approved boards show the
   * "Cream" casserole swatch struck through for exactly that reason.
   */
  availableSizes?: string[];
}

export interface ProductOption {
  attribute: ProductOptionAttribute;
  label: string;
  values: ProductOptionValue[];
}

export interface StorefrontCategory {
  id: string;
  name: string;
  slug: string;
  image: StoreImage;
  /** The "Coffee & tea" tile uses the cool well colour in the approved boards. */
  tone: 'warm' | 'cool';
}

export interface StorefrontBrand {
  id: string;
  name: string;
  slug: string;
}

export type ProductListing = 'featured' | 'new_in' | 'on_offer';

/** One row of a product's specification table (values are Sample content). */
export interface ProductSpec {
  label: string;
  value: string;
}

/** Product dimensions as shown by the PDP dimension diagram. */
export interface ProductDimensions {
  depthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg?: number;
  /** One-line note, e.g. the interior capacity reference. */
  note?: string;
}

export interface StorefrontProduct {
  id: string;
  slug: string;
  name: string;
  /** Shorter name used by the narrow layout. */
  nameShort?: string;
  /** Short variant summary, e.g. "2 sizes · 3 colours". */
  summary: string;
  category: { id: string; name: string; slug: string };
  brand: StorefrontBrand;
  image: StoreImage;
  options: ProductOption[];
  price: Money;
  previousPrice?: Money;
  /** Percentage badge, e.g. "−15%". */
  discountBadge?: string;
  availability: AvailabilityState;
  /** Availability sentence for the whole product, e.g. "In stock in Terracotta". */
  availabilityText: string;
  /** Short availability sentence used on the narrow layout, e.g. "Terracotta · in stock". */
  availabilityShort: string;
  listings: ProductListing[];
  /** Pre-order items link to details only; no card add-to-cart. */
  preOrder?: boolean;
  /** Shown instead of a variant note when a product has no swatchable option. */
  variantNote?: string;
  /** Fixed and dynamic bundles never expose an add-to-cart action on the homepage. */
  bundleKind?: BundleKind;
  /**
   * Sample SKU for deep links (`/products/…?sku=…`). Set by the F02 sample
   * seam from `catalogSkuSample`; products where the colour option carries
   * the code per colour keep that instead.
   */
  sku?: string;
  /**
   * Live catalogue only: the exact SKU of every colour × size variant, as the
   * API lists them. When present, the SKU shown and put in the URL is this
   * code, not the sample's size-segment convention.
   */
  variants?: {
    sku: string;
    /** The API variant id (what the cart is keyed by). */
    variantId?: string | undefined;
    colourId?: string | undefined;
    sizeId?: string | undefined;
  }[];

  /* ------------------------------------------------------------------ *
   * Product detail data (Stage 2). Optional so homepage records stay
   * valid; the PDP reads these through `lib/catalog.ts`, which supplies
   * clearly-marked Sample content for anything the boards showed.
   * ------------------------------------------------------------------ */
  /** Searched and matched by the PLP "Colour" facet chips. */
  colourKeys?: string[];
  /** Searched and matched by the PLP "Material" facet. */
  materials?: string[];
  /** Additional gallery views after the primary image. */
  gallery?: StoreImage[];
  /** One or two sentences under the PDP title. */
  description?: string;
  specs?: ProductSpec[];
  /** Care/bulleted usage list shown as "Care" (Sample content). */
  care?: string[];
  /** The "In the box" list (Sample content). */
  boxContents?: string[];
  /** PDP dimension diagram values; absent hides the block. */
  dimensions?: ProductDimensions;
  /** Related products ("Goes well with"), by product slug — never auto-filled. */
  goesWellWith?: string[];
  /** The ready-packed bundle that includes this product, by bundle slug. */
  alsoInSet?: string;
}

export type BundleKind = 'fixed' | 'dynamic';

export interface BundleComponent {
  name: string;
  /** Shorter name used by the narrow layout. */
  nameShort?: string;
  quantity: number;
  image?: StoreImage;
  inStock: boolean;
  /** Detail line under the component name ("Terracotta · 24 cm · 4.2 L"). */
  line?: string;
  /** Shorter line used by the narrow layout ("Terracotta · 24 cm"). */
  lineShort?: string;
  /** The standalone product page this component links to. */
  productSlug?: string;
  /** Lead words of the "… · EGP n on its own" line in the standalone grid. */
  ownNote?: string;
}

/**
 * A fixed bundle is a finished-goods SKU with its own stock; its availability is a
 * single status for the whole set. A dynamic bundle is a set of predefined
 * components; its availability is derived from the stock of every component.
 */
export interface StorefrontBundle {
  id: string;
  slug: string;
  kind: BundleKind;
  name: string;
  price: Money;
  image: StoreImage;
  components: BundleComponent[];
  /** Fixed bundles only. */
  inStock?: boolean;
  /** One-line inventory explanation shown under the status. */
  inventoryNote: string;
  /** Condensed contents line used by the narrow layout. */
  summary: string;
  /** Extra words appended to the status on the narrow layout. */
  statusNote: string;
  /** Derived: a dynamic bundle is available only while every component is in stock. */
  available: boolean;

  /* ------------------------------------------------------------------ *
   * Bundle detail data (Stage 2). Optional so homepage records stay valid.
   * ------------------------------------------------------------------ */
  /** One or two sentences under the bundle title. */
  description?: string;
  /** Matched by the PLP "Colour" facet chips. */
  colourKeys?: string[];
  /** Matched by the PLP "Material" facet. */
  materials?: string[];
  /** Which components are currently unavailable, with the reason string. */
  unavailableComponents?: { name: string; reason: string }[];
  /** True when the board badges the set as "New". */
  isNew?: boolean;
  /** Sample SKU shown on the fixed set's detail page; sets are one code. */
  sku?: string;
  /** "Set details" definition-list rows (Pieces, Packed size, … — Sample). */
  setDetails?: ProductSpec[];
}

export interface CollectionItem {
  id: string;
  name: string;
  href: string;
  image: StoreImage;
  price: Money;
}

export interface StorefrontCollection {
  id: string;
  eyebrow: string;
  title: string;
  /** The emphasised fragment of the title. */
  titleEmphasis: string;
  /** Text that follows the emphasised fragment. */
  titleSuffix?: string;
  body: string;
  /** Shorter body copy used by the narrow layout. */
  bodyShort: string;
  image: StoreImage;
  items: CollectionItem[];
}

export interface TrustPoint {
  icon: 'price' | 'wishlist' | 'sets';
  title: string;
  body: string;
  /** Shorter body copy used by the narrow layout. */
  bodyShort: string;
}

export interface BundleSection {
  title: string;
  subtitle: string;
  /** Shorter subtitle used by the narrow layout. */
  subtitleShort: string;
}

export interface HeroHotspot {
  id: string;
  /** Position inside the hero figure, in percentages. */
  x: number;
  y: number;
  name: string;
  price: Money;
  previousPrice?: Money;
  image: StoreImage;
  productSlug: string;
}

export interface HeroContent {
  eyebrow: string;
  title: string;
  titleEmphasis: string;
  body: string;
  /** Shorter body copy used by the narrow layout. */
  bodyShort: string;
  image: StoreImage;
  hotspots: HeroHotspot[];
  /** The product shown in the chip on the narrow layout, where there are no hotspots. */
  mobileChip: {
    name: string;
    price: Money;
    previousPrice?: Money;
    image: StoreImage;
  };
}

export interface StorefrontNavLink {
  label: string;
  href: string;
  emphasis?: boolean;
  tone?: 'default' | 'offer';
  /** Draws a hairline divider before this link. */
  dividerBefore?: boolean;
}

export interface StorefrontNavColumn {
  groups: { heading: string; links: StorefrontNavLink[] }[];
}

export interface TrustPoint {
  icon: 'price' | 'wishlist' | 'sets';
  title: string;
  body: string;
  /** Shorter body copy used by the narrow layout. */
  bodyShort: string;
}

export interface HomepageData {
  announcement: {
    message: string;
    /** Shorter message used by the narrow layout. */
    messageShort: string;
    links: StorefrontNavLink[];
    currency: string;
    language: string;
  };
  navigation: {
    primary: StorefrontNavLink[];
    /** The chip scroller used by the narrow layout. */
    mobileChips: StorefrontNavLink[];
    megaMenu: StorefrontNavColumn[];
    megaMenuFeature: { href: string; image: StoreImage; title: string };
  };
  categories: StorefrontCategory[];
  hero: HeroContent;
  products: StorefrontProduct[];
  bundleSection: BundleSection;
  bundles: StorefrontBundle[];
  collection: StorefrontCollection;
  trustPoints: TrustPoint[];
  footer: {
    tagline: string;
    columns: { title: string; links: StorefrontNavLink[] }[];
    copyright: string;
    locale: string;
  };
}
