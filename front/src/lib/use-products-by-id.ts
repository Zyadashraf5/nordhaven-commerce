'use client';

import { useEffect, useState } from 'react';
import { api } from './api/browser';
import type { ApiProductDetail } from './api/catalog-types';
import { toStorefrontProduct } from './catalog-mapper';
import type { StorefrontProduct } from '../data/types';

/**
 * Order lines name a product by id; the public catalogue is read by slug. This
 * looks the ids up once per page load (the published product list, then the
 * detail of each product actually needed) so order views can show the
 * product's picture and colour/size words. A product that is no longer
 * published simply has no picture; the order's own snapshot is still shown.
 */

let slugsById: Promise<Map<string, string>> | null = null;
const details = new Map<string, Promise<StorefrontProduct | null>>();

function loadSlugs(): Promise<Map<string, string>> {
  slugsById ??= (async () => {
    const map = new Map<string, string>();
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const query: Record<string, string | number> = { limit: 50 };
      if (cursor !== null) query.cursor = cursor;
      const result: { items: { id: string; slug: string }[]; nextCursor: string | null } =
        await api.get('catalog/products', { query });
      result.items.forEach((item) => map.set(item.id, item.slug));
      cursor = result.nextCursor;
      if (cursor === null) break;
    }
    return map;
  })().catch((error: unknown) => {
    slugsById = null;
    throw error;
  });
  return slugsById;
}

function loadDetail(slug: string): Promise<StorefrontProduct | null> {
  let pending = details.get(slug);
  if (pending === undefined) {
    pending = api
      .get<ApiProductDetail>(`catalog/products/${encodeURIComponent(slug)}`)
      .then((detail) => toStorefrontProduct(detail))
      .catch(() => null);
    details.set(slug, pending);
  }
  return pending;
}

export function useProductsById(ids: readonly string[]): ReadonlyMap<string, StorefrontProduct> {
  const [products, setProducts] = useState<ReadonlyMap<string, StorefrontProduct>>(new Map());
  const key = [...new Set(ids)].sort().join(',');

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    void (async () => {
      try {
        const slugs = await loadSlugs();
        const wanted = key.split(',');
        const found = await Promise.all(
          wanted.map(async (id) => {
            const slug = slugs.get(id);
            return slug === undefined ? null : ([id, await loadDetail(slug)] as const);
          }),
        );
        if (cancelled) return;
        const next = new Map<string, StorefrontProduct>();
        for (const entry of found)
          if (entry !== null && entry[1] !== null) next.set(entry[0], entry[1]);
        setProducts(next);
      } catch {
        // Pictures are a nicety here: the order itself is already on screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return products;
}
