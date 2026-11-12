'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { useCartWishlist, type LiveWishlistEntry } from '../providers/CartWishlistProvider';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import { AccountSidebar } from '../layout/AccountSidebar';
import { VariantSheet } from '../home/VariantSheet';
import { formatMoney } from '../../data/money';
import { defaultColourId } from '../../lib/variant';
import type { StorefrontProduct } from '../../data/types';
import styles from './WishlistPage.module.css';

/**
 * The wishlist page (Stage 3 wishlist boards) on the customer's live wishlist
 * (F06: `/customers/me/wishlist`). Prices are the API's current prices; the
 * public API has no stock figure, so availability is confirmed at checkout.
 * Moving an item to the cart adds the exact variant chosen; nothing here
 * reserves inventory.
 */

export function WishlistPage() {
  const {
    wishlistEntries,
    products,
    removeFromWishlist,
    undo,
    toast,
    dismissToast,
    moveToCart,
    status,
    loadError,
    reload,
    busy,
  } = useCartWishlist();
  const { requestSignIn } = useStorefrontUi();
  const [pickerSlug, setPickerSlug] = useState<string | null>(null);
  const pickerProduct = pickerSlug === null ? null : (products.get(pickerSlug) ?? null);

  const openPicker = (entry: LiveWishlistEntry) => setPickerSlug(entry.key);
  const closePicker = () => setPickerSlug(null);

  const count = status === 'ready' ? wishlistEntries.length : 0;

  return (
    <div className={styles.main}>
      {/* Narrow board: a back link to the account replaces the section menu. */}
      <Link href="/account" className={styles.mobileBack}>
        <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
        My account
      </Link>
      <div className={styles.columns}>
        <div className={styles.sidebarSlot}>
          <AccountSidebar />
        </div>
        <section aria-labelledby="wl-h" className={styles.content}>
          <div className={styles.headRow}>
            <div className={styles.headTitles}>
              <h1 id="wl-h" className={styles.headline}>
                Wishlist
              </h1>
              <p className={styles.headlineBody}>
                Things you’ve saved. Prices and availability are shown as they are now.
              </p>
            </div>
            {status === 'ready' && count > 0 ? (
              <span role="status" className={styles.countText}>
                <strong className={styles.countStrong}>
                  {count} {count === 1 ? 'saved item' : 'saved items'}
                </strong>
              </span>
            ) : null}
          </div>

          {status !== 'ready' ? (
            <WishlistState
              status={status}
              message={loadError}
              onRetry={() => void reload()}
              onSignIn={() => requestSignIn('wishlist')}
            />
          ) : count > 0 ? (
            <>
              <div className={styles.grid} data-reveal-stagger>
                {wishlistEntries.map((entry) => (
                  <WishCard
                    key={entry.key}
                    entry={entry}
                    product={products.get(entry.key)}
                    busy={busy}
                    onRemove={() => removeFromWishlist(entry.key)}
                    onOptions={() => openPicker(entry)}
                    onMoveToCart={() => moveToCart(entry.key)}
                  />
                ))}
              </div>
              <p className={styles.footnote}>
                Saving an item doesn’t reserve it. Availability is confirmed at checkout.
              </p>
            </>
          ) : (
            <div className={styles.emptyBox}>
              <Icon name="heart" size={44} strokeWidth={1.2} className={styles.emptyIcon} />
              <strong className={styles.emptyTitle}>Your wishlist is empty</strong>
              <span className={styles.emptyBody}>
                Tap the heart on any product to save it here. You can move saved items to your cart
                whenever you’re ready.
              </span>
              <div className={styles.emptyActions}>
                <Link href="/products" className={styles.emptyPrimary}>
                  Browse all products
                </Link>
                <Link href="/products?category=sets-and-bundles" className={styles.emptyOutline}>
                  Sets &amp; bundles
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast !== null ? (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`${styles.toast} hw-anim-toast`}
        >
          <span aria-hidden="true" className={styles.toastCheck}>
            {toast.kind === 'error' ? '!' : '✓'}
          </span>
          <span className={styles.toastText}>{toast.text}</span>
          {toast.withUndo ? (
            <button type="button" className={styles.toastUndo} onClick={undo}>
              Undo
            </button>
          ) : null}
          {toast.withCart ? (
            <Link href="/cart" className={styles.toastLink}>
              View cart
            </Link>
          ) : null}
          {toast.kind === 'error' ? (
            <button type="button" className={styles.toastUndo} onClick={dismissToast}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      {pickerSlug !== null && pickerProduct !== null ? (
        <VariantSheet
          product={pickerProduct}
          initialColourId={defaultColourId(pickerProduct)}
          onClose={closePicker}
          addLabel="Move to cart"
          onAdd={(selection) => {
            moveToCart(pickerSlug, { colourId: selection.colourId, sizeId: selection.sizeId });
          }}
        />
      ) : null}
    </div>
  );
}

function WishlistState({
  status,
  message,
  onRetry,
  onSignIn,
}: {
  status: 'loading' | 'signed-out' | 'not-customer' | 'error';
  message: string | null;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  if (status === 'loading') {
    return (
      <div className={styles.emptyBox} role="status" aria-live="polite">
        <span className={styles.emptyBody}>Loading your saved items…</span>
      </div>
    );
  }
  if (status === 'signed-out' || status === 'not-customer') {
    return (
      <div className={styles.emptyBox}>
        <Icon name="heart" size={44} strokeWidth={1.2} className={styles.emptyIcon} />
        <strong className={styles.emptyTitle}>
          {status === 'signed-out'
            ? 'Sign in to see your wishlist'
            : 'Wishlists belong to customer accounts'}
        </strong>
        <span className={styles.emptyBody}>
          {status === 'signed-out'
            ? 'Your wishlist is kept with your account, so it’s there on any device.'
            : 'You’re signed in as an administrator. Sign in with a customer account to save items.'}
        </span>
        {status === 'signed-out' ? (
          <div className={styles.emptyActions}>
            <button type="button" className={styles.emptyPrimary} onClick={onSignIn}>
              Sign in
            </button>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.emptyBox} role="alert">
      <Icon name="alert" size={40} strokeWidth={1.4} className={styles.emptyIcon} />
      <strong className={styles.emptyTitle}>We couldn’t load your wishlist</strong>
      <span className={styles.emptyBody}>{message ?? 'Please try again.'}</span>
      <div className={styles.emptyActions}>
        <button type="button" className={styles.emptyPrimary} onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One wishlist card
 * ------------------------------------------------------------------ */

function WishCard({
  entry,
  product,
  busy,
  onRemove,
  onOptions,
  onMoveToCart,
}: {
  entry: LiveWishlistEntry;
  product: StorefrontProduct | undefined;
  busy: boolean;
  onRemove: () => void;
  onOptions: () => void;
  onMoveToCart: () => void;
}) {
  const discountBadge =
    entry.wasEgp !== undefined && entry.wasEgp !== 0
      ? `−${Math.round((1 - entry.priceEgp / entry.wasEgp) * 100)}%`
      : null;

  const availability = (() => {
    switch (entry.kind) {
      // The public API has no stock figure: availability is confirmed at checkout.
      case 'options':
      case 'add':
        return {
          icon: 'info' as const,
          tone: styles.availMuted,
          text: 'Availability confirmed at checkout',
        };
      case 'out':
        return { icon: 'cross' as const, tone: styles.availMuted, text: 'No longer available' };
      case 'pre':
        return {
          icon: 'clock' as const,
          tone: styles.availInfo,
          text: entry.preOrderNote ?? 'Pre-order · charged only when in stock',
        };
      case 'view':
        return entry.setKind === 'fixed'
          ? { icon: 'check' as const, tone: styles.availOk, text: 'In stock as a packed set' }
          : { icon: 'check' as const, tone: styles.availOk, text: 'All 3 items in stock' };
    }
  })();

  return (
    <article className={styles.card}>
      <div className={styles.cardMedia}>
        <Link href={entry.href} tabIndex={-1} aria-hidden="true" className={styles.cardImageLink}>
          <StorefrontImage image={entry.image} alt="" className={styles.cardImage} sizes="260px" />
        </Link>
        {discountBadge !== null ? (
          <span
            className={styles.cardBadge}
            style={{ background: 'var(--hw-text-offer)', color: 'var(--hw-text-on-dark)' }}
          >
            {discountBadge}
          </span>
        ) : null}
        {entry.kind === 'pre' ? (
          <span className={`${styles.cardBadge} ${styles.cardBadgePre}`}>Pre-order</span>
        ) : null}
        {entry.kind === 'view' ? (
          <span
            className={styles.cardBadge}
            style={
              entry.setKind === 'fixed'
                ? { background: 'var(--hw-bg-muted)', color: 'var(--hw-text-offer)' }
                : { background: 'var(--hw-bg-well-cool)', color: 'var(--hw-status-available)' }
            }
          >
            {entry.setKind === 'fixed' ? 'Ready-packed set' : 'Set of individual items'}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${entry.name} from wishlist`}
          aria-pressed="true"
          className={styles.cardHeart}
          onClick={onRemove}
          disabled={busy}
        >
          <Icon
            name="heart"
            size={20}
            strokeWidth={1.6}
            fill="var(--hw-action-primary)"
            stroke="var(--hw-action-primary)"
            aria-hidden="true"
          />
        </button>
      </div>

      <div className={styles.cardBody}>
        {entry.kind === 'options' ? (
          <div aria-hidden="true" className={styles.cardSwatchRow}>
            {(product?.options.find((option) => option.attribute === 'colour')?.values ?? []).map(
              (value) => {
                const out = !value.inStock;
                return (
                  <span
                    key={value.id}
                    className={styles.cardSwatch}
                    style={
                      value.swatchHex === undefined ? undefined : { background: value.swatchHex }
                    }
                  >
                    {out ? <span className={styles.cardSwatchStrike} /> : null}
                  </span>
                );
              },
            )}
            <span className={styles.cardSwatchNote}>{entry.note}</span>
          </div>
        ) : (
          <div aria-hidden="true" className={styles.cardNoteRow}>
            {entry.note}
          </div>
        )}
        <div className={styles.cardTitleBlock}>
          <span className={styles.cardBrand}>{entry.brand}</span>
          <Link href={entry.href} className={styles.cardName}>
            {entry.name}
          </Link>
        </div>
        <div className={styles.cardPriceRow}>
          <span
            className={`${styles.cardPrice} ${
              entry.wasEgp !== undefined
                ? styles.cardPriceOffer
                : entry.kind === 'out'
                  ? styles.cardPriceMuted
                  : ''
            } ${entry.kind === 'options' ? styles.cardPriceFrom : ''}`}
          >
            {entry.kind === 'options' ? 'From ' : ''}
            <bdi>
              {formatMoney({ amountMinor: Math.round(entry.priceEgp * 100), currency: 'EGP' })}
            </bdi>
          </span>
          {entry.wasEgp !== undefined ? (
            <s className={styles.cardWas}>
              {formatMoney({ amountMinor: Math.round(entry.wasEgp * 100), currency: 'EGP' })}
            </s>
          ) : null}
        </div>
        <span className={`${styles.cardAvailability} ${availability.tone}`}>
          <Icon name={availability.icon} size={15} strokeWidth={1.7} aria-hidden="true" />
          {availability.text}
        </span>
        <div className={styles.cardActions}>
          {entry.kind === 'add' ? (
            <button
              type="button"
              className={styles.moveToCart}
              onClick={onMoveToCart}
              disabled={busy}
            >
              Move to cart
            </button>
          ) : null}
          {entry.kind === 'options' ? (
            <button
              type="button"
              className={styles.chooseOptions}
              aria-haspopup="dialog"
              onClick={onOptions}
              disabled={busy || product === undefined}
            >
              Choose options
            </button>
          ) : null}
          {entry.kind === 'view' ? (
            <Link href={entry.href} className={styles.chooseOptions}>
              View set
            </Link>
          ) : null}
          {entry.kind === 'pre' ? (
            <Link href={entry.href} className={`${styles.chooseOptions} ${styles.preOptions}`}>
              View details
            </Link>
          ) : null}
          {entry.kind === 'out' ? (
            <>
              <button
                type="button"
                className={styles.disabledAction}
                disabled
                id={`${entry.key}-why`}
              >
                Not available
              </button>
              <span className={styles.disabledReason} aria-describedby={`${entry.key}-why`}>
                This product isn’t on sale right now. It stays saved here.
              </span>
            </>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            className={styles.removeText}
            aria-label={`Remove ${entry.name} from wishlist`}
            disabled={busy}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
