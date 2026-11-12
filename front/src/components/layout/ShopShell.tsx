import type { ReactNode } from 'react';
import { AnnouncementBar } from '../../components/layout/AnnouncementBar';
import { SiteHeader, type MobileHeaderVariant } from '../../components/layout/SiteHeader';
import { SiteFooter } from '../../components/layout/SiteFooter';
import { CheckoutHeader } from '../../components/layout/CheckoutHeader';
import { MotionMain } from '../../motion/MotionMain';
import { shopAnnouncement, shopFooter, shopNavigation } from '../../data/shop-sample';

/**
 * The Stage 2 page chrome: the same approved announcement bar, header and
 * footer the homepage uses, composed with the F02 navigation data (real
 * listing hrefs). Keeping this in one place is what makes the shop pages read
 * as one storefront with the homepage.
 */
export function ShopShell({
  children,
  mobileHeader = 'compact',
  chrome = 'store',
  lang = 'en',
}: {
  children: ReactNode;
  /** Narrow-layout header variant; inner pages use the compact board header. */
  mobileHeader?: MobileHeaderVariant;
  /** `checkout` swaps the store header for the checkout boards' header. */
  chrome?: 'store' | 'checkout';
  /** Language of the checkout header (the `?lang=ar` RTL preview). */
  lang?: 'en' | 'ar';
}) {
  return (
    <div className="hw-page">
      <a href="#main" className="hw-skip-link">
        Skip to content
      </a>
      {/* The checkout boards drop the announcement bar with the store header. */}
      {chrome === 'checkout' ? null : <AnnouncementBar announcement={shopAnnouncement} />}
      {chrome === 'checkout' ? (
        <CheckoutHeader lang={lang} />
      ) : (
        <SiteHeader navigation={shopNavigation} mobileVariant={mobileHeader} />
      )}
      <MotionMain>{children}</MotionMain>
      <SiteFooter footer={shopFooter} />
    </div>
  );
}
