'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { Pulse } from '../../motion/Pulse';
import { useImageSwap } from '../../motion/feedback';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney, formatSaving } from '../../data/money';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import { useOptionalCartWishlist } from '../providers/CartWishlistProvider';
import {
  resolveSelectionFromParams,
  resolveVariant,
  serializeVariantParams,
  type ResolvedVariant,
  type VariantParams,
  type VariantSelection,
} from '../../lib/variant';
import type { StoreImage, StorefrontProduct } from '../../data/types';
import styles from './ProductDetail.module.css';

export interface SetCardData {
  href: string;
  image: StoreImage;
  eyebrow: string;
  name: string;
  lineLong: string;
  lineShort: string;
}

/** The resolved colour × size, shared with the page sections below the fold. */
export const ProductVariantContext = createContext<ResolvedVariant | null>(null);

export interface ProductDetailShellProps {
  product: StorefrontProduct;
  inSetCard: SetCardData | undefined;
  /** The variant resolved from the request URL (?sku=…&size=…), server-side. */
  initialSelection: VariantSelection;
  /** Server-rendered sections (About, Specifications, Reviews, …). */
  children: ReactNode;
}

/**
 * The interactive top half of the product page and the wide-layout sticky
 * buy bar (boards 07/08), sharing one variant state so both always show the
 * same SKU, price and availability. Everything else on the page is rendered
 * as plain server content between the two.
 *
 * The URL stays the single source of truth: the server resolves the first
 * paint from the request URL and every pick rewrites it with
 * `history.replaceState` — no router round-trip, and a refresh or a shared
 * (?sku=…&size=…) link restores the same variant.
 */
export function ProductDetailShell({
  product,
  inSetCard,
  initialSelection,
  children,
}: ProductDetailShellProps) {
  const { requestSignIn } = useStorefrontUi();
  const commerce = useOptionalCartWishlist();

  const [selection, setSelection] = useState<VariantSelection>(initialSelection);

  // The palette for the picked colour: its photography first (the shared
  // gallery falls back when a colour has none), then the extra views.
  const colours = product.options.find((option) => option.attribute === 'colour')?.values ?? [];
  const variant = useMemo(() => resolveVariant(product, selection), [product, selection]);
  const gallery = useMemo(() => {
    const base = variant.colour?.image ?? product.image;
    const extras = (product.gallery ?? []).filter((view) => view.src !== base.src);
    return [base, ...extras];
  }, [product.gallery, product.image, variant.colour]);
  const [imageIndex, setImageIndex] = useState(0);
  const stageRef = useRef<HTMLElement>(null);
  useImageSwap(stageRef, gallery[imageIndex]?.src);
  const [quantity, setQuantity] = useState(1);
  // Live wishlist state (F06): saved means the customer's wishlist holds this product.
  const wished = commerce?.isWished(product.id) ?? false;
  const toggleWish = () => {
    if (commerce === null) {
      requestSignIn('wishlist');
      return;
    }
    commerce.toggleWishlist(product);
  };

  /* URL ↔ state: the server resolves the first paint from the request URL;
     a pick rewrites the URL without a router round-trip, and back/forward
     re-adopts whatever the URL carries. */
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setSelection(resolveSelectionFromParams(product, paramsToVariantParams(params)));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [product]);

  const applySelection = useCallback(
    (next: VariantSelection) => {
      setSelection(next);
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${serializeVariantParams(product, next)}`,
      );
    },
    [product],
  );

  const chooseColour = (colourId: string) => {
    // Keep the size where the combination allows it; the board keeps both
    // dimensions selectable instead of greying one dimension out.
    const sizes = product.options.find((option) => option.attribute === 'size')?.values ?? [];
    const colour = colours.find((value) => value.id === colourId);
    const allowedSizes = colour?.availableSizes;
    let sizeId: string | undefined = selection.sizeId;
    if (sizes.length > 0) {
      const keep =
        sizeId !== undefined && (allowedSizes === undefined || allowedSizes.includes(sizeId));
      if (!keep) {
        const inStockSizes = sizes.filter((size) => size.inStock);
        const allowed =
          allowedSizes === undefined
            ? inStockSizes
            : inStockSizes.filter((size) => allowedSizes.includes(size.id));
        sizeId = allowed[0]?.id ?? sizeId;
      }
    } else {
      sizeId = undefined;
    }
    applySelection({ colourId, sizeId });
    setImageIndex(0);
    setQuantity(1);
  };

  const chooseSize = (sizeId: string) => {
    applySelection({ colourId: selection.colourId, sizeId });
    setQuantity(1);
  };

  const stepImage = (step: number) => {
    setImageIndex((index) => (index + step + gallery.length) % gallery.length);
  };

  const saving =
    variant.previousPrice !== undefined &&
    variant.price.amountMinor < variant.previousPrice.amountMinor
      ? variant.previousPrice.amountMinor - variant.price.amountMinor
      : null;

  const statusTone =
    variant.inStock === false || variant.overall === 'out_of_stock' || variant.overall === 'unknown'
      ? styles.statusTextMuted
      : variant.overall === 'preorder'
        ? styles.statusTextInfo
        : styles.statusText;

  const statusIcon =
    variant.overall === 'unknown' ? (
      <Icon name="info" size={15} strokeWidth={1.7} />
    ) : variant.overall === 'preorder' ? (
      <Icon name="clock" size={17} strokeWidth={1.6} />
    ) : variant.inStock ? (
      <Icon name="check" size={15} strokeWidth={1.9} />
    ) : (
      <Icon name="cross" size={15} strokeWidth={1.9} />
    );

  const addLabel =
    variant.overall === 'out_of_stock'
      ? product.preOrder
        ? 'Pre-order'
        : 'Out of stock'
      : 'Add to cart';

  // Adds the exact SKU on screen (F06 live cart); signed out, the sign-in sheet opens.
  const activation =
    variant.inStock && quantity > 0
      ? () => {
          if (commerce === null) {
            requestSignIn('cart');
            return;
          }
          void commerce.addProduct(product, selection, quantity);
        }
      : undefined;
  const adding = commerce?.busy === true;

  const content = (
    <div className={styles.page}>
      {/*
        Breadcrumb: Home / <category> / name. The boards add a product-type
        level ("Casseroles & Dutch ovens") between category and product; the
        catalogue has no product-type data or route yet, so that level is left
        out rather than replaced by an unrelated "All products" link.
      */}
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/" className={styles.crumbsLink}>
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/products?category=${product.category.slug}`} className={styles.crumbsLink}>
          {product.category.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span className={styles.crumbsCurrent}>{product.name}</span>
      </nav>

      {/* board-08: the narrow layout swaps the trail for one back link. */}
      <Link href={`/products?category=${product.category.slug}`} className={styles.backLink}>
        <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
        {product.category.name}
      </Link>

      <div className={styles.topArea}>
        <div className={styles.topColumns}>
          {/* gallery */}
          <section className={styles.gallery} aria-label="Product images">
            <div
              className={`${styles.thumbRail} ${styles.desktopControls}`}
              role="tablist"
              aria-label="Choose image"
            >
              {gallery.map((view, index) => (
                <button
                  key={`${view.src}-${view.alt}`}
                  type="button"
                  role="tab"
                  aria-selected={index === imageIndex}
                  className={`${styles.thumb} ${index === imageIndex ? styles.thumbSelected : ''}`}
                  aria-label={`Image ${index + 1} of ${gallery.length}`}
                  onClick={() => setImageIndex(index)}
                >
                  <StorefrontImage image={view} alt="" sizes="84px" />
                </button>
              ))}
            </div>

            <figure className={styles.stage} ref={stageRef} data-intro="image">
              {gallery[imageIndex] ? (
                <StorefrontImage
                  image={gallery[imageIndex]}
                  alt={gallery[imageIndex].alt}
                  fill
                  priority
                  sizes="(max-width: 1023px) 100vw, 760px"
                />
              ) : null}
              {product.discountBadge ? (
                <span className={styles.galleryBadge} data-shine>
                  {product.discountBadge}
                </span>
              ) : null}

              <button
                type="button"
                aria-label={`${wished ? 'Remove from' : 'Save to'} wishlist`}
                aria-pressed={wished}
                className={styles.galleryHeart}
                disabled={commerce?.busy === true}
                onClick={toggleWish}
              >
                <Icon
                  name="heart"
                  size={20}
                  strokeWidth={1.7}
                  fill={wished ? 'var(--hw-action-primary)' : 'none'}
                  stroke={wished ? 'var(--hw-action-primary)' : 'var(--hw-text-primary)'}
                />
              </button>

              {/* mobile: side arrows + dot strip; desktop: counter + bottom controls */}
              <div className={`${styles.galleryControls} ${styles.desktopControls}`}>
                <span className={styles.galleryCounter}>
                  {imageIndex + 1} / {gallery.length}
                </span>
                <button
                  type="button"
                  aria-label="Previous image"
                  className={styles.galleryNav}
                  onClick={() => stepImage(-1)}
                >
                  <Icon name="chevron-left" size={18} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  className={styles.galleryNav}
                  onClick={() => stepImage(1)}
                >
                  <Icon name="chevron-right" size={18} strokeWidth={2} />
                </button>
              </div>
              <button
                type="button"
                aria-label="Previous image"
                className={`${styles.gallerySideNav} ${styles.mobileControls}`}
                onClick={() => stepImage(-1)}
              >
                <Icon name="chevron-left" size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Next image"
                className={`${styles.gallerySideNav} ${styles.gallerySideNavEnd} ${styles.mobileControls}`}
                onClick={() => stepImage(1)}
              >
                <Icon name="chevron-right" size={18} strokeWidth={2} />
              </button>
              <div className={`${styles.galleryDots} ${styles.mobileControls}`} aria-hidden="true">
                {gallery.map((view, index) => (
                  <span
                    key={view.src}
                    className={`${styles.galleryDot} ${index === imageIndex ? styles.galleryDotActive : ''}`}
                  />
                ))}
              </div>
            </figure>

            {/* narrow: horizontal thumb strip under the stage */}
            <div
              className={`${styles.thumbStrip} ${styles.mobileControls}`}
              role="tablist"
              aria-label="Choose image"
            >
              {gallery.map((view, index) => (
                <button
                  key={`${view.src}-strip-${view.alt}`}
                  type="button"
                  role="tab"
                  aria-selected={index === imageIndex}
                  className={`${styles.thumb} ${index === imageIndex ? styles.thumbSelected : ''}`}
                  aria-label={`Image ${index + 1} of ${gallery.length}`}
                  onClick={() => setImageIndex(index)}
                >
                  <StorefrontImage image={view} alt="" sizes="56px" />
                </button>
              ))}
            </div>
          </section>

          {/* details */}
          <section className={styles.details} aria-label="Product details">
            <div className={styles.detailsHead}>
              <span className={styles.brandLink}>{product.brand.name}</span>
              <h1 className={styles.headline} data-intro data-split="words">
                {product.name}
              </h1>
              {product.description ? (
                <span className={styles.summary}>{product.description}</span>
              ) : null}
            </div>

            <div className={styles.priceBlock}>
              <div className={styles.priceRow}>
                <bdi>
                  <span
                    className={`${styles.price} ${
                      saving !== null ? styles.priceOffer : ''
                    } ${variant.inStock === false && variant.overall !== 'preorder' && product.preOrder !== true ? styles.priceMuted : ''}`}
                  >
                    <Pulse kind="flash" value={variant.price.amountMinor}>
                      {formatMoney(variant.price)}
                    </Pulse>
                  </span>
                </bdi>
                {variant.previousPrice ? (
                  <bdi>
                    <s className={styles.was}>{formatMoney(variant.previousPrice)}</s>
                  </bdi>
                ) : null}
                {saving !== null ? (
                  <bdi>
                    <span className={styles.savePill}>
                      {formatSaving({ amountMinor: saving, currency: 'EGP' })}
                    </span>
                  </bdi>
                ) : null}
              </div>
              <span className={styles.priceNote}>
                <span className={styles.priceNoteWide}>
                  {variant.size
                    ? 'Price for the selected size. Checked again at checkout.'
                    : 'Checked again at checkout.'}
                </span>
                <span className={styles.priceNoteShort}>Checked again at checkout.</span>
              </span>
            </div>

            {colours.length > 0 ? (
              <fieldset className={styles.pickBlock}>
                <div className={styles.pickLegendRow}>
                  <span>
                    Colour:{' '}
                    <span className={styles.pickLegendValue}>{variant.colour?.label ?? '—'}</span>
                  </span>
                </div>
                <div role="radiogroup" aria-label="Colour" className={styles.swatchGroup}>
                  {colours.map((colour) => {
                    const soldOut =
                      !colour.inStock ||
                      (colour.availableSizes !== undefined && colour.availableSizes.length === 0);
                    return (
                      <button
                        key={colour.id}
                        type="button"
                        role="radio"
                        aria-checked={colour.id === variant.colour?.id}
                        aria-label={soldOut ? `${colour.label}, out of stock` : colour.label}
                        className={`${styles.swatch} ${
                          colour.id === variant.colour?.id ? styles.swatchSelected : ''
                        }`}
                        onClick={() => chooseColour(colour.id)}
                      >
                        <span
                          className={styles.swatchDot}
                          style={{ background: colour.swatchHex ?? 'var(--hw-bg-well)' }}
                        />
                        {soldOut ? <span className={styles.swatchStrike} /> : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {/* attributes: size tiles per board-07 */}
            {(() => {
              const sizes =
                product.options.find((option) => option.attribute === 'size')?.values ?? [];
              if (sizes.length === 0) return null;
              return (
                <fieldset className={styles.pickBlock}>
                  <div className={styles.pickLegendRow}>
                    <span>Size</span>
                    <a href="#specs" className={styles.dimensionsLink}>
                      Dimensions
                    </a>
                  </div>
                  <div role="radiogroup" aria-label="Size" className={styles.sizeGroup}>
                    {sizes.map((size) => {
                      const available =
                        product.preOrder === true ||
                        (isSizeAllowed(product, variant.colour?.id, size.id) && size.inStock);
                      const selectable = size.inStock || product.preOrder === true;
                      const reason = !available
                        ? `${variant.colour?.label ?? 'This colour'} in this size is out of stock`
                        : !selectable
                          ? 'Out of stock'
                          : undefined;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          role="radio"
                          aria-checked={size.id === variant.size?.id}
                          aria-label={`${size.label}, ${formatMoney(size.price ?? product.price)}${
                            reason !== undefined ? `, ${reason}` : ''
                          }`}
                          className={`${styles.sizeTile} ${
                            size.id === variant.size?.id ? styles.sizeTileSelected : ''
                          }`}
                          aria-disabled={reason !== undefined ? true : undefined}
                          onClick={() => chooseSize(size.id)}
                        >
                          <span className={styles.sizeTileLabel}>{size.label}</span>
                          <span className={styles.sizeTilePrice}>
                            {formatMoney(size.price ?? product.price)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {variant.disabledReason ? (
                    <span className={styles.unavailableHint}>{variant.disabledReason}</span>
                  ) : null}
                </fieldset>
              );
            })()}

            {colours.length === 0 &&
            product.options.some((option) => option.attribute === 'size') === false &&
            product.variantNote ? (
              <span className={styles.summary}>{product.variantNote}</span>
            ) : null}

            <div className={styles.statusBlock}>
              <span role="status" className={statusTone}>
                {statusIcon}
                {variant.statusText}
              </span>
              {variant.sku ? <span className={styles.skuLine}>SKU {variant.sku}</span> : null}
              {variant.disabledReason &&
              product.options.find((option) => option.attribute === 'size') === undefined ? (
                <span className={styles.unavailableHint}>{variant.disabledReason}</span>
              ) : null}
            </div>

            <div className={styles.buyRow}>
              <div className={styles.quantity} role="group" aria-label="Quantity">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  className={styles.quantityBtn}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                >
                  −
                </button>
                <span className={styles.quantityValue} aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={quantity >= 9}
                  className={styles.quantityBtn}
                  onClick={() => setQuantity((value) => Math.min(9, value + 1))}
                >
                  +
                </button>
              </div>
              {variant.overall === 'preorder' ? (
                <button type="button" className={styles.preOrderButton} onClick={activation}>
                  <Icon name="clock" size={19} strokeWidth={1.7} />
                  Pre-order
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.addToCart}
                  disabled={variant.inStock === false || adding}
                  onClick={activation}
                >
                  <Icon name="bag" size={20} strokeWidth={1.8} />
                  {addLabel}
                </button>
              )}
              <button
                type="button"
                aria-label={`${wished ? 'Remove from' : 'Save to'} wishlist`}
                aria-pressed={wished}
                className={`${styles.wishlistBig} ${styles.desktopControls}`}
                disabled={commerce?.busy === true}
                onClick={toggleWish}
              >
                <Icon
                  name="heart"
                  size={22}
                  strokeWidth={1.7}
                  fill={wished ? 'var(--hw-action-primary)' : 'none'}
                  stroke={wished ? 'var(--hw-action-primary)' : 'var(--hw-text-primary)'}
                />
              </button>
            </div>

            <ul className={styles.infoPanel}>
              <li>
                <Icon name="package" size={20} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  Nordhaven portfolio collection. Product and fulfilment details are illustrative.
                </span>
              </li>
              <li>
                <Icon name="info" size={20} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  Adding to cart doesn’t reserve stock. Price and availability are confirmed at
                  checkout, and delivery options are shown there before you pay.
                </span>
              </li>
            </ul>

            {inSetCard ? (
              <Link href={inSetCard.href} className={styles.setCard}>
                <StorefrontImage
                  image={inSetCard.image}
                  alt=""
                  className={styles.setCardImage}
                  sizes="88px"
                />
                <span className={styles.setCardBody}>
                  <span className={styles.setCardEyebrow}>{inSetCard.eyebrow}</span>
                  <span className={styles.setCardName}>{inSetCard.name}</span>
                  <span className={styles.setCardLine}>
                    <span className={styles.desktopControls}>{inSetCard.lineLong}</span>
                    <span className={styles.mobileControls}>{inSetCard.lineShort}</span>
                  </span>
                </span>
                <Icon name="chevron-right" size={18} strokeWidth={2} aria-hidden="true" />
              </Link>
            ) : null}
          </section>
        </div>
      </div>

      {children}

      {/* wide layouts have no bar of their own; narrow keeps one in view */}
      <div className={`${styles.stickyBar} ${styles.mobileControls}`}>
        <div className={styles.stickyBarInner}>
          <div className={styles.stickyBarSelection}>
            <span className={styles.stickyBarLine}>
              {[variant.colour?.label, variant.size?.label, `qty ${quantity}`]
                .filter((part) => part !== undefined)
                .join(' · ')}
            </span>
            <Pulse kind="flash" value={variant.price.amountMinor} className={styles.stickyBarPrice}>
              {formatMoney(variant.price)}
            </Pulse>
          </div>
          <button
            type="button"
            className={styles.stickyBarAdd}
            disabled={variant.inStock === false || adding}
            onClick={activation}
          >
            {variant.inStock ? 'Add to cart' : 'Out of stock'}
          </button>
        </div>
      </div>
    </div>
  );

  return <ProductVariantContext.Provider value={variant}>{content}</ProductVariantContext.Provider>;
}

/* ------------------------------------------------------------------ *
 * Small pure helpers shared with the picker
 * ------------------------------------------------------------------ */

function isSizeAllowed(
  product: StorefrontProduct,
  colourId: string | undefined,
  sizeId: string,
): boolean {
  const colour = product.options
    .find((option) => option.attribute === 'colour')
    ?.values.find((value) => value.id === colourId);
  const allowed = colour?.availableSizes;
  return allowed === undefined ? true : allowed.includes(sizeId);
}

function paramsToVariantParams(params: URLSearchParams): VariantParams {
  return {
    sku: params.get('sku') ?? undefined,
    colour: params.get('colour') ?? undefined,
    size: params.get('size') ?? undefined,
  };
}
