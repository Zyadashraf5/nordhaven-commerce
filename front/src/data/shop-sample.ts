import type { HomepageData } from './types';
import { homepageSample } from './homepage-sample';
import { categoryHref } from './catalog-sample';

/**
 * SHOP CHROME SAMPLE — the Stage 2 pages' header, footer and announcements.
 *
 * Milestone F02 makes the primary navigation real: every category label now
 * leads to a working listing page. The chrome copy itself is identical to the
 * approved Stage 1 homepage announcement and footer (the homepage keeps its
 * own copies in `homepage-sample.ts`, untouched).
 *
 * What stays placeholder in F02 on purpose (no such milestone yet — profile,
 * account, back-office, checkout, help, legal pages): those links keep the
 * dev-only placeholder href from `lib/links.ts` and are documented in the
 * milestone report rather than being pointed at something nonexistent.
 */

type ShopNavigation = HomepageData['navigation'];
type ShopFooter = HomepageData['footer'];
type ShopAnnouncement = HomepageData['announcement'];

export const shopAnnouncement: ShopAnnouncement = homepageSample.announcement;

function listingHref(search: string): string {
  return `/products${search}`;
}

export const shopNavigation: ShopNavigation = {
  primary: [
    { label: 'Cookware', href: categoryHref('cookware') },
    { label: 'Bakeware', href: categoryHref('bakeware') },
    { label: 'Tableware', href: categoryHref('tableware') },
    { label: 'Kitchen tools', href: categoryHref('kitchen-tools') },
    { label: 'Storage', href: categoryHref('storage') },
    { label: 'Textiles', href: categoryHref('textiles') },
    {
      label: 'Sets & bundles',
      href: categoryHref('sets-and-bundles'),
      emphasis: true,
      tone: 'offer',
      dividerBefore: true,
    },
    { label: 'New in', href: listingHref('?listing=new_in'), emphasis: true },
    { label: 'Offers', href: listingHref('?listing=on_offer'), emphasis: true },
  ],
  mobileChips: [
    { label: 'All', href: listingHref('') },
    { label: 'Cookware', href: categoryHref('cookware') },
    { label: 'Tableware', href: categoryHref('tableware') },
    { label: 'Sets & bundles', href: categoryHref('sets-and-bundles'), tone: 'offer' },
    { label: 'Bakeware', href: categoryHref('bakeware') },
    { label: 'New in', href: listingHref('?listing=new_in') },
  ],
  /**
   * The mega menu keeps the approved Stage 1 presentation. Sub-type pages
   * (frying pans, saucepans, boards…) are not part of F02, so those links
   * stay dev-only placeholders; only the whole-catalog links are real.
   */
  megaMenu: homepageSample.navigation.megaMenu,
  megaMenuFeature: {
    href: categoryHref('sets-and-bundles'),
    image: homepageSample.navigation.megaMenuFeature.image,
    title: 'Sets, ready to start with →',
  },
};

export const shopFooter: ShopFooter = {
  tagline: homepageSample.footer.tagline,
  columns: [
    {
      title: 'Shop',
      links: [
        { label: 'All products', href: listingHref('') },
        { label: 'Sets & bundles', href: categoryHref('sets-and-bundles') },
        { label: 'New in', href: listingHref('?listing=new_in') },
        { label: 'Offers', href: listingHref('?listing=on_offer') },
      ],
    },
    ...homepageSample.footer.columns.slice(1),
  ],
  copyright: homepageSample.footer.copyright,
  locale: homepageSample.footer.locale,
};
