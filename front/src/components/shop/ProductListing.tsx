'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_LISTING_QUERY,
  filterListings,
  paginate,
  parseListingQuery,
  serializeListingQuery,
  sortListings,
  sortOptions,
  type CatalogListing,
  type ListingQuery,
  type ListingSort,
} from '../../lib/listing';
import type { CatalogFacets } from '../../lib/catalog-facets';
import {
  catalogColourOptions,
  catalogPriceBands,
  catalogProductTypeFilters,
} from '../../data/catalog-sample';
import type { StorefrontBundle, StorefrontProduct } from '../../data/types';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { VariantSheet } from '../home/VariantSheet';
import { ListingCard } from './ListingCard';
import { FilterGroups } from './FilterGroups';
import styles from './ProductListing.module.css';

/**
 * The Product Listing Page (boards 04/05/06).
 *
 * All filtering, sorting, facet counts and pagination run here, client-side,
 * over the sample listing array — genuinely, not as decoration — and every
 * facet change is written to the URL (`?category=…&colour=…&sort=…&page=…`)
 * through the engine's serializer, so a filtered view survives a reload and
 * browser-back behaves as the boards assume.
 *
 * The result density (3 or 4 cards per row) is a per-device preference per
 * board-03 and stays in localStorage, never in the URL.
 */

export interface ProductListingProps {
  listings: CatalogListing[];
  products: StorefrontProduct[];
  bundles: StorefrontBundle[];
  /** Category pills, brands, colours and materials of the loaded catalogue. */
  facets: CatalogFacets;
}

const DENSITY_KEY = 'hw.listing.density';

/** Per-category intro copy (Sample content, one line each, as the boards show a sub-line under the title). */
const CATEGORY_BLURBS: Record<string, string> = {
  cookware: 'Enamelled cast iron for slow cooking.',
  bakeware: 'Dishes and tins that go from oven to table.',
  tableware: 'Plates and mugs for the daily round.',
  'kitchen-tools': 'Boards, utensils and everything beside the hob.',
  storage: 'Glass and bamboo for the dry goods shelf.',
  textiles: 'Washed linen for a lived-in kitchen.',
  'coffee-and-tea': 'Grinders, kettles and servers for slow mornings.',
  'sets-and-bundles': 'Two kinds of set, labelled so you know how each ships.',
};

const ALL_PRODUCTS_BLURB = 'Cookware, tableware, tools, linen and sets.';
const NEW_IN_BLURB = 'The newest arrivals in the shop.';
const OFFERS_BLURB = 'Current offers — the struck-through price is what you pay.';

export function ProductListing({ listings, products, bundles, facets }: ProductListingProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const query = useMemo(
    () => parseListingQuery(new URLSearchParams(Array.from(searchParams.entries()))),
    [searchParams],
  );

  /** Applies the next query: the URL is the single source of truth. */
  const push = useCallback(
    (next: ListingQuery) => {
      router.replace(`${pathname}${serializeListingQuery(next)}`, { scroll: false });
    },
    [router, pathname],
  );

  /** Any facet change resets the page and keeps the search token. */
  const patch = useCallback(
    (changes: Partial<ListingQuery>) => {
      push({ ...query, ...changes, page: 1 });
    },
    [push, query],
  );

  const toggle = useCallback(<T,>(values: T[], value: T): T[] => {
    return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  }, []);

  // ------------------------------------------------------------------
  // Density — a per-device preference, board-03: "remembered per device".
  // ------------------------------------------------------------------
  const [dense, setDense] = useState(false);
  useEffect(() => {
    try {
      setDense(window.localStorage.getItem(DENSITY_KEY) === '4');
    } catch {
      // Private modes deny storage; the boards' default (3 per row) applies.
    }
  }, []);
  const setDensity = (next: boolean) => {
    setDense(next);
    try {
      window.localStorage.setItem(DENSITY_KEY, next ? '4' : '3');
    } catch {
      // Same as above: preferences without storage degrade to per-view.
    }
  };

  // ------------------------------------------------------------------
  // Engine run — pure functions over the sample array.
  // ------------------------------------------------------------------
  const filtered = useMemo(() => filterListings(listings, query), [listings, query]);
  const sorted = useMemo(() => sortListings(filtered, query), [filtered, query]);
  const page = useMemo(() => paginate(sorted, query.page), [sorted, query.page]);

  // ------------------------------------------------------------------
  // Heading identity (all products / a category / search / quick lists)
  // ------------------------------------------------------------------
  const isSearch = query.q !== undefined;
  const isOffers = query.listing === 'on_offer';
  const isNewIn = query.listing === 'new_in';
  const activeCategory =
    query.categories.length === 1
      ? facets.categories.find((pill) => pill.slug === query.categories[0])
      : undefined;

  const { title, blurb } = useMemo(() => {
    if (isSearch) {
      return {
        title: `Search results for \u201C${query.q}\u201D`,
        blurb: 'Everything that matches your words.',
      };
    }
    if (query.categories.length === 1 && activeCategory) {
      return { title: activeCategory.label, blurb: CATEGORY_BLURBS[activeCategory.slug] ?? '' };
    }
    if (query.categories.length > 1) {
      return {
        title: `${query.categories.length} categories`,
        blurb: 'Products from the selected categories.',
      };
    }
    if (isOffers) return { title: 'Offers', blurb: OFFERS_BLURB };
    if (isNewIn) return { title: 'New in', blurb: NEW_IN_BLURB };
    return { title: 'All products', blurb: ALL_PRODUCTS_BLURB };
  }, [isSearch, query.categories, isOffers, isNewIn, activeCategory, query.q]);

  const crumb = isSearch
    ? 'Search results'
    : activeCategory
      ? activeCategory.label
      : isOffers || isNewIn
        ? title
        : 'All products';

  // ------------------------------------------------------------------
  // Records for the cards (bundles render the set card shape)
  // ------------------------------------------------------------------
  const bundleSlugs = useMemo(() => new Set(bundles.map((bundle) => bundle.slug)), [bundles]);
  const recordMap = useMemo(() => {
    const map = new Map<string, StorefrontProduct | StorefrontBundle>();
    products.forEach((product) => map.set(product.slug, product));
    bundles.forEach((bundle) => map.set(bundle.slug, bundle));
    return map;
  }, [products, bundles]);

  // ------------------------------------------------------------------
  // Applied chips
  // ------------------------------------------------------------------
  const chips = useMemo(() => {
    const rows: { label: string; onRemove: () => void; key: string }[] = [];
    query.categories.forEach((slug) => {
      const pill = facets.categories.find((p) => p.slug === slug);
      if (pill) {
        rows.push({
          key: `c-${slug}`,
          label: pill.label,
          onRemove: () => patch({ categories: query.categories.filter((s) => s !== slug) }),
        });
      }
    });
    query.types.forEach((type) => {
      const index = { single: 0, 'fixed-set': 1, 'dynamic-set': 2 }[type];
      rows.push({
        key: `t-${type}`,
        label: catalogProductTypeFilters[index] ?? type,
        onRemove: () => patch({ types: query.types.filter((t) => t !== type) }),
      });
    });
    query.priceBands.forEach((id) => {
      const band = catalogPriceBands.find((b) => b.id === id);
      if (band) {
        rows.push({
          key: `p-${id}`,
          label: band.label,
          onRemove: () => patch({ priceBands: query.priceBands.filter((b) => b !== id) }),
        });
      }
    });
    query.colours.forEach((id) => {
      const colour = catalogColourOptions.find((c) => c.id === id);
      if (colour) {
        rows.push({
          key: `k-${id}`,
          label: colour.label,
          onRemove: () => patch({ colours: query.colours.filter((c) => c !== id) }),
        });
      }
    });
    query.materials.forEach((material) => {
      rows.push({
        key: `m-${material}`,
        label: material,
        onRemove: () => patch({ materials: query.materials.filter((m) => m !== material) }),
      });
    });
    query.brands.forEach((slug) => {
      const brand = facets.brands.find((b) => b.slug === slug);
      if (brand) {
        rows.push({
          key: `b-${slug}`,
          label: brand.name,
          onRemove: () => patch({ brands: query.brands.filter((b) => b !== slug) }),
        });
      }
    });
    if (query.inStockOnly) {
      rows.push({
        key: 'stock',
        label: 'In stock only',
        onRemove: () => patch({ inStockOnly: false }),
      });
    }
    if (query.onOfferOnly) {
      rows.push({ key: 'offer', label: 'On offer', onRemove: () => patch({ onOfferOnly: false }) });
    }
    if (isOffers) {
      rows.push({
        key: 'listing-offer',
        label: 'Offers',
        onRemove: () => push({ ...query, listing: undefined, page: 1 }),
      });
    }
    if (isNewIn) {
      rows.push({
        key: 'listing-new',
        label: 'New in',
        onRemove: () => push({ ...query, listing: undefined, page: 1 }),
      });
    }
    return rows;
  }, [query, patch, push, isOffers, isNewIn, facets]);

  const clearAll = useCallback(() => {
    push({ ...DEFAULT_LISTING_QUERY, q: query.q, listing: query.listing });
  }, [push, query.q, query.listing]);

  // ------------------------------------------------------------------
  // Sorting + mobile sheets
  // ------------------------------------------------------------------
  const options = sortOptions(isSearch);
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null);
  const openSheet = (which: 'filters' | 'sort') => {
    setSheet(which);
  };

  // ------------------------------------------------------------------
  // The "Choose options" sheet, reused from the homepage (F01 component).
  // ------------------------------------------------------------------
  const [variantState, setVariantState] = useState<{
    product: StorefrontProduct;
    colourId: string | undefined;
    key: number;
  } | null>(null);
  const onChooseOptions = useCallback(
    (product: StorefrontProduct, colourId: string | undefined) => {
      setVariantState((prev) => ({ product, colourId, key: (prev?.key ?? 0) + 1 }));
    },
    [],
  );

  const showEmptyState = page.items.length === 0;

  return (
    <div className={styles.page}>
      {/* board-05: the narrow layout shows a single back link, not the trail */}
      <Link href="/" className={`${styles.crumbsBack} ${styles.mobileOnly}`}>
        <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
        Home
      </Link>

      <nav className={`${styles.crumbs} ${styles.desktopOnly}`} aria-label="Breadcrumb">
        <Link href="/" className={styles.crumbsLink}>
          Home
        </Link>
        <span className={styles.crumbSep} aria-hidden="true">
          /
        </span>
        <span className={styles.crumbsCurrent}>{crumb}</span>
      </nav>

      <header className={styles.heading}>
        <h1 className={styles.title} key={title} data-intro data-split="words">
          {title}
        </h1>
        <p className={styles.blurb}>{blurb}</p>
      </header>

      <nav className={styles.pills} aria-label="Shop by category">
        {facets.categories.map((pill) => {
          const active = query.categories.includes(pill.slug);
          return (
            <Link
              key={pill.slug}
              href={`/products?category=${pill.slug}`}
              className={`${styles.pill} ${active ? styles.pillActive : ''}`}
              aria-current={active ? 'true' : undefined}
            >
              <StorefrontImage image={pill.image} alt="" className={styles.pillImage} />
              {pill.label}
            </Link>
          );
        })}
      </nav>

      {/* mobile toolbar (sticky, board-05): under the title and category pills */}
      <div className={`${styles.mobileToolbar} ${styles.mobileOnly}`}>
        <div className={styles.mobileButtons}>
          <button
            type="button"
            className={styles.mobileButton}
            onClick={() => openSheet('filters')}
          >
            <Icon name="sliders" size={18} strokeWidth={1.8} />
            Filters{chips.length > 0 ? ` · ${chips.length}` : ''}
          </button>
          <button type="button" className={styles.mobileButton} onClick={() => openSheet('sort')}>
            <Icon name="sort-arrows" size={18} strokeWidth={1.8} />
            {options.find((option) => option.value === query.sort)?.label ?? 'Sort'}
          </button>
        </div>
        <div className={styles.mobileCountRow}>
          <span className={styles.count} role="status" aria-live="polite">
            <strong>{page.total}</strong> {page.total === 1 ? 'product' : 'products'}
          </span>
        </div>
      </div>

      <div className={styles.columns}>
        <aside className={styles.sidebar} aria-label="Filters">
          <div className={styles.filtersHead}>
            <h2 className={styles.filtersTitle}>Filters</h2>
            {chips.length > 0 ? (
              <button type="button" className={styles.clearAll} onClick={clearAll}>
                Clear all
              </button>
            ) : null}
          </div>
          <FilterGroups
            listings={listings}
            facets={facets}
            query={query}
            ids="fl"
            onToggleCategory={(slug) => patch({ categories: toggle(query.categories, slug) })}
            onToggleType={(id) => patch({ types: toggle(query.types, id) })}
            onTogglePriceBand={(id) => patch({ priceBands: toggle(query.priceBands, id) })}
            onToggleColour={(id) => patch({ colours: toggle(query.colours, id) })}
            onToggleMaterial={(material) => patch({ materials: toggle(query.materials, material) })}
            onToggleBrand={(slug) => patch({ brands: toggle(query.brands, slug) })}
            onToggleInStock={() => patch({ inStockOnly: !query.inStockOnly })}
            onToggleOnOffer={() => patch({ onOfferOnly: !query.onOfferOnly })}
          />
        </aside>

        <section className={styles.results} aria-label="Products">
          <div className={`${styles.toolbar} ${styles.desktopOnly}`}>
            <span className={styles.count} role="status" aria-live="polite">
              <strong>{page.total}</strong> {page.total === 1 ? 'product' : 'products'}
            </span>
            <div className={styles.toolbarRight}>
              <label className={styles.sortLabel} htmlFor="p-sort">
                Sort by
              </label>
              <span className={styles.sortWrap}>
                <select
                  id="p-sort"
                  className={styles.sortSelect}
                  value={query.sort}
                  onChange={(event) => patch({ sort: event.target.value as ListingSort })}
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon
                  name="chevron-down"
                  size={16}
                  strokeWidth={2}
                  className={styles.sortChevron}
                />
              </span>
              <div className={styles.density} role="group" aria-label="Grid density">
                <button
                  type="button"
                  className={styles.densityBtn}
                  aria-label="3 per row"
                  aria-pressed={!dense}
                  onClick={() => setDensity(false)}
                >
                  <Icon name="grid-3" size={18} fill="currentColor" stroke="none" />
                </button>
                <button
                  type="button"
                  className={styles.densityBtn}
                  aria-label="4 per row"
                  aria-pressed={dense}
                  onClick={() => setDensity(true)}
                >
                  <Icon name="grid-4" size={18} fill="currentColor" stroke="none" />
                </button>
              </div>
            </div>
          </div>

          {chips.length > 0 ? (
            <div className={styles.chipsRow}>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={styles.chip}
                  onClick={chip.onRemove}
                >
                  {chip.label}
                  <Icon name="close" size={13} strokeWidth={2.2} />
                </button>
              ))}
              <button type="button" className={styles.chipClear} onClick={clearAll}>
                Clear all
              </button>
            </div>
          ) : null}

          {showEmptyState ? (
            <NoResults query={query} facets={facets} onClearAll={clearAll} />
          ) : (
            <>
              <div
                className={dense ? `${styles.grid} ${styles.gridDense}` : styles.grid}
                data-reveal-stagger
              >
                {page.items.map((listing) => {
                  const record = recordMap.get(listing.slug);
                  if (record === undefined) return null;
                  return bundleSlugs.has(listing.slug) ? (
                    <ListingCard
                      key={listing.slug}
                      model={{ kind: 'bundle', bundle: record as StorefrontBundle }}
                      onChooseOptions={onChooseOptions}
                    />
                  ) : (
                    <ListingCard
                      key={listing.slug}
                      model={{ kind: 'product', product: record as StorefrontProduct }}
                      onChooseOptions={onChooseOptions}
                    />
                  );
                })}
              </div>

              <footer className={styles.progress}>
                <span className={styles.progressLabel}>
                  Showing <strong>{page.shown}</strong> of <strong>{page.total}</strong>{' '}
                  {page.total === 1 ? 'product' : 'products'}
                </span>
                <span
                  className={styles.progressBar}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={page.total}
                  aria-valuenow={page.shown}
                >
                  <span
                    className={styles.progressFill}
                    style={{ width: `${(page.shown / Math.max(page.total, 1)) * 100}%` }}
                  />
                </span>
                {page.hasMore ? (
                  <button
                    type="button"
                    className={styles.loadMore}
                    onClick={() => push({ ...query, page: query.page + 1 })}
                  >
                    Load more
                  </button>
                ) : (
                  <span className={styles.progressComplete}>You’ve seen everything here</span>
                )}
              </footer>
            </>
          )}
        </section>
      </div>

      {sheet !== null ? (
        <SheetOverlay
          facets={facets}
          sheet={sheet}
          initial={query}
          listings={listings}
          options={options}
          onApply={(next) => {
            push({ ...next, page: 1 });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {variantState ? (
        <VariantSheet
          key={variantState.key}
          product={variantState.product}
          initialColourId={variantState.colourId}
          onClose={() => setVariantState(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * No-results — board-06 §2/§5: keep the query, explain, route back.
 * ------------------------------------------------------------------ */

function NoResults({
  query,
  facets,
  onClearAll,
}: {
  query: ListingQuery;
  facets: CatalogFacets;
  onClearAll: () => void;
}) {
  if (query.q) {
    return (
      <div className={styles.empty}>
        <h2 className={styles.emptyTitle}>No results for “{query.q}”</h2>
        <p className={styles.emptyBody}>
          The shop only shows what exists — nothing is invented to fill the space.
        </p>
        <div className={styles.emptyTips}>
          <strong className={styles.emptyTipsTitle}>Try these</strong>
          <ul className={styles.emptyTipsList}>
            <li>Check the spelling</li>
            <li>Use a broader word, like “pan” or “cookware”</li>
            <li>Search by material: cast iron, stoneware, steel</li>
          </ul>
        </div>
        <form role="search" action="/products" className={styles.searchAgain}>
          <label htmlFor="nr-q" className={styles.searchAgainLabel}>
            Search again
          </label>
          <input
            id="nr-q"
            name="q"
            defaultValue={query.q}
            className={styles.searchAgainInput}
            type="search"
          />
          <button type="submit" className={styles.searchAgainBtn}>
            Search
          </button>
        </form>
        <div className={styles.emptyBrowse}>
          <strong className={styles.emptyTipsTitle}>Browse by category</strong>
          <div className={styles.emptyTiles}>
            {facets.categories.slice(0, 4).map((pill) => (
              <Link
                key={pill.slug}
                href={`/products?category=${pill.slug}`}
                className={styles.emptyTile}
              >
                <StorefrontImage image={pill.image} alt="" className={styles.pillImage} />
                {pill.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const onlyCategory = query.categories.length === 1;
  const categoryLabel = facets.categories.find((p) => p.slug === query.categories[0])?.label;

  return (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>
        {onlyCategory && categoryLabel
          ? `Nothing in ${categoryLabel} yet`
          : 'Nothing matches these filters'}
      </h2>
      <p className={styles.emptyBody}>
        {onlyCategory && categoryLabel
          ? 'Have a look at the rest of the shop in the meantime.'
          : 'Try removing a colour, a price band or a switch — then widen from there.'}
      </p>
      {anyFacetActive(query) ? (
        <button type="button" className={styles.retry} onClick={onClearAll}>
          Clear all filters
        </button>
      ) : (
        <Link href="/products" className={`${styles.retry} ${styles.retryLink}`}>
          Browse all products
        </Link>
      )}
    </div>
  );
}

/** Whether any facet chip would currently be applied. */
function anyFacetActive(query: ListingQuery): boolean {
  return (
    query.categories.length > 0 ||
    query.types.length > 0 ||
    query.priceBands.length > 0 ||
    query.colours.length > 0 ||
    query.materials.length > 0 ||
    query.brands.length > 0 ||
    query.inStockOnly ||
    query.onOfferOnly ||
    query.listing !== undefined
  );
}

/* ------------------------------------------------------------------ *
 * Sheets (mobile, board-05): Filters and Sort, with a local draft that
 * only commits on Apply (or Done), like the board's footer button.
 * ------------------------------------------------------------------ */

function SheetOverlay({
  facets,
  sheet,
  initial,
  listings,
  options,
  onApply,
  onClose,
}: {
  facets: CatalogFacets;
  sheet: 'filters' | 'sort';
  initial: ListingQuery;
  listings: CatalogListing[];
  options: { value: ListingSort; label: string }[];
  onApply: (next: ListingQuery) => void;
  onClose: () => void;
}) {
  // Seeds from the committed query at mount; the sheet remounts per open.
  const [draft, setDraft] = useState<ListingQuery>(initial);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const draftCount = useMemo(() => filterListings(listings, draft).length, [listings, draft]);

  const toggle = <T,>(values: T[], value: T): T[] =>
    values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={sheet === 'filters' ? 'Filters' : 'Sort products'}
      >
        <div className={styles.sheetHead}>
          <h2 className={styles.sheetTitle}>{sheet === 'filters' ? 'Filters' : 'Sort'}</h2>
          <button
            type="button"
            ref={closeRef}
            aria-label="Close"
            className={styles.sheetClose}
            onClick={onClose}
          >
            <Icon name="close" size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div className={styles.sheetBody}>
          {sheet === 'filters' ? (
            <FilterGroups
              listings={listings}
              facets={facets}
              query={draft}
              ids="sheet"
              onToggleCategory={(slug) =>
                setDraft((prev) => ({ ...prev, categories: toggle(prev.categories, slug) }))
              }
              onToggleType={(id) =>
                setDraft((prev) => ({ ...prev, types: toggle(prev.types, id) }))
              }
              onTogglePriceBand={(id) =>
                setDraft((prev) => ({ ...prev, priceBands: toggle(prev.priceBands, id) }))
              }
              onToggleColour={(id) =>
                setDraft((prev) => ({ ...prev, colours: toggle(prev.colours, id) }))
              }
              onToggleMaterial={(material) =>
                setDraft((prev) => ({ ...prev, materials: toggle(prev.materials, material) }))
              }
              onToggleBrand={(slug) =>
                setDraft((prev) => ({ ...prev, brands: toggle(prev.brands, slug) }))
              }
              onToggleInStock={() =>
                setDraft((prev) => ({ ...prev, inStockOnly: !prev.inStockOnly }))
              }
              onToggleOnOffer={() =>
                setDraft((prev) => ({ ...prev, onOfferOnly: !prev.onOfferOnly }))
              }
            />
          ) : (
            <div role="radiogroup" aria-label="Sort products">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.sort === option.value}
                  className={styles.sortRow}
                  onClick={() => setDraft((prev) => ({ ...prev, sort: option.value }))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.sheetFoot}>
          <button type="button" className={styles.sheetApply} onClick={() => onApply(draft)}>
            {sheet === 'filters' ? `Show ${draftCount} products` : 'Done'}
          </button>
          <button
            type="button"
            className={styles.sheetClear}
            onClick={() =>
              setDraft({
                ...DEFAULT_LISTING_QUERY,
                q: draft.q,
                listing: draft.listing,
                sort: draft.sort,
              })
            }
          >
            Clear filters
          </button>
        </div>
      </div>
    </>
  );
}
