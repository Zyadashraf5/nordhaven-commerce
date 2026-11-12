import { catalogColourOptions, catalogMaterialOptions } from '../data/catalog-sample';
import type { StoreImage } from '../data/types';
import type { CatalogListing } from './listing';

/**
 * The facet rail's vocabulary for the listing page, built from the catalogue
 * actually loaded (categories and brands from the API, colours and materials
 * from the products). Pure, so it is unit-tested without a network.
 */

export interface FacetCategory {
  slug: string;
  label: string;
  image: StoreImage;
}

export interface FacetBrand {
  slug: string;
  name: string;
}

export interface CatalogFacets {
  categories: FacetCategory[];
  brands: FacetBrand[];
  colours: { id: string; label: string; hex: string }[];
  materials: string[];
  /** The "In stock only" switch needs a stock signal; the live API has none. */
  showStockSwitch: boolean;
  /** "Product type" separates single products from sets; shown only if sets are listed. */
  showTypeFilter: boolean;
}

export function buildFacets(
  listings: CatalogListing[],
  categories: FacetCategory[],
  brands: FacetBrand[],
): CatalogFacets {
  const colourKeys = new Set(listings.flatMap((listing) => listing.colourKeys));
  const materialSet = new Set(listings.flatMap((listing) => listing.materials));
  const knownMaterials = catalogMaterialOptions.filter((material) => materialSet.has(material));
  const extraMaterials = [...materialSet].filter(
    (material) => !(catalogMaterialOptions as readonly string[]).includes(material),
  );
  return {
    categories,
    brands: brands.filter((brand) => listings.some((listing) => listing.brand.slug === brand.slug)),
    colours: catalogColourOptions
      .filter((colour) => colourKeys.has(colour.id))
      .map((colour) => ({ id: colour.id, label: colour.label, hex: colour.hex })),
    materials: [...knownMaterials, ...extraMaterials.sort()],
    showStockSwitch: listings.some((listing) => listing.availability !== 'unknown'),
    showTypeFilter: listings.some((listing) => listing.kind === 'bundle'),
  };
}
