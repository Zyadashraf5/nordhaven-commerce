import { homepageSample } from '../data/homepage-sample';
import { catalogCategories, catalogStage2Products } from '../data/catalog-sample';
import { buildFacets } from './catalog-facets';
import { toCatalogListing } from './listing';
import { routes } from './links';
import type { LiveCatalog } from './live-catalog';

/** Explicit offline preview. Production API failures never activate this adapter. */
export function getDemoCatalog(): LiveCatalog {
  const products = [...homepageSample.products, ...catalogStage2Products];
  const listings = products.map((product, index) => ({
    ...toCatalogListing(product, routes.product(product.slug)),
    rank: index,
  }));
  return {
    products,
    listings,
    categories: catalogCategories,
    facets: buildFacets(
      listings,
      catalogCategories.map((category) => ({
        slug: category.slug,
        label: category.name,
        image: category.image,
      })),
      [{ slug: 'nordhaven', name: 'Nordhaven' }],
    ),
    complete: true,
  };
}

export function getDemoProduct(slug: string) {
  return getDemoCatalog().products.find((product) => product.slug === slug) ?? null;
}
