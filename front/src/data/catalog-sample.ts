import { egp } from './money';
import type {
  BundleComponent,
  ProductDimensions,
  ProductSpec,
  StoreImage,
  StorefrontBundle,
  StorefrontCategory,
  StorefrontProduct,
} from './types';
import { homepageSample } from './homepage-sample';

/**
 * STAGE 2 CATALOG SAMPLE — NOT LIVE API DATA.
 *
 * The product listing page, product detail pages and bundle details read
 * through this module. The twelve listings reproduce the approved Stage 2
 * boards of `ui/Stage 2 — Design system, PLP, PDP.html` exactly — including
 * each board price and facet count — and every record that already appears on
 * the approved Stage 1 homepage is imported from `homepage-sample.ts` so the
 * two surfaces can never drift apart.
 *
 * Brands, materials, dimensions, specs and every body sentence are Sample
 * content ("Illustrative content (brands, specs, prices, images)" per the
 * boards' implementation notes). They are never presented as live API data:
 * the announcement bar states the currency, and bundle add-to-cart remains
 * disabled with explicit copy.
 */

type StorefrontBrand = StorefrontProduct['brand'];

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

function image(src: string, alt: string, width: number, height: number): StoreImage {
  return { src: `/images/${src}`, alt, width, height };
}

/**
 * Three of the approved PDP gallery views arrived inside the design artifact
 * itself; they are byte-identical renders of the casserole that Stage 1
 * shipped, saved alongside the other approved assets.
 */
const casseroleGallery: StoreImage[] = [
  homepageSample.products.find((p) => p.slug === 'enamelled-cast-iron-casserole')!.image,
  image('casserole-top-view.webp', 'Enamelled cast-iron casserole seen from above', 720, 900),
  image('casserole-lid-off.webp', 'Casserole lid off, showing the cream enamel interior', 720, 900),
  image('casserole-handle-closeup.webp', 'Close-up of the casserole handle and lid rim', 720, 900),
];

/* ------------------------------------------------------------------ *
 * Brands — Sample content, transcribed from the Stage 2 boards.
 * ------------------------------------------------------------------ */

const brandKilnStudio: StorefrontBrand = {
  id: 'brand-kiln-studio',
  name: 'Kiln Studio',
  slug: 'kiln-studio',
};
const brandDeltaLinen: StorefrontBrand = {
  id: 'brand-delta-linen',
  name: 'Delta Linen',
  slug: 'delta-linen',
};

/* ------------------------------------------------------------------ *
 * Sample PDP body data shared by the staged products
 * ------------------------------------------------------------------ */

const casseroleSpecs: ProductSpec[] = [
  { label: 'Material', value: 'Enamelled cast iron' },
  { label: 'Capacity', value: '4.2 L' },
  { label: 'Diameter', value: '24 cm' },
  { label: 'Oven safe', value: 'To 250 °C' },
  { label: 'Hob types', value: 'Gas, electric, induction' },
  { label: 'Care', value: 'Dishwasher safe' },
];

const casseroleCare = [
  'Rinse with warm water and a soft sponge; avoid steel wool.',
  'Wooden or silicone tools protect the enamel.',
  'Let the pot cool before rinsing to protect the glaze.',
];

const casseroleBox = ['Casserole with lid', 'Kraft box', 'Use & care card'];

const casseroleDimensions: ProductDimensions = {
  depthCm: 24,
  widthCm: 33,
  heightCm: 14,
  weightKg: 4.8,
  note: 'Measured with the lid on',
};

const bakeDishSpecs: ProductSpec[] = [
  { label: 'Material', value: 'Stoneware' },
  { label: 'Size', value: '30 × 20 cm' },
  { label: 'Oven safe', value: 'To 240 °C' },
  { label: 'Care', value: 'Dishwasher safe' },
];

const towelsSpecs: ProductSpec[] = [
  { label: 'Material', value: 'Machine-woven linen' },
  { label: 'Size', value: '50 × 70 cm each' },
  { label: 'Set', value: '3 towels' },
  { label: 'Care', value: 'Machine wash 40 °C' },
];

const serverSpecs: ProductSpec[] = [
  { label: 'Material', value: 'Borosilicate glass' },
  { label: 'Capacity', value: '600 ml' },
  { label: 'Dishwasher', value: 'Safe' },
];

const bakeDish: StorefrontProduct = {
  id: 'prod-baking-dish',
  slug: 'stoneware-baking-dish-30cm',
  name: 'Stoneware Baking Dish, 30 cm',
  summary: '30 × 20 cm · Oat glaze',
  category: { id: 'cat-bakeware', name: 'Bakeware', slug: 'bakeware' },
  brand: brandKilnStudio,
  image: image('bakeware.webp', 'Cream stoneware baking dish', 720, 900),
  options: [],
  price: egp(1150),
  availability: 'in_stock',
  availabilityText: 'In stock',
  availabilityShort: 'In stock',
  variantNote: 'Oat glaze',
  listings: ['featured'],
  colourKeys: ['cream-oat'],
  materials: ['Stoneware'],
  description:
    'A matte oat glaze dish for lasagnas, roasted vegetables and gratins — goes from the oven straight to the table.',
  specs: bakeDishSpecs,
  care: ['Oven, microwave and freezer friendly.', 'Avoid sudden temperature shocks.'],
  boxContents: ['Baking dish', 'Use & care card'],
  dimensions: { depthCm: 30, widthCm: 20, heightCm: 6.5, weightKg: 1.6, note: 'Capacity 2.2 L' },
  goesWellWith: [
    'olive-wood-serving-board',
    'stoneware-dinner-plates-set-of-4',
    'linen-tea-towels-set-of-3',
  ],
  alsoInSet: 'the-first-kitchen-set',
};

const towels: StorefrontProduct = {
  id: 'prod-towels',
  slug: 'linen-tea-towels-set-of-3',
  name: 'Linen Tea Towels, Set of 3',
  summary: '50 × 70 cm · 3 colours',
  category: { id: 'cat-textiles', name: 'Textiles', slug: 'textiles' },
  brand: brandDeltaLinen,
  image: image('textiles-towels.webp', 'Linen tea towels in oat, terracotta and sage', 720, 900),
  options: [],
  price: egp(640),
  previousPrice: egp(800),
  discountBadge: '−20%',
  availability: 'in_stock',
  availabilityText: 'In stock',
  availabilityShort: 'In stock',
  variantNote: 'Oat, terracotta, sage',
  listings: ['featured', 'on_offer'],
  colourKeys: ['cream-oat', 'terracotta', 'sage'],
  materials: ['Linen'],
  description:
    'Washed linen that dries glass without streaks. One in each colour, ready for the daily round of the kitchen.',
  specs: towelsSpecs,
  care: ['Machine wash at 40 °C.', 'Line dry; shakes out easily without ironing.'],
  boxContents: ['3 tea towels', 'Belly band'],
  dimensions: { depthCm: 50, widthCm: 70, heightCm: 1, note: 'Each towel, laid flat' },
  goesWellWith: [
    'enamelled-cast-iron-casserole',
    'stoneware-mug-350ml',
    'glass-storage-jars-set-of-3',
  ],
  alsoInSet: 'the-first-kitchen-set',
};

/**
 * Stage 2 products that were not part of the Stage 1 homepage.
 * Sample prices are transcribed from the approved PLP board (board-04).
 */
export const catalogStage2Products: StorefrontProduct[] = [bakeDish, towels];

/* ------------------------------------------------------------------ *
 * PDP body data for the products shared with the Stage 1 homepage
 * (keyed by slug; merged in lib/catalog.ts)
 * ------------------------------------------------------------------ */

const pdpExtras: Record<
  string,
  Partial<StorefrontProduct> & Pick<StorefrontProduct, 'colourKeys' | 'materials'>
> = {
  'enamelled-cast-iron-casserole': {
    colourKeys: ['terracotta', 'sage', 'cream-oat'],
    materials: ['Cast iron'],
    gallery: casseroleGallery,
    description:
      'A tight-lid casserole that braises, roasts and serves. The terracotta enamel wears the hob heat with patience.',
    specs: casseroleSpecs,
    care: casseroleCare,
    boxContents: casseroleBox,
    dimensions: casseroleDimensions,
    goesWellWith: [
      'olive-wood-serving-board',
      'stoneware-dinner-plates-set-of-4',
      'stoneware-baking-dish-30cm',
      'linen-tea-towels-set-of-3',
    ],
    alsoInSet: 'the-first-kitchen-set',
  },
  'olive-wood-serving-board': {
    colourKeys: ['natural-wood'],
    materials: ['Olive wood'],
    description:
      'One piece of oil-finished olive wood, cut so the grain carries the board along its whole length.',
    specs: [
      { label: 'Material', value: 'Olive wood' },
      { label: 'Size', value: '45 × 22 cm' },
      { label: 'Finish', value: 'Food-safe oil' },
    ],
    care: ['Hand wash; never soak.', 'Re-oil once a season with food-safe oil.'],
    boxContents: ['Serving board', 'Use & care card'],
    dimensions: {
      depthCm: 45,
      widthCm: 22,
      heightCm: 2,
      weightKg: 1.2,
      note: 'Each board is unique in grain',
    },
    goesWellWith: [
      'enamelled-cast-iron-casserole',
      'stoneware-dinner-plates-set-of-4',
      'linen-tea-towels-set-of-3',
    ],
    alsoInSet: 'the-first-kitchen-set',
  },
  'stoneware-mug-350ml': {
    colourKeys: ['sage', 'cream-oat'],
    materials: ['Stoneware'],
    description:
      'A speckled glaze mug with a comfortable loop handle; the sage enamel is the daily horizon of the table.',
    specs: [
      { label: 'Material', value: 'Stoneware' },
      { label: 'Capacity', value: '350 ml' },
      { label: 'Colours', value: 'Sage, cream' },
      { label: 'Care', value: 'Dishwasher safe' },
    ],
    care: [
      'Dishwasher and microwave safe.',
      'Colours are mixed by hand; small variations are part of the finish.',
    ],
    boxContents: ['Mug', 'Use & care card'],
    dimensions: {
      depthCm: 8.5,
      widthCm: 10.5,
      heightCm: 9.5,
      weightKg: 0.4,
      note: '350 ml to the brim',
    },
    goesWellWith: ['glass-coffee-server-600ml', 'pour-over-kettle-1l', 'olive-wood-serving-board'],
    alsoInSet: 'morning-coffee-set',
  },
  'stoneware-dinner-plates-set-of-4': {
    colourKeys: ['cream-oat'],
    materials: ['Stoneware'],
    description: 'Four 27 cm plates in a soft oat glaze; the flat rim gives stews a picture frame.',
    specs: [
      { label: 'Material', value: 'Stoneware' },
      { label: 'Diameter', value: '27 cm' },
      { label: 'Set', value: '4 plates' },
      { label: 'Care', value: 'Dishwasher safe' },
    ],
    care: ['Dishwasher, oven to 240 °C and microwave safe.', 'Stack with a cloth between plates.'],
    boxContents: ['4 plates', 'Use & care card'],
    dimensions: { depthCm: 27, widthCm: 27, heightCm: 2.5, weightKg: 3.1, note: 'Stack of four' },
    goesWellWith: [
      'enamelled-cast-iron-casserole',
      'stoneware-baking-dish-30cm',
      'linen-tea-towels-set-of-3',
    ],
    alsoInSet: 'the-first-kitchen-set',
  },
  'steel-hand-coffee-grinder': {
    colourKeys: ['steel'],
    materials: ['Steel'],
    description:
      'A steel body around a ceramic burr — thirty turns of the walnut knob and the grind is ready.',
    specs: [
      { label: 'Material', value: 'Steel · ceramic burr' },
      { label: 'Capacity', value: '25 g' },
      { label: 'Grind', value: 'Coarse to fine' },
    ],
    care: ['Brush out the burr after each use.', 'Wipe the steel with a dry cloth.'],
    boxContents: ['Grinder', 'Brush', 'Use & care card'],
    dimensions: { depthCm: 6, widthCm: 6, heightCm: 18, weightKg: 0.6, note: 'Walnut knob' },
    goesWellWith: ['pour-over-kettle-1l', 'glass-coffee-server-600ml', 'stoneware-mug-350ml'],
    alsoInSet: 'morning-coffee-set',
  },
  'pour-over-kettle-1l': {
    colourKeys: ['steel'],
    materials: ['Steel'],
    description:
      'A gooseneck spout that pours exactly where you point it, for pour-overs that keep their tempo.',
    specs: [
      { label: 'Material', value: 'Brushed steel' },
      { label: 'Capacity', value: '1 L' },
      { label: 'Spout', value: 'Gooseneck' },
      { label: 'Hob types', value: 'Gas, electric, induction' },
    ],
    care: ['Empty and dry after use.', 'Descale monthly with mild citric acid.'],
    boxContents: ['Kettle', 'Use & care card'],
    dimensions: { depthCm: 20, widthCm: 14, heightCm: 25, weightKg: 0.9, note: '1 L to the brim' },
    goesWellWith: ['steel-hand-coffee-grinder', 'glass-coffee-server-600ml', 'stoneware-mug-350ml'],
  },
  'glass-storage-jars-set-of-3': {
    colourKeys: ['clear'],
    materials: ['Glass'],
    description:
      'Three clear jars with bamboo lids for the coffee, oats and flour that live beside the kettle.',
    specs: [
      { label: 'Material', value: 'Borosilicate glass · bamboo lid' },
      { label: 'Sizes', value: '0.5 · 0.8 · 1.2 L' },
      { label: 'Set', value: '3 jars' },
    ],
    care: ['Hand wash; dry the lids off the glass.', 'The lids have a silicone seal.'],
    boxContents: ['3 jars with lids', 'Use & care card'],
    dimensions: { depthCm: 11, widthCm: 11, heightCm: 24, weightKg: 1.8, note: 'Tallest jar' },
    goesWellWith: ['linen-tea-towels-set-of-3', 'olive-wood-serving-board', 'stoneware-mug-350ml'],
  },
  'glass-coffee-server-600ml': {
    colourKeys: ['clear'],
    materials: ['Glass'],
    variantNote: 'Borosilicate glass',
    description:
      'A heatproof server for two cups, with a walnut-tone handle and a drip-free spout for slow mornings.',
    specs: serverSpecs,
    care: ['Hand wash recommended.', 'Do not place over direct flame.'],
    boxContents: ['Server', 'Use & care card'],
    dimensions: {
      depthCm: 12,
      widthCm: 12,
      heightCm: 14,
      weightKg: 0.5,
      note: '600 ml to the brim',
    },
    goesWellWith: ['pour-over-kettle-1l', 'steel-hand-coffee-grinder', 'stoneware-mug-350ml'],
    alsoInSet: 'morning-coffee-set',
  },
};

export const catalogPdpExtras = pdpExtras;

/* ------------------------------------------------------------------ *
 * Sample SKU codes for the PDP deep links (?sku=…)
 *
 * The casserole codes are the ones the Stage 1 model already carries; the
 * rest follow the evident HC-… pattern and are Sample content for the
 * backend's real codes. Products keyed by colour name the code per colour
 * (the boards' SKU line follows the colour × size selection); plain strings
 * are single-code products.
 * ------------------------------------------------------------------ */

export const catalogSkuSample: Record<string, string | Record<string, string>> = {
  'enamelled-cast-iron-casserole': {
    terracotta: 'HC-CI-CAS-24-TER',
    sage: 'HC-CI-CAS-24-SAG',
    cream: 'HC-CI-CAS-24-CRE',
  },
  'olive-wood-serving-board': 'HC-KT-BRD-45-OLV',
  'stoneware-mug-350ml': {
    sage: 'HC-TW-MUG-350-SAG',
    cream: 'HC-TW-MUG-350-CRE',
  },
  'stoneware-dinner-plates-set-of-4': 'HC-TW-PLT-27-OAT',
  'stoneware-baking-dish-30cm': 'HC-BW-DSH-30-OAT',
  'steel-hand-coffee-grinder': 'HC-CT-GRD-25-STL',
  'glass-coffee-server-600ml': 'HC-CT-SRV-600-CLR',
  'pour-over-kettle-1l': 'HC-CT-KTL-1L-STL',
  'glass-storage-jars-set-of-3': 'HC-ST-JAR-3-CLR',
  'linen-tea-towels-set-of-3': 'HC-TX-TOW-3-OAT',
};

/**
 * Detail-page row data for the two sample sets, in component order
 * (casserole, board, towels, grinder, server, mug). Names must stay in sync
 * with the homepage bundle records.
 */
const componentImage: (StoreImage | undefined)[] = [
  image('cookware-casserole.webp', 'Enamelled cast-iron casserole in terracotta', 720, 900),
  image('kitchen-tools-board.webp', 'Olive wood serving board with handle', 720, 900),
  image('textiles-towels.webp', 'Linen tea towels in oat, terracotta and sage', 720, 900),
  image('coffee-and-tea.webp', 'Brushed steel hand coffee grinder', 720, 900),
  image('coffee-server.webp', 'Glass coffee server with coffee', 720, 900),
  image('mugs-stoneware.webp', 'Two stoneware mugs in sage and cream', 720, 900),
];

const componentProductSlugs = [
  'enamelled-cast-iron-casserole',
  'olive-wood-serving-board',
  'linen-tea-towels-set-of-3',
  'steel-hand-coffee-grinder',
  'glass-coffee-server-600ml',
  'stoneware-mug-350ml',
];

const componentDetail: ({ line: string; lineShort: string; ownNote?: string } | undefined)[] = [
  { line: 'Terracotta · 24 cm · 4.2 L', lineShort: 'Terracotta · 24 cm' },
  { line: 'Large · 45 × 22 cm', lineShort: 'Large · 45 × 22 cm' },
  { line: 'Oat, terracotta, sage · 50 × 70 cm', lineShort: 'Oat, terracotta, sage' },
  { line: 'Brushed steel', lineShort: 'Brushed steel', ownNote: 'Ceramic burr, walnut knob' },
  { line: 'Clear', lineShort: '600 ml', ownNote: 'Borosilicate glass' },
  { line: 'Sage', lineShort: 'Sage', ownNote: 'Sage glaze' },
];

/** Adds the detail-page presentation to a homepage component row, keeping the record itself untouched. */
function enrichBundleComponents(components: BundleComponent[], offset: number): BundleComponent[] {
  return components.map((component, index) => {
    const image = componentImage[offset + index];
    const productSlug = componentProductSlugs[offset + index];
    const detail = componentDetail[offset + index];
    return {
      ...component,
      ...(image !== undefined ? { image } : {}),
      ...(productSlug !== undefined ? { productSlug } : {}),
      ...(detail ?? {}),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Bundle detail body data (keyed by slug; merged in lib/catalog.ts)
 * ------------------------------------------------------------------ */

const bundleExtras: Record<
  string,
  Partial<StorefrontBundle> & Pick<StorefrontBundle, 'colourKeys' | 'materials'>
> = {
  'the-first-kitchen-set': {
    colourKeys: ['terracotta', 'cream-oat', 'sage'],
    materials: ['Cast iron', 'Olive wood', 'Linen'],
    sku: 'HC-SET-FIRST-01',
    description:
      'Everything a first kitchen needs, packed in one kraft box: the terracotta casserole, the serving board and three tea towels.',
    // Component rows mirror the homepage record above and add the detail-page
    // presentation (photography, spec line and the standalone link).
    components: enrichBundleComponents(homepageSample.bundles[0]!.components, 0),
    setDetails: [
      { label: 'Pieces', value: '5 (3 products)' },
      { label: 'Packed size', value: '52 × 36 × 18 cm' },
      { label: 'Packed weight', value: '6.8 kg' },
      { label: 'Packaging', value: 'Recyclable kraft box with paper wrap' },
    ],
  },
  'morning-coffee-set': {
    colourKeys: ['sage', 'clear', 'steel'],
    materials: ['Steel', 'Glass', 'Stoneware'],
    description:
      'The assembled morning routine: the hand grinder, the glass server and two sage mugs — each packed separately so they can be replaced.',
    components: enrichBundleComponents(homepageSample.bundles[1]!.components, 3),
  },
};

export const catalogBundleExtras = bundleExtras;

/* ------------------------------------------------------------------ *
 * Categories for the PLP pills and the Category facet
 * ------------------------------------------------------------------ */

const setsCategory: StorefrontCategory = {
  id: 'cat-sets',
  name: 'Sets & bundles',
  slug: 'sets-and-bundles',
  image: image(
    'bundle-first-kitchen-set.webp',
    'The First Kitchen Set packed in a kraft box',
    1080,
    810,
  ),
  tone: 'warm',
};

/** The seven Stage 1 categories (unchanged) plus the Stage 2 sets pseudo-category. */
export const catalogCategories: StorefrontCategory[] = [...homepageSample.categories, setsCategory];

/** Category pill order and labels follow board-04 exactly. */
export const catalogCategoryPills = catalogCategories.map((category) => ({
  id: category.id,
  label: category.name,
  slug: category.slug,
  image: category.image,
}));

/* ------------------------------------------------------------------ *
 * The listing model
 * ------------------------------------------------------------------ */

export interface CatalogBrandEntry {
  slug: string;
  name: string;
}

export const catalogProductTypeFilters = [
  'Single products',
  'Ready-packed sets',
  'Sets of individual items',
] as const;
export type CatalogProductTypeFilter = (typeof catalogProductTypeFilters)[number];

export const catalogPriceBands = [
  { id: 'under-1000', label: 'Under EGP 1,000', from: 0, to: 1_000 },
  { id: '1000-2500', label: 'EGP 1,000 – 2,500', from: 1_000, to: 2_500 },
  { id: 'over-2500', label: 'Over EGP 2,500', from: 2_500, to: Number.POSITIVE_INFINITY },
] as const;
export type CatalogPriceBandId = (typeof catalogPriceBands)[number]['id'];

export const catalogColourOptions = [
  { id: 'terracotta', label: 'Terracotta', hex: '#9A4B33' },
  { id: 'sage', label: 'Sage', hex: '#66745F' },
  { id: 'cream-oat', label: 'Cream & oat', hex: '#E3DACA' },
  { id: 'natural-wood', label: 'Natural wood', hex: '#B9824F' },
  { id: 'steel', label: 'Steel', hex: '#B9BAB6' },
  { id: 'clear', label: 'Clear', hex: '#EEF1F0' },
] as const;
export type CatalogColourId = (typeof catalogColourOptions)[number]['id'];

export const catalogMaterialOptions = [
  'Cast iron',
  'Stoneware',
  'Olive wood',
  'Glass',
  'Linen',
  'Steel',
] as const;

export const catalogBrandOptions: CatalogBrandEntry[] = [
  { slug: 'atelier-nile', name: 'Atelier Nile' },
  { slug: 'kiln-studio', name: 'Kiln Studio' },
  { slug: 'olea', name: 'Olea' },
  { slug: 'delta-linen', name: 'Delta Linen' },
  { slug: 'brew-works', name: 'Brew Works' },
  { slug: 'clearline', name: 'Clearline' },
];

/* ------------------------------------------------------------------ *
 * Linking the browser routes (Stage 2 keeps the F01 placeholder rule)
 * ------------------------------------------------------------------ */

export function categoryHref(slug: string): string {
  return `/products?category=${encodeURIComponent(slug)}`;
}
