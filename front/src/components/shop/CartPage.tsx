'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { useCartWishlist } from '../providers/CartWishlistProvider';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import { homepageSample } from '../../data/homepage-sample';
import type { ResolvedCartLine } from '../../lib/cart';
import styles from './CartPage.module.css';

/**
 * The cart page (Stage 3 cart boards: desktop 1440, mobile 390, blackberry
 * tablet metrics, and the states board), on the customer's live cart (F06).
 * Lines, quantities and unit prices are the API's; the summary is the sum of
 * those prices and still reads "Estimated" because tax and the final total
 * come from the checkout quote. Nothing here reserves stock.
 */

export function CartPage() {
  const {
    resolvedLines,
    summary,
    cartCount,
    priceAcked,
    ackPriceChange,
    increase,
    decrease,
    removeLine,
    moveToWishlist,
    undo,
    toast,
    dismissToast,
    status,
    loadError,
    reload,
    busy,
  } = useCartWishlist();
  const { requestSignIn } = useStorefrontUi();

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (line: ResolvedCartLine) => {
    setOpen((current) => ({ ...current, [line.item.key]: !current[line.item.key] }));
  };

  useEffect(() => {
    /* The board demo starts with the dynamic set's panel expanded. */
    setOpen((current) =>
      resolvedLines.some((line) => line.item.kind === 'dynamic') &&
      current[resolvedLines.find((line) => line.item.kind === 'dynamic')!.item.key] === undefined
        ? {
            ...current,
            [resolvedLines.find((line) => line.item.kind === 'dynamic')!.item.key]: true,
          }
        : current,
    );
  }, [resolvedLines]);

  const empty = resolvedLines.length === 0;
  const hasLines = status === 'ready' && resolvedLines.length > 0;

  if (status !== 'ready') {
    return (
      <div className={styles.main}>
        <div className={styles.headRow}>
          <div className={styles.headTitles}>
            <h1 className={styles.headline}>Your cart</h1>
          </div>
          <Link href="/products" className={styles.continueLink}>
            <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
            Continue shopping
          </Link>
        </div>
        <CartState
          status={status}
          message={loadError}
          onRetry={() => void reload()}
          onSignIn={() => requestSignIn('cart')}
        />
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className={styles.headRow}>
        <div className={styles.headTitles}>
          <h1 className={styles.headline}>Your cart</h1>
          {hasLines ? <span className={styles.itemsText}>{summary.itemsText}</span> : null}
        </div>
        <Link href="/products" className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Continue shopping
        </Link>
      </div>

      {hasLines ? (
        <div className={styles.columns}>
          <section aria-label="Items in your cart" className={styles.linesColumn}>
            {summary.blocked ? (
              <div role="alert" className={styles.blockedAlert}>
                <Icon name="alert" size={20} strokeWidth={1.8} aria-hidden="true" />
                <span className={styles.blockedCopy}>
                  <strong className={styles.blockedTitle}>{summary.blockTitle}</strong>
                  <span>{summary.blockText}</span>
                </span>
              </div>
            ) : null}

            <div className={styles.lineList} data-reveal-stagger>
              {resolvedLines.map((line) => (
                <CartLineRow
                  key={line.item.key}
                  line={line}
                  open={open[line.item.key] === true}
                  onToggle={() => toggle(line)}
                  priceNotice={line.item.priceChangedFromEgp !== undefined && !priceAcked}
                  onAck={ackPriceChange}
                  onIncrease={increase}
                  onDecrease={decrease}
                  busy={busy}
                  onRemove={() => removeLine(line.item.key)}
                  onToWishlist={() => moveToWishlist(line.item.key)}
                />
              ))}
            </div>
          </section>

          <aside aria-labelledby="cart-sum-h" className={styles.summaryColumn}>
            <div className={styles.summaryCard} data-reveal>
              <h2 id="cart-sum-h" className={styles.summaryTitle}>
                Order summary
              </h2>
              <dl className={styles.summaryList}>
                <div className={styles.summaryRow}>
                  <dt className={styles.summaryTerm}>{summary.subLabel}</dt>
                  <dd className={`${styles.summaryValue} ${styles.summaryStrong}`}>
                    {summary.subtotal}
                  </dd>
                </div>
                {summary.discount !== null ? (
                  <div className={styles.summaryRow}>
                    <dt className={styles.summaryTerm}>Discounts</dt>
                    <dd className={`${styles.summaryValue} ${styles.summaryDiscount}`}>
                      {summary.discount}
                    </dd>
                  </div>
                ) : null}
                <div className={styles.summaryRow}>
                  <dt className={styles.summaryTerm}>Delivery</dt>
                  <dd className={`${styles.summaryValue} ${styles.summaryMuted}`}>
                    Calculated at checkout
                  </dd>
                </div>
                <div className={styles.summaryRow}>
                  <dt className={styles.summaryTerm}>Tax</dt>
                  <dd className={`${styles.summaryValue} ${styles.summaryMuted}`}>
                    Calculated at checkout
                  </dd>
                </div>
                <div className={styles.summaryTotalRow}>
                  <dt className={styles.summaryTotalTerm}>Estimated total</dt>
                  <dd aria-live="polite" className={styles.summaryTotalValue}>
                    {summary.total}
                  </dd>
                </div>
              </dl>
              {summary.blocked && summary.excludedText !== null ? (
                <span className={styles.excludedNote}>{summary.excludedText}</span>
              ) : null}
              {summary.blocked ? (
                <div className={styles.checkoutBlocked}>
                  <button
                    type="button"
                    className={styles.checkoutDisabled}
                    disabled
                    aria-describedby="cart-block-reason"
                  >
                    Continue to checkout
                  </button>
                  <span id="cart-block-reason" className={styles.blockReason}>
                    <Icon name="alert" size={15} strokeWidth={2.2} aria-hidden="true" />
                    Remove unavailable items to continue
                  </span>
                </div>
              ) : (
                <Link
                  href="/checkout"
                  className={styles.checkoutLink}
                  aria-label={`Continue to checkout, estimated total ${summary.total}`}
                >
                  Continue to checkout
                  <Icon name="chevron-right" size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
              )}
              <div className={styles.reserveNote}>
                <Icon name="info" size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  Items aren’t reserved until you place your order. Prices are confirmed at
                  checkout.
                </span>
              </div>
            </div>
            <div className={styles.summaryFootnotes}>
              <span>
                Delivery options and their costs are shown at checkout once you add an address.
              </span>
              <span>Return eligibility is shown per item on each product page.</span>
            </div>
          </aside>
        </div>
      ) : (
        <CartEmpty />
      )}

      {/* Mobile sticky checkout bar */}
      {hasLines ? (
        <div className={styles.mobileBar} aria-hidden="false">
          {summary.blocked ? (
            <span id="cart-block-reason-m" className={styles.mobileBlockReason}>
              <Icon name="alert" size={14} strokeWidth={2.2} aria-hidden="true" />
              Remove unavailable items to continue
            </span>
          ) : null}
          <div className={styles.mobileBarGrid}>
            <span className={styles.mobileBarTotal}>
              <span className={styles.mobileBarLabel}>Estimated total</span>
              <span aria-live="polite" className={styles.mobileBarValue}>
                {summary.total}
              </span>
            </span>
            {summary.blocked ? (
              <button
                type="button"
                className={styles.checkoutDisabled}
                disabled
                aria-describedby="cart-block-reason-m"
              >
                Continue to checkout
              </button>
            ) : (
              <Link href="/checkout" className={styles.mobileCheckout}>
                Continue to checkout
              </Link>
            )}
          </div>
        </div>
      ) : null}

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
          {toast.withWish ? (
            <Link href="/wishlist" className={styles.toastLink}>
              View wishlist
            </Link>
          ) : null}
          {toast.withCart ? (
            <Link href="/cart" className={styles.toastLink} onClick={() => undefined}>
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

      <span className={styles.visuallyHidden} role="status">
        {empty ? 'Your cart is empty' : `Cart, ${cartCount} items`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One cart line
 * ------------------------------------------------------------------ */

const AVAIL_CLASS: Record<ResolvedCartLine['availability']['tone'], string> = {
  ok: 'availOk',
  low: 'availLow',
  out: 'availOut',
  unknown: 'availUnknown',
};

function CartLineRow({
  line,
  open,
  onToggle,
  priceNotice,
  onAck,
  onIncrease,
  onDecrease,
  onRemove,
  onToWishlist,
  busy,
}: {
  busy: boolean;
  line: ResolvedCartLine;
  open: boolean;
  onToggle: () => void;
  priceNotice: boolean;
  onAck: () => void;
  onIncrease: (key: string) => void;
  onDecrease: (key: string) => void;
  onRemove: () => void;
  onToWishlist: () => void;
}) {
  const { item } = line;
  const isFixed = item.kind === 'fixed';
  const isDynamic = item.kind === 'dynamic';
  const boxId = `cart-box-${item.key.replace(/[^a-z0-9-]/gi, '-')}`;

  return (
    <article
      aria-label={item.name}
      className={`${styles.line} ${line.available ? '' : styles.lineUnavailable}`}
    >
      <div className={styles.lineGrid}>
        <Link href={item.href} tabIndex={-1} aria-hidden="true" className={styles.imageLink}>
          <StorefrontImage image={item.image} alt="" className={styles.image} sizes="120px" />
        </Link>
        <div className={styles.lineBody}>
          <div className={styles.lineTop}>
            <div className={styles.lineIdentity}>
              {isFixed ? (
                <span className={`${styles.setBadge} ${styles.setBadgeFixed}`}>
                  <Icon name="package" size={13} strokeWidth={2} aria-hidden="true" />
                  Ready-packed set
                </span>
              ) : null}
              {isDynamic ? (
                <span className={`${styles.setBadge} ${styles.setBadgeDynamic}`}>
                  <Icon name="grid" size={13} strokeWidth={2} aria-hidden="true" />
                  Set of individual items
                </span>
              ) : null}
              <Link
                href={item.href}
                className={`${styles.lineName} ${line.available ? '' : styles.lineNameMuted}`}
              >
                {item.name}
              </Link>
              <span className={styles.lineVariant}>{item.variant}</span>
              <span className={styles.lineSku}>
                <bdi>SKU {item.sku}</bdi>
              </span>
            </div>
            <div className={styles.priceColumn}>
              <span
                className={`${styles.linePrice} ${!line.available ? styles.linePriceStruck : item.wasEgp !== undefined ? styles.linePriceOffer : ''}`}
              >
                {line.total}
              </span>
              {line.wasTotal !== null ? <s className={styles.lineWas}>{line.wasTotal}</s> : null}
              <span className={styles.lineSave}>{line.saveText}</span>
              {line.each !== null ? <span className={styles.lineEach}>{line.each}</span> : null}
              {!line.available ? (
                <span className={styles.lineExcluded}>Not included in total</span>
              ) : null}
            </div>
          </div>

          <div className={styles.availRow}>
            <span
              className={`${styles.availability} ${styles[AVAIL_CLASS[line.availability.tone]]}`}
            >
              {line.availability.tone === 'unknown' ? (
                <Icon name="info" size={15} strokeWidth={1.7} aria-hidden="true" />
              ) : line.availability.tone === 'ok' ? (
                <Icon name="check" size={15} strokeWidth={1.8} aria-hidden="true" />
              ) : line.availability.tone === 'low' ? (
                <Icon name="half" size={15} strokeWidth={1.6} aria-hidden="true" />
              ) : (
                <Icon name="cross" size={15} strokeWidth={1.8} aria-hidden="true" />
              )}
              {line.availability.text}
            </span>
            {/* Mobile board: the saving sits on the stock row, end-aligned. */}
            {line.available && line.saveText ? (
              <span className={`${styles.lineSave} ${styles.lineSaveInline}`}>{line.saveText}</span>
            ) : null}
          </div>

          {priceNotice && line.available && line.priceChangeNote !== null ? (
            <div role="status" className={styles.priceNotice}>
              <Icon name="info" size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className={styles.priceNoticeText}>{line.priceChangeNote}</span>
              <button
                type="button"
                className={styles.priceNoticeOk}
                onClick={onAck}
                disabled={busy}
              >
                OK
              </button>
            </div>
          ) : null}

          {line.unavailable !== null ? (
            <div className={styles.unavailableNote}>
              <strong className={styles.unavailableTitle}>{line.unavailable.title}</strong>
              <span>{line.unavailable.body}</span>
            </div>
          ) : null}

          {isFixed && line.packedBox !== null ? (
            <div className={styles.setPanel}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={boxId}
                className={styles.setPanelToggle}
                onClick={onToggle}
              >
                <span>
                  What’s in the box{' '}
                  <span className={styles.setPanelMeta}>· 3 items · ships as one box</span>
                </span>
                <Icon
                  name="chevron-down"
                  size={16}
                  strokeWidth={2}
                  className={open ? styles.setChevronOpen : undefined}
                  aria-hidden="true"
                />
              </button>
              {open ? (
                <ul id={boxId} className={styles.setPanelList}>
                  {line.packedBox.map((row) => (
                    <li key={row.name} className={styles.setRow}>
                      <StorefrontImage
                        image={row.image}
                        alt=""
                        className={styles.setRowImage}
                        sizes="40px"
                      />
                      <span className={styles.setRowBody}>
                        <span className={styles.setRowName}>{row.name}</span>
                        <span className={styles.setRowVariant}>{row.variant}</span>
                      </span>
                      <span className={styles.setRowQty}>{row.qtyText}</span>
                    </li>
                  ))}
                  <li className={`${styles.setRow} ${styles.setRowNote}`}>
                    Items and colours are fixed. Stock is held for the packed set, not the separate
                    items.
                  </li>
                </ul>
              ) : null}
            </div>
          ) : null}

          {isDynamic && line.components !== null ? (
            <div className={styles.setPanel}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={boxId}
                className={styles.setPanelToggle}
                onClick={onToggle}
              >
                <span>
                  Items in this set{' '}
                  <span className={styles.setPanelMeta}>· 3 items · each checked for stock</span>
                </span>
                <Icon
                  name="chevron-down"
                  size={16}
                  strokeWidth={2}
                  className={open ? styles.setChevronOpen : undefined}
                  aria-hidden="true"
                />
              </button>
              {open ? (
                <ul id={boxId} className={styles.setPanelList}>
                  {line.components.map((component) => (
                    <li key={component.component.name} className={styles.setRow}>
                      {component.component.image !== undefined ? (
                        <StorefrontImage
                          image={component.component.image}
                          alt=""
                          className={styles.setRowImage}
                          sizes="40px"
                        />
                      ) : null}
                      <span className={styles.setRowBody}>
                        <span className={styles.setRowName}>{component.component.name}</span>
                        <span className={styles.setRowVariant}>
                          {component.component.variant}
                          {component.perText !== null ? ` · ${component.perText}` : ''}
                        </span>
                      </span>
                      <span
                        className={`${styles.setRowQty} ${component.ok ? styles.setRowOk : styles.setRowOut}`}
                      >
                        {component.ok ? (
                          <Icon name="check" size={14} strokeWidth={1.8} aria-hidden="true" />
                        ) : (
                          <Icon name="cross" size={14} strokeWidth={1.8} aria-hidden="true" />
                        )}
                        {component.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {line.available ? (
            <div className={styles.lineActions}>
              <div
                role="group"
                aria-label={`Quantity for ${item.nameShort}`}
                className={styles.quantity}
              >
                <button
                  type="button"
                  aria-label={`Decrease quantity of ${item.nameShort}`}
                  onClick={() => onDecrease(item.key)}
                  disabled={busy || line.spec.qty <= 1}
                  className={styles.quantityBtn}
                >
                  −
                </button>
                <span aria-live="polite" className={styles.quantityValue}>
                  {line.spec.qty}
                </span>
                <button
                  type="button"
                  aria-label={`Increase quantity of ${item.nameShort}`}
                  onClick={() => onIncrease(item.key)}
                  disabled={busy || line.atMax}
                  className={styles.quantityBtn}
                >
                  +
                </button>
              </div>
              {line.maxText !== null ? (
                <span role="status" className={styles.maxNote}>
                  {line.maxText}
                </span>
              ) : null}
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  onClick={onToWishlist}
                  className={styles.textAction}
                  disabled={busy}
                >
                  <Icon name="heart" size={17} strokeWidth={1.7} aria-hidden="true" />
                  Move to wishlist
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  className={styles.textAction}
                  disabled={busy}
                >
                  <Icon name="trash" size={17} strokeWidth={1.7} aria-hidden="true" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.unavailableActions}>
              <button
                type="button"
                onClick={onRemove}
                className={styles.solidAction}
                disabled={busy}
              >
                <Icon name="trash" size={17} strokeWidth={1.7} aria-hidden="true" />
                Remove
              </button>
              <button
                type="button"
                onClick={onToWishlist}
                className={styles.outlineAction}
                disabled={busy}
              >
                <Icon name="heart" size={17} strokeWidth={1.7} aria-hidden="true" />
                Move to wishlist
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Loading, signed-out and unavailable states
 * ------------------------------------------------------------------ */

function CartState({
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
    // The states board's skeleton: two lines and the summary card.
    return (
      <div className={styles.loadingColumns} role="status" aria-live="polite">
        <span className={styles.visuallyHidden}>Loading your cart…</span>
        <div className={styles.loadingLines} aria-hidden="true">
          {[0, 1].map((row) => (
            <div key={row} className={styles.loadingLineRow}>
              <span className={`${styles.shimmer} ${styles.loadingMedia}`} />
              <span className={styles.loadingStack}>
                <span className={styles.shimmer} style={{ height: 20, width: '70%' }} />
                <span className={styles.shimmer} style={{ height: 14, width: '40%' }} />
                <span className={`${styles.shimmer} ${styles.loadingQty}`} />
              </span>
            </div>
          ))}
        </div>
        <div className={styles.loadingSummary} aria-hidden="true">
          <span className={styles.shimmer} style={{ height: 24, width: '60%' }} />
          <span className={styles.shimmer} style={{ height: 16 }} />
          <span className={styles.shimmer} style={{ height: 16 }} />
          <span className={styles.shimmer} style={{ height: 48, borderRadius: 999 }} />
        </div>
      </div>
    );
  }
  if (status === 'signed-out') {
    return (
      <div className={styles.errorBox}>
        <Icon name="bag" size={36} strokeWidth={1.3} aria-hidden="true" />
        <h2 className={styles.errorTitle}>Sign in to see your cart</h2>
        <p className={styles.errorBody}>
          Your cart is kept with your account, so it’s there on any device.
        </p>
        <button type="button" className={styles.retry} onClick={onSignIn}>
          Sign in
        </button>
      </div>
    );
  }
  if (status === 'not-customer') {
    return (
      <div className={styles.errorBox}>
        <h2 className={styles.errorTitle}>Carts belong to customer accounts</h2>
        <p className={styles.errorBody}>
          You’re signed in as an administrator. Sign in with a customer account to shop.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.errorBox} role="alert">
      <Icon
        name="alert"
        size={32}
        strokeWidth={1.5}
        className={styles.errorIcon}
        aria-hidden="true"
      />
      <h2 className={styles.errorTitle}>We couldn’t load your cart</h2>
      <p className={styles.errorBody}>
        {message ?? 'Please try again.'} Nothing in your cart was changed.
      </p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Empty cart (board copy + approved imagery)
 * ------------------------------------------------------------------ */

function CartEmpty() {
  const categories = homepageSample.categories.filter((category) =>
    ['cookware', 'tableware', 'kitchen-tools', 'textiles'].includes(category.slug),
  );
  return (
    <div className={styles.emptyStack}>
      <div className={styles.emptyBanner}>
        <div className={styles.emptyCopy}>
          <span className={styles.emptyEyebrow}>Nothing here yet</span>
          <h2 className={styles.emptyTitle}>Your cart is empty</h2>
          <p className={styles.emptyBody}>
            Start with a single good pan, or set the table. Anything you add appears here, and your
            saved items wait in your wishlist.
          </p>
          <div className={styles.emptyActions}>
            <Link href="/products" className={styles.emptyPrimary}>
              Browse all products
            </Link>
            <Link href="/wishlist" className={styles.emptyOutline}>
              View your wishlist
            </Link>
          </div>
        </div>
        <StorefrontImage
          image={homepageSample.hero.image}
          alt=""
          className={styles.emptyImage}
          sizes="(max-width: 1023px) 100vw, 520px"
        />
      </div>
      <section aria-labelledby="cart-cats" className={styles.categorySection}>
        <h2 id="cart-cats" className={styles.categoryTitle}>
          Shop by category
        </h2>
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/products?category=${category.slug}`}
              className={styles.categoryCard}
            >
              <StorefrontImage
                image={category.image}
                alt=""
                className={styles.categoryImage}
                sizes="(max-width: 1023px) 168px, 180px"
              />
              <span className={styles.categoryName}>{category.name}</span>
            </Link>
          ))}
          <Link href="/bundles/the-first-kitchen-set" className={styles.categoryCard}>
            <StorefrontImage
              image={homepageSample.bundles[0]?.image ?? homepageSample.hero.image}
              alt=""
              className={styles.categoryImage}
              sizes="(max-width: 1023px) 168px, 180px"
            />
            <span className={styles.categoryName}>Sets &amp; bundles</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
