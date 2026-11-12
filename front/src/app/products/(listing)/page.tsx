import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShopShell } from '../../../components/layout/ShopShell';
import { ProductListing } from '../../../components/shop/ProductListing';
import { getLiveCatalog } from '../../../lib/live-catalog';
import { ListingSkeleton } from './loading';

/**
 * The Product Listing Page — `/products` (and the same component driven by
 * every facet in the URL: ?category=…, ?q=…, ?colour=…, …).
 *
 * F06: the products, categories and brands are read from the catalogue API
 * (`lib/live-catalog.ts`). The client component owns filtering, sorting and
 * pagination over the loaded catalogue, because the facet counts need the
 * whole set; the API's own filters (q, category, brand, attribute, price) are
 * checked against it by `scripts/f06/verify-batch2.mjs`. If the catalogue
 * cannot be read, the route's error boundary shows the unavailable state.
 */

export const metadata: Metadata = {
  title: 'Products · Nordhaven Commerce',
  description:
    'Cookware, bakeware, tableware, kitchen tools, storage, textiles and sets — every price in Egyptian pounds.',
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // searchParams participates in dynamic rendering; the client island reads
  // the same URL through useSearchParams. They can never disagree: one URL.
  await searchParams;

  const catalog = await getLiveCatalog();

  return (
    <ShopShell mobileHeader="search">
      <Suspense fallback={<ListingSkeleton />}>
        <ProductListing
          listings={catalog.listings}
          products={catalog.products}
          bundles={[]}
          facets={catalog.facets}
        />
      </Suspense>
    </ShopShell>
  );
}
