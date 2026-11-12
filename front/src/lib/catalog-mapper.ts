import { catalogColourOptions } from '../data/catalog-sample';
import type {
  ProductListing,
  ProductOption,
  ProductOptionValue,
  StoreImage,
  StorefrontCategory,
  StorefrontProduct,
} from '../data/types';
import type { Money } from '../data/types';
import type { ApiCategoryNode, ApiProductDetail } from './api/catalog-types';

/** Exact minor units from the API → Money (the API is EGP-only here). */
function minor(amountMinor: number): Money {
  return { amountMinor, currency: 'EGP' };
}

/**
 * Maps the live catalogue API (ProductDetailResponse, CategoryResponse) onto
 * the storefront domain types the approved components already render.
 *
 * What the API does not carry is left absent or marked unknown — never
 * invented:
 *  - stock: `availability: 'unknown'` ("Availability confirmed at checkout");
 *  - per-variant prices: one product price (the effective price);
 *  - care, box contents, dimensions, related products, short names;
 *  - per-colour photography: the product's image list only.
 */

/** Used when a product has no image at all; a neutral file, not a product photo. */
export const PRODUCT_IMAGE_FALLBACK: StoreImage = {
  src: '/images/placeholder-product.svg',
  alt: '',
  width: 720,
  height: 900,
};

/** The catalogue's own photographs are 4:5 (the API stores URLs, not sizes). */
const IMAGE_WIDTH = 720;
const IMAGE_HEIGHT = 900;

/** Products created in the last 30 days belong to "New in". */
export const NEW_IN_DAYS = 30;

/**
 * The API stores absolute http(s) URLs. Files the storefront itself serves
 * from /images are stored with a local development origin; those are used as
 * same-origin paths so they work on any local port. Other hosts are untouched.
 */
export function normaliseImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (local && parsed.pathname.startsWith('/images/')) return parsed.pathname;
  } catch {
    /* relative or malformed: use as given */
  }
  return url;
}

function toImage(image: { url: string; altText: string | null }, fallbackAlt: string): StoreImage {
  return {
    src: normaliseImageUrl(image.url),
    alt: image.altText ?? fallbackAlt,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  };
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Maps a colour word onto the storefront's colour facet keys. */
export function colourKey(label: string): string {
  const text = label.toLowerCase();
  if (text.includes('terracotta')) return 'terracotta';
  if (text.includes('sage')) return 'sage';
  if (text.includes('cream') || text.includes('oat')) return 'cream-oat';
  if (text.includes('wood')) return 'natural-wood';
  if (text.includes('steel')) return 'steel';
  if (text.includes('clear')) return 'clear';
  return slugify(label);
}

function swatchHex(key: string): string {
  return catalogColourOptions.find((option) => option.id === key)?.hex ?? '#EFE8DE';
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** "Oat, Terracotta, Sage" / "Cream & oat" → individual colour words. */
function splitColours(value: string): string[] {
  return value
    .split(/,|\band\b|&/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function attributeValues(detail: ApiProductDetail, name: string): string[] {
  return detail.attributes
    .filter((attribute) => attribute.name.toLowerCase() === name.toLowerCase())
    .flatMap((attribute) => attribute.value.split(',').map((part) => part.trim()))
    .filter(Boolean);
}

export function discountBadge(basisPoints: number): string | undefined {
  if (basisPoints <= 0) return undefined;
  const percent = basisPoints / 100;
  return `−${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

function summaryOf(colours: number, sizes: number): string {
  const parts: string[] = [];
  if (sizes > 1) parts.push(`${sizes} sizes`);
  if (colours > 1) parts.push(`${colours} colours`);
  return parts.join(' · ');
}

export function toStorefrontProduct(
  detail: ApiProductDetail,
  now: Date = new Date(),
): StorefrontProduct {
  const variants = [...detail.variants].sort((a, b) => a.position - b.position);

  const colourLabels = unique(variants.map((v) => v.color).filter((c): c is string => c !== null));
  const sizeLabels = unique(variants.map((v) => v.size).filter((s): s is string => s !== null));

  const matrix = variants.map((variant) => ({
    sku: variant.sku,
    variantId: variant.id,
    colourId: variant.color !== null ? slugify(variant.color) : undefined,
    sizeId: variant.size !== null ? slugify(variant.size) : undefined,
  }));

  const sizeIds = sizeLabels.map(slugify);
  const colourValues: ProductOptionValue[] = colourLabels.map((label) => {
    const id = slugify(label);
    const mine = matrix.filter((entry) => entry.colourId === id);
    const offered = unique(
      mine.map((entry) => entry.sizeId).filter((s): s is string => s !== undefined),
    );
    const key = colourKey(label);
    const value: ProductOptionValue = {
      id,
      label,
      inStock: true,
      swatchHex: swatchHex(key),
    };
    if (mine[0] !== undefined) value.sku = mine[0].sku;
    // A size this colour has no variant for is not offered in it.
    if (sizeIds.length > 0 && offered.length < sizeIds.length) value.availableSizes = offered;
    return value;
  });
  const sizeValues: ProductOptionValue[] = sizeLabels.map((label) => ({
    id: slugify(label),
    label,
    inStock: true,
  }));

  const options: ProductOption[] = [];
  if (colourValues.length > 0)
    options.push({ attribute: 'colour', label: 'Colour', values: colourValues });
  if (sizeValues.length > 0) options.push({ attribute: 'size', label: 'Size', values: sizeValues });

  const keys = unique([
    ...colourLabels.map(colourKey),
    ...attributeValues(detail, 'Colour').flatMap(splitColours).map(colourKey),
  ]);
  // The variants' material field is the facet vocabulary ("Glass"); the free-text
  // "Material" attribute ("Borosilicate glass") is a specification row. The
  // attribute is used only when no variant names a material.
  const variantMaterials = unique(
    variants.map((v) => v.material).filter((m): m is string => m !== null),
  );
  const materials =
    variantMaterials.length > 0 ? variantMaterials : unique(attributeValues(detail, 'Material'));

  const created = new Date(detail.createdAt).getTime();
  const isNew = Number.isFinite(created) && now.getTime() - created <= NEW_IN_DAYS * 86_400_000;
  const onOffer = detail.discountBasisPoints > 0;
  const listings: ProductListing[] = ['featured'];
  if (onOffer) listings.push('on_offer');
  if (isNew) listings.push('new_in');

  const images = [...detail.images].sort((a, b) => a.position - b.position);
  const first = images[0];

  const product: StorefrontProduct = {
    id: detail.id,
    slug: detail.slug,
    name: detail.name,
    summary: summaryOf(colourLabels.length, sizeLabels.length),
    category: { id: detail.category.id, name: detail.category.name, slug: detail.category.slug },
    brand: { id: detail.brand.id, name: detail.brand.name, slug: detail.brand.slug },
    image: first ? toImage(first, detail.name) : { ...PRODUCT_IMAGE_FALLBACK, alt: detail.name },
    options,
    price: minor(detail.effectivePriceMinor),
    availability: 'unknown',
    availabilityText: 'Availability confirmed at checkout',
    availabilityShort: 'Availability confirmed at checkout',
    listings,
    colourKeys: keys,
    materials,
    gallery: images.slice(1).map((image) => toImage(image, detail.name)),
    description: detail.description,
    specs: detail.attributes
      .filter((attribute) => attribute.name.toLowerCase() !== 'colour')
      .sort((a, b) => a.position - b.position)
      .map((attribute) => ({ label: attribute.name, value: attribute.value })),
    variants: matrix,
  };
  if (variants[0] !== undefined) product.sku = variants[0].sku;
  // Cards show a one-line note under the name. With sizes the card counts them;
  // otherwise it states a real size-like specification, or nothing.
  if (sizeLabels.length === 0) {
    const sizeLike = ['Size', 'Capacity', 'Diameter', 'Sizes']
      .map((name) => detail.attributes.find((attribute) => attribute.name === name)?.value)
      .find((value) => value !== undefined);
    product.variantNote = sizeLike ?? '';
  }
  if (onOffer) {
    product.previousPrice = minor(detail.basePriceMinor);
    const badge = discountBadge(detail.discountBasisPoints);
    if (badge !== undefined) product.discountBadge = badge;
  }
  return product;
}

/** Category tile data: design photography is matched by slug, never invented. */
export function toStorefrontCategory(
  node: ApiCategoryNode,
  imageFor: (slug: string) => StoreImage,
): StorefrontCategory {
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    image: imageFor(node.slug),
    tone: node.slug === 'coffee-and-tea' ? 'cool' : 'warm',
  };
}
