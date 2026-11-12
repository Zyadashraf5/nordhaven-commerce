import { getDemoCatalog, getDemoProduct } from './portfolio-catalog';
import type { StorefrontCategory, StorefrontProduct } from '../data/types';
import { catalogCategories } from '../data/catalog-sample';
import { backendUrl } from './api/server';
import type {
  ApiBrand,
  ApiCategoryNode,
  ApiProductDetail,
  ApiProductsPage,
} from './api/catalog-types';
import {
  buildFacets,
  type CatalogFacets,
  type FacetBrand,
  type FacetCategory,
} from './catalog-facets';
import {
  PRODUCT_IMAGE_FALLBACK,
  toStorefrontCategory,
  toStorefrontProduct,
} from './catalog-mapper';
import { toCatalogListing, type CatalogListing } from './listing';
import { routes } from './links';

/**
 * Live catalogue (F06 Batch 2), read server-side from the public catalogue
 * endpoints:
 *
 *   GET /api/v1/catalog/categories
 *   GET /api/v1/catalog/brands
 *   GET /api/v1/catalog/products            (keyset pages of up to 50)
 *   GET /api/v1/catalog/products/{slug}     (variants, attributes, images)
 *
 * Reads are cached for a short time by Next's data cache so page views do not
 * exhaust the API's read rate limit (300 per 5 minutes per client). When the
 * API cannot be reached, `CatalogUnavailableError` is thrown and the route's
 * error boundary shows an honest "unavailable" state; nothing falls back to
 * invented data.
 */

export const CATALOG_REVALIDATE_SECONDS = 30;
/** A safety bound on paging (50 per page); a larger catalogue needs server-side paging. */
const MAX_PAGES = 20;

export class CatalogUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}

async function publicGet<T>(path: string, search = ''): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(backendUrl(path, search), {
      headers: { accept: 'application/json' },
      next: { revalidate: CATALOG_REVALIDATE_SECONDS },
    });
  } catch {
    throw new CatalogUnavailableError('The catalogue service is not reachable.');
  }
  if (response.status === 404) return null;
  if (!response.ok)
    throw new CatalogUnavailableError(
      `The catalogue returned ${response.status}.`,
      response.status,
    );
  return (await response.json()) as T;
}

async function mustGet<T>(path: string, search = ''): Promise<T> {
  const body = await publicGet<T>(path, search);
  if (body === null) throw new CatalogUnavailableError(`The catalogue has no ${path}.`, 404);
  return body;
}

export interface LiveCatalog {
  products: StorefrontProduct[];
  listings: CatalogListing[];
  /** Top-level categories, in the catalogue's own order. */
  categories: StorefrontCategory[];
  facets: CatalogFacets;
  /** False when paging stopped at the safety bound. */
  complete: boolean;
}

/** Category tile photography is design material keyed by slug; others get a neutral file. */
export function categoryImage(slug: string) {
  return (
    catalogCategories.find((category) => category.slug === slug)?.image ?? PRODUCT_IMAGE_FALLBACK
  );
}

function flatten(nodes: ApiCategoryNode[]): ApiCategoryNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  }
  return out;
}

export async function getLiveCatalog(now: Date = new Date()): Promise<LiveCatalog> {
  if (process.env.NORDHAVEN_DEMO === '1') return getDemoCatalog();
  const [{ categories: tree }, { brands }] = await Promise.all([
    mustGet<{ categories: ApiCategoryNode[] }>('catalog/categories'),
    mustGet<{ brands: ApiBrand[] }>('catalog/brands'),
  ]);

  const summaries: ApiProductsPage['items'] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: ApiProductsPage = await mustGet<ApiProductsPage>(
      'catalog/products',
      `?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    summaries.push(...page.items);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < MAX_PAGES);

  const details = await inBatches(
    summaries.filter((summary) => summary.baseCurrency === 'EGP'),
    10,
    (summary) =>
      publicGet<ApiProductDetail>(`catalog/products/${encodeURIComponent(summary.slug)}`),
  );

  const parentOf = new Map(flatten(tree).map((node) => [node.slug, node.parentId]));
  const slugById = new Map(flatten(tree).map((node) => [node.id, node.slug]));

  const products: StorefrontProduct[] = [];
  const listings: CatalogListing[] = [];
  details.forEach((detail) => {
    if (detail === null) return;
    const product = toStorefrontProduct(detail, now);
    const listing = toCatalogListing(product, routes.product(product.slug));
    const parentId = parentOf.get(product.category.slug);
    const parentSlug = parentId ? slugById.get(parentId) : undefined;
    listing.categoryPath = parentSlug
      ? [product.category.slug, parentSlug]
      : [product.category.slug];
    listing.rank = products.length;
    listing.createdAt = detail.createdAt;
    listing.searchText = `${detail.description} ${detail.category.name}`;
    products.push(product);
    listings.push(listing);
  });

  const topLevel = tree
    .filter((node) => node.parentId === null)
    .sort((a, b) => a.position - b.position);
  const categories = topLevel.map((node) => toStorefrontCategory(node, categoryImage));
  const facetCategories: FacetCategory[] = categories.map((category) => ({
    slug: category.slug,
    label: category.name,
    image: category.image,
  }));
  const facetBrands: FacetBrand[] = brands.map((brand) => ({ slug: brand.slug, name: brand.name }));

  return {
    products,
    listings,
    categories,
    facets: buildFacets(listings, facetCategories, facetBrands),
    complete: cursor === null,
  };
}

/** One product with its variants, attributes and images; `null` when it does not exist. */
export async function getLiveProduct(
  slug: string,
  now: Date = new Date(),
): Promise<StorefrontProduct | null> {
  if (process.env.NORDHAVEN_DEMO === '1') return getDemoProduct(slug);
  const detail = await publicGet<ApiProductDetail>(`catalog/products/${encodeURIComponent(slug)}`);
  if (detail === null || detail.baseCurrency !== 'EGP') return null;
  return toStorefrontProduct(detail, now);
}
