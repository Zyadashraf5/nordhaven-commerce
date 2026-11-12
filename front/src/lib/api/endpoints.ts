import { API_PREFIX } from './config';
import type { ApiClient } from './client';
import type { ApiBundlesResponse, ApiCategoriesResponse, ApiProductsResponse } from './types';

/**
 * Catalog endpoints that already exist in the audited backend.
 * The homepage does not call them yet; they are here so the live wiring is a
 * matter of swapping the data source in `src/lib/storefront.ts`.
 */

export interface CatalogQuery {
  q?: string;
  category?: string;
  brand?: string;
  attribute?: string[];
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  cursor?: string;
  sort?: string;
}

export function listCategories(client: ApiClient, signal?: AbortSignal) {
  return client.get<ApiCategoriesResponse>(`${API_PREFIX}/catalog/categories`, { signal });
}

export function listProducts(client: ApiClient, query: CatalogQuery = {}, signal?: AbortSignal) {
  return client.get<ApiProductsResponse>(`${API_PREFIX}/catalog/products`, {
    query: {
      q: query.q,
      category: query.category,
      brand: query.brand,
      attribute: query.attribute,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      limit: query.limit,
      cursor: query.cursor,
      sort: query.sort,
    },
    signal,
  });
}

export function listBundles(client: ApiClient, signal?: AbortSignal) {
  return client.get<ApiBundlesResponse>(`${API_PREFIX}/admin/bundles`, { signal });
}
