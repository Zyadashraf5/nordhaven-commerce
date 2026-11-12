import { homepageSample } from '../data/homepage-sample';
import type { CollectionItem, HeroHotspot, HomepageData, StorefrontProduct } from '../data/types';
import { getLiveCatalog } from './live-catalog';
import { routes } from './links';

/**
 * The single seam between the homepage and its data source.
 *
 * F06: the category tiles, the "Chosen for everyday use" products, and every
 * price shown in the hero chips and the collection band come from the
 * catalogue API (`lib/live-catalog.ts`). Hero and collection items whose
 * product is not in the catalogue are left out rather than shown with a
 * sample price. Editorial copy, photography and navigation stay as designed.
 *
 * Still sample content, because the API has no public read for them: the
 * "Sets & bundles" section (see the F06 handoff). When the catalogue cannot
 * be read this throws and the route's error boundary shows an honest state.
 */
export async function getHomepageData(): Promise<HomepageData> {
  const catalog = await getLiveCatalog();
  const bySlug = new Map(catalog.products.map((product) => [product.slug, product]));

  // "Featured" is the first four products in the catalogue's own order.
  const products: StorefrontProduct[] = catalog.products.map((product, index) => ({
    ...product,
    listings: product.listings.filter((listing) => listing !== 'featured' || index < 4),
  }));

  const hotspots: HeroHotspot[] = homepageSample.hero.hotspots.flatMap((hotspot) => {
    const live = bySlug.get(hotspot.productSlug);
    if (!live) return [];
    const next: HeroHotspot = {
      ...hotspot,
      name: live.name,
      price: live.price,
      image: live.image,
    };
    if (live.previousPrice) next.previousPrice = live.previousPrice;
    else delete next.previousPrice;
    return [next];
  });

  const first = hotspots[0];
  const mobileChip: HomepageData['hero']['mobileChip'] = first
    ? {
        name: first.name,
        price: first.price,
        image: first.image,
        ...(first.previousPrice ? { previousPrice: first.previousPrice } : {}),
      }
    : homepageSample.hero.mobileChip;

  const collectionItems: CollectionItem[] = homepageSample.collection.items.flatMap((item) => {
    const slug = item.href.startsWith('/products/')
      ? decodeURIComponent(item.href.slice('/products/'.length))
      : '';
    const live = bySlug.get(slug);
    return live
      ? [
          {
            ...item,
            name: live.name,
            image: live.image,
            price: live.price,
            href: routes.product(live.slug),
          },
        ]
      : [];
  });

  return {
    ...homepageSample,
    categories: catalog.categories,
    products,
    hero: { ...homepageSample.hero, hotspots, mobileChip },
    collection: { ...homepageSample.collection, items: collectionItems },
  };
}
