'use client';

import { Fragment, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { Pulse } from '../../motion/Pulse';
import { StorefrontImage } from '../ui/StorefrontImage';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import { useCartWishlist } from '../providers/CartWishlistProvider';
import { useOptionalSession } from '../providers/SessionProvider';
import { routes } from '../../lib/links';
import type { HomepageData } from '../../data/types';
import styles from './SiteHeader.module.css';

const SEARCH_SCOPES = [
  'All categories',
  'Cookware',
  'Tableware',
  'Bakeware',
  'Kitchen tools',
  'Storage',
  'Textiles',
];

/**
 * Narrow-layout header variants, per the approved mobile boards:
 * - `full` (homepage): search field and the category chip row.
 * - `search` (product listing): search field; the page shows its own chips.
 * - `compact` (product, set, cart, checkout and account pages): menu and a
 *   search icon at the start, account and cart at the end, nothing below.
 * The wide layout is the same for every variant.
 */
export type MobileHeaderVariant = 'full' | 'search' | 'compact';

export function SiteHeader({
  navigation,
  mobileVariant = 'full',
}: {
  navigation: HomepageData['navigation'];
  mobileVariant?: MobileHeaderVariant;
}) {
  const compact = mobileVariant === 'compact';
  // F06: signed in, the account entries lead to the account instead of the sheet.
  const principal = useOptionalSession()?.principal ?? null;
  const accountHref = principal?.role === 'ADMIN' ? '/admin' : '/account';
  const [megaOpen, setMegaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchId = useId();
  const scopeId = useId();
  const { requestSignIn } = useStorefrontUi();
  /* Stage 3: live demo counts for the cart & wishlist badges. The store is
     sample data only; no backend cart exists in this milestone. */
  const { cartCount, wishlistEntries: wishlistItems } = useCartWishlist();
  const wishlistCount = wishlistItems.length;

  useEffect(() => {
    if (!megaOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMegaOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [megaOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* ---------- wide layout ---------- */}
        <div className={styles.topRow}>
          <Link href="/" aria-label="Nordhaven Commerce home" className={styles.wordmark}>
            <span className={styles.wordmarkMain}>Nordhaven</span>
            <span className={styles.wordmarkSub}>Commerce</span>
          </Link>

          <form role="search" className={styles.search} action="/products">
            {/* The category <select> is presentation-only (no name), so the
                form submits a clean `?q=`; F02's listing reads it. */}
            <label htmlFor={scopeId} className="hw-visually-hidden">
              Search in
            </label>
            <select id={scopeId} className={styles.scope} defaultValue="All categories">
              {SEARCH_SCOPES.map((scope) => (
                <option key={scope}>{scope}</option>
              ))}
            </select>
            <label htmlFor={searchId} className="hw-visually-hidden">
              Search products
            </label>
            <input
              id={searchId}
              type="search"
              name="q"
              placeholder="Search casseroles, plates, linen…"
              className={styles.searchInput}
            />
            <button type="submit" aria-label="Search" className={styles.searchButton}>
              <Icon name="search" size={19} strokeWidth={2} />
            </button>
          </form>

          <nav aria-label="Account" className={styles.accountNav}>
            {principal ? (
              <Link href={accountHref} className={styles.accountLink}>
                <Icon name="user" size={22} strokeWidth={1.6} />
                <span className={styles.accountText}>
                  <span className={styles.accountHint}>Hello</span>
                  <span className={styles.accountLabel}>
                    {principal.role === 'ADMIN' ? 'Admin' : 'My account'}
                  </span>
                </span>
              </Link>
            ) : (
              <a
                href={routes.signIn}
                className={styles.accountLink}
                onClick={(event) => {
                  event.preventDefault();
                  requestSignIn('account');
                }}
              >
                <Icon name="user" size={22} strokeWidth={1.6} />
                <span className={styles.accountText}>
                  <span className={styles.accountHint}>Welcome</span>
                  <span className={styles.accountLabel}>Sign in</span>
                </span>
              </a>
            )}
            <Link
              href="/wishlist"
              aria-label={`Wishlist, ${wishlistCount} ${wishlistCount === 1 ? 'item' : 'items'}`}
              className={styles.accountLink}
            >
              <Icon name="heart" size={22} strokeWidth={1.6} />
              Wishlist
              {wishlistCount > 0 ? (
                <Pulse className={styles.wishCount} value={wishlistCount}>
                  {wishlistCount}
                </Pulse>
              ) : null}
            </Link>
            <Link
              href="/cart"
              aria-label={`Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
              className={styles.cartLink}
            >
              <Icon name="bag" size={21} strokeWidth={1.7} />
              Cart
              <Pulse className={styles.cartCount} value={cartCount}>
                {cartCount}
              </Pulse>
            </Link>
          </nav>
        </div>

        {/* ---------- wide layout: category navigation ---------- */}
        <nav aria-label="Categories" className={styles.primaryNav}>
          <button
            type="button"
            aria-expanded={megaOpen}
            aria-controls="hw-mega-menu"
            className={styles.allCategories}
            onClick={() => setMegaOpen((open) => !open)}
          >
            <Icon name="menu" size={18} strokeWidth={2} />
            All categories
            <Icon
              name="chevron-down"
              size={14}
              strokeWidth={2.2}
              className={megaOpen ? styles.chevronOpen : undefined}
            />
          </button>
          {navigation.primary.map((link) => (
            <Fragment key={link.label}>
              {link.dividerBefore ? (
                <span aria-hidden="true" className={styles.navDivider} />
              ) : null}
              <Link
                href={link.href}
                className={`${styles.primaryLink} ${link.tone === 'offer' ? styles.offerLink : ''} ${
                  link.emphasis ? styles.emphasisedLink : ''
                }`}
              >
                {link.label}
              </Link>
            </Fragment>
          ))}
        </nav>

        {/* ---------- narrow layout ---------- */}
        <div className={styles.mobileRow}>
          <div className={styles.mobileStart}>
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className={styles.iconButton}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" size={24} strokeWidth={1.8} />
            </button>
            {compact ? (
              <Link href="/products" aria-label="Search products" className={styles.iconButton}>
                <Icon name="search" size={21} strokeWidth={1.8} />
              </Link>
            ) : principal ? (
              <Link href={accountHref} aria-label="My account" className={styles.iconButton}>
                <Icon name="user" size={22} strokeWidth={1.6} />
              </Link>
            ) : (
              <a
                href={routes.signIn}
                aria-label="Sign in"
                className={styles.iconButton}
                onClick={(event) => {
                  event.preventDefault();
                  requestSignIn('account');
                }}
              >
                <Icon name="user" size={22} strokeWidth={1.6} />
              </a>
            )}
          </div>
          <Link href="/" aria-label="Nordhaven Commerce home" className={styles.mobileWordmark}>
            <span className={styles.mobileWordmarkMain}>Nordhaven</span>
            <span className={styles.mobileWordmarkSub}>Commerce</span>
          </Link>
          <div className={styles.mobileEnd}>
            {compact ? (
              principal ? (
                <Link href={accountHref} aria-label="My account" className={styles.iconButton}>
                  <Icon name="user" size={22} strokeWidth={1.6} />
                </Link>
              ) : (
                <a
                  href={routes.signIn}
                  aria-label="Sign in"
                  className={styles.iconButton}
                  onClick={(event) => {
                    event.preventDefault();
                    requestSignIn('account');
                  }}
                >
                  <Icon name="user" size={22} strokeWidth={1.6} />
                </a>
              )
            ) : (
              <Link
                href="/wishlist"
                aria-label={`Wishlist, ${wishlistCount} ${wishlistCount === 1 ? 'item' : 'items'}`}
                className={styles.iconButton}
              >
                <Icon name="heart" size={22} strokeWidth={1.6} />
                {wishlistCount > 0 ? (
                  <Pulse className={styles.mobileWishCount} value={wishlistCount}>
                    {wishlistCount}
                  </Pulse>
                ) : null}
              </Link>
            )}
            <Link
              href="/cart"
              aria-label={`Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
              className={styles.iconButton}
            >
              <Icon name="bag" size={21} strokeWidth={1.7} />
              <Pulse className={styles.mobileCartCount} value={cartCount}>
                {cartCount}
              </Pulse>
            </Link>
          </div>
        </div>

        {compact ? null : (
          <form role="search" className={styles.mobileSearch} action="/products">
            <Icon name="search" size={19} stroke="var(--hw-text-muted)" strokeWidth={1.9} />
            <label htmlFor={`${searchId}-mobile`} className="hw-visually-hidden">
              Search products
            </label>
            <input
              id={`${searchId}-mobile`}
              type="search"
              name="q"
              placeholder="Search casseroles, plates, linen…"
              className={styles.mobileSearchInput}
            />
          </form>
        )}

        {mobileVariant === 'full' ? (
          <nav aria-label="Categories" className={styles.chipNav}>
            {navigation.mobileChips.map((chip, index) => (
              <Link
                key={chip.label}
                href={chip.href}
                className={`${styles.chip} ${index === 0 ? styles.chipActive : ''} ${
                  chip.tone === 'offer' ? styles.chipOffer : ''
                }`}
              >
                {chip.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {megaOpen ? (
        <div id="hw-mega-menu" className={`${styles.megaMenu} hw-anim-drop`} data-lenis-prevent>
          <div className={styles.megaInner}>
            {navigation.megaMenu.map((column, index) => (
              <div key={index} className={styles.megaColumn}>
                {column.groups.map((group) => (
                  <div key={group.heading} className={styles.megaGroup}>
                    {group.links.length > 0 ? (
                      <>
                        <p
                          className={`${styles.megaHeading} ${
                            group.heading === 'Shop all products' ? styles.megaHeadingOffer : ''
                          }`}
                        >
                          {group.heading}
                        </p>
                        {group.links.map((link) => (
                          <Link key={link.label} href={link.href} className={styles.megaLink}>
                            {link.label}
                          </Link>
                        ))}
                      </>
                    ) : (
                      <p className={styles.megaHeading}>{group.heading}</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <Link href={navigation.megaMenuFeature.href} className={styles.megaFeature}>
              <span className={styles.megaFeatureMedia}>
                <StorefrontImage
                  image={navigation.megaMenuFeature.image}
                  alt=""
                  fill
                  sizes="300px"
                  className={styles.megaFeatureImage}
                />
              </span>
              <span className={styles.megaFeatureTitle}>{navigation.megaMenuFeature.title}</span>
            </Link>
          </div>
        </div>
      ) : null}

      {menuOpen ? (
        <div
          className={`${styles.mobileMenuBackdrop} hw-anim-backdrop`}
          onClick={() => setMenuOpen(false)}
        >
          <nav
            aria-label="Main menu"
            className={`${styles.mobileMenu} hw-anim-drawer`}
            data-lenis-prevent
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.mobileMenuHead}>
              <span className={styles.mobileMenuTitle}>Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                className={styles.iconButton}
                onClick={() => setMenuOpen(false)}
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className={styles.mobileMenuBody}>
              {navigation.megaMenu[0]?.groups.map((group) =>
                group.links.length > 0 ? (
                  <details key={group.heading} open={group.heading === 'Cookware'}>
                    <summary>{group.heading}</summary>
                    <div className={styles.mobileMenuSub}>
                      {group.links.map((link) => (
                        <Link key={link.label} href={link.href}>
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : null,
              )}
              <Link href={routes.category('sets-and-bundles')} className={styles.mobileMenuOffer}>
                Sets &amp; bundles
              </Link>
            </div>
            <div className={styles.mobileMenuFoot}>
              <a
                href={routes.signIn}
                className={styles.mobileMenuAccount}
                onClick={(event) => {
                  event.preventDefault();
                  setMenuOpen(false);
                  requestSignIn('account');
                }}
              >
                Sign in or create account
              </a>
              <span className={styles.mobileMenuMeta}>Help · EGP · English</span>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
