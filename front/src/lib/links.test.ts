import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homepageSample } from '../data/homepage-sample';
import { shopFooter, shopNavigation } from '../data/shop-sample';
import { catalogCategories } from '../data/catalog-sample';
import { getCatalogBundle, getCatalogProduct } from './catalog';
import { PLACEHOLDER_ROUTE, routes } from './links';

/**
 * Regression for the storefront navigation bug (`/dev/placeholder?for=Cookware`
 * 404s in production while `/products?category=cookware` works): every href in
 * the navigation data must resolve to a page that exists in `src/app`, with a
 * real category, product or set behind it. The only placeholder links allowed
 * are the destinations that have no page yet, listed here explicitly.
 */

const ALLOWED_PLACEHOLDERS = new Set([
  'Help',
  'Help centre',
  'Contact us',
  'Terms of sale',
  'Privacy',
  'Cookies',
]);

/** Route patterns from the app directory (`[param]` → one segment). */
function appRoutePatterns(): RegExp[] {
  const appDir = join(__dirname, '..', 'app');
  const patterns: RegExp[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'page.tsx') {
        // Route groups such as "(listing)" are not part of the URL.
        const route =
          `/${relative(appDir, dir)
            .split(sep)
            .filter((segment) => !/^\(.*\)$/.test(segment))
            .join('/')}`.replace(/\/$/, '') || '/';
        if (route.startsWith('/dev')) continue;
        patterns.push(new RegExp(`^${route.replace(/\[[^\]]+\]/g, '[^/]+')}$`));
      }
    }
  };
  walk(appDir);
  return patterns;
}

const patterns = appRoutePatterns();
const categorySlugs = new Set(catalogCategories.map((category) => category.slug));

function check(href: string): string | null {
  const url = new URL(href, 'http://storefront.test');
  if (url.pathname === PLACEHOLDER_ROUTE) {
    const label = url.searchParams.get('for') ?? '';
    return ALLOWED_PLACEHOLDERS.has(label) ? null : `obsolete placeholder for "${label}"`;
  }
  if (!patterns.some((pattern) => pattern.test(url.pathname))) return `no page for ${url.pathname}`;
  const category = url.searchParams.get('category');
  if (url.pathname === '/products' && category !== null && !categorySlugs.has(category)) {
    return `unknown category "${category}"`;
  }
  const product = /^\/products\/([^/]+)$/.exec(url.pathname);
  if (product && !getCatalogProduct(decodeURIComponent(product[1]!)))
    return `unknown product ${product[1]}`;
  const bundle = /^\/bundles\/([^/]+)$/.exec(url.pathname);
  if (bundle && !getCatalogBundle(decodeURIComponent(bundle[1]!)))
    return `unknown set ${bundle[1]}`;
  return null;
}

function collect(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => collect(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'href' && typeof item === 'string') out.push(item);
      else collect(item, out);
    }
  }
  return out;
}

describe('storefront navigation destinations', () => {
  it('builds category links to the working listing URL', () => {
    expect(routes.category('cookware')).toBe('/products?category=cookware');
  });

  it('homepage navigation, footer and collection links all resolve', () => {
    const hrefs = collect(homepageSample);
    expect(hrefs.length).toBeGreaterThan(40);
    const problems = hrefs
      .map((href) => [href, check(href)])
      .filter(([, problem]) => problem !== null);
    expect(problems).toEqual([]);
  });

  it('shop chrome navigation and footer links all resolve', () => {
    const problems = collect([shopNavigation, shopFooter])
      .map((href) => [href, check(href)])
      .filter(([, problem]) => problem !== null);
    expect(problems).toEqual([]);
  });

  it('homepage category tiles, products and sets have real pages', () => {
    const hrefs = [
      ...homepageSample.categories.map((category) => routes.category(category.slug)),
      ...homepageSample.products.map((product) => routes.product(product.slug)),
      ...homepageSample.bundles.map((bundle) => routes.bundle(bundle.slug)),
      ...homepageSample.hero.hotspots.map((hotspot) => routes.product(hotspot.productSlug)),
    ];
    expect(hrefs.map(check).filter((problem) => problem !== null)).toEqual([]);
  });

  it('rejects the obsolete placeholder for a real destination', () => {
    expect(check('/dev/placeholder?for=Cookware')).toBe('obsolete placeholder for "Cookware"');
  });
});
