import { AnnouncementBar } from '../components/layout/AnnouncementBar';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';
import { HeroSection } from '../components/home/HeroSection';
import { CategoryTiles } from '../components/home/CategoryTiles';
import { ProductShowcase } from '../components/home/ProductShowcase';
import { BundleShowcase } from '../components/home/BundleShowcase';
import { CollectionBand } from '../components/home/CollectionBand';
import { TrustPoints } from '../components/home/TrustPoints';
import { getHomepageData } from '../lib/storefront';
import { MotionMain } from '../motion/MotionMain';
import styles from './page.module.css';

/** Catalogue data is read per request (and cached briefly by the data cache), never at build time. */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const data = await getHomepageData();

  return (
    <div className={styles.page}>
      <a href="#main" className="hw-skip-link">
        Skip to content
      </a>
      <AnnouncementBar announcement={data.announcement} />
      <SiteHeader navigation={data.navigation} />

      <MotionMain>
        <HeroSection hero={data.hero} />
        <CategoryTiles categories={data.categories} />
        <ProductShowcase products={data.products} />
        <BundleShowcase section={data.bundleSection} bundles={data.bundles} />
        <CollectionBand collection={data.collection} />
        <TrustPoints points={data.trustPoints} />
      </MotionMain>

      <SiteFooter footer={data.footer} />
    </div>
  );
}
