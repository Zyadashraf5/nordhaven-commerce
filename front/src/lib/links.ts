/**
 * Storefront destinations.
 *
 * `routes` holds every customer-facing destination that exists in the app.
 * Navigation data and components build their hrefs from it so a link can't
 * drift to a page that isn't there (see `links.test.ts`).
 *
 * `placeholderHref` remains only for destinations with no page yet (help,
 * contact, legal, curated collections). It points at a development-only
 * route that 404s in production builds (`src/app/dev/placeholder/page.tsx`);
 * those links are listed in `front/docs/f06-handoff.md` for a decision.
 */

export const PLACEHOLDER_ROUTE = '/dev/placeholder';

export function placeholderHref(label: string): string {
  return `${PLACEHOLDER_ROUTE}?for=${encodeURIComponent(label)}`;
}

export const routes = {
  home: '/',
  products: '/products',
  newIn: '/products?listing=new_in',
  offers: '/products?listing=on_offer',
  category: (slug: string) => `/products?category=${encodeURIComponent(slug)}`,
  product: (slug: string) => `/products/${encodeURIComponent(slug)}`,
  bundle: (slug: string) => `/bundles/${encodeURIComponent(slug)}`,
  cart: '/cart',
  wishlist: '/wishlist',
  account: '/account',
  orders: '/account/orders',
  order: (id: string) => `/account/orders/${encodeURIComponent(id)}`,
  preOrders: '/account/pre-orders',
  returns: '/account/returns',
  reviews: '/account/reviews',
  notifications: '/account/notifications',
  signIn: '/account/sign-in',
} as const;
