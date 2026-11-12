'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney } from '../../data/money';
import { getColourValues, getSizeValues } from '../../lib/product';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import { useOptionalCartWishlist } from '../providers/CartWishlistProvider';
import type { StorefrontProduct } from '../../data/types';
import styles from './VariantSheet.module.css';

export interface VariantSheetProps {
  product: StorefrontProduct | null;
  initialColourId: string | undefined;
  onClose: () => void;
  /**
   * When provided, the confirm button runs this instead of adding to the cart
   * (the wishlist picker uses it to move a chosen variant). Omitted, the exact
   * variant is added to the live cart (F06), or the sign-in sheet opens.
   */
  onAdd?: (selection: { colourId: string; sizeId: string | undefined }) => void;
  /** Optional override for the confirm button label ("Move to cart"). */
  addLabel?: string;
}

/**
 * The "Choose options" sheet from the approved boards. It appears when a
 * product varies by two or more attributes — in the sample data, the casserole
 * (colour × size).
 */
export function VariantSheet({
  product,
  initialColourId,
  onClose,
  onAdd,
  addLabel,
}: VariantSheetProps) {
  const colours = product ? getColourValues(product) : [];
  const sizes = product ? getSizeValues(product) : [];
  const [colourId, setColourId] = useState<string | undefined>(initialColourId);
  const [sizeId, setSizeId] = useState<string | undefined>(sizes[0]?.id);
  const { requestSignIn } = useStorefrontUi();
  const commerce = useOptionalCartWishlist();

  useEffect(() => {
    setColourId(initialColourId);
    setSizeId(sizes[0]?.id);
    // `sizes` is derived from `product`, which changes together with `initialColourId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, initialColourId]);

  useEffect(() => {
    if (product === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [product, onClose]);

  if (product === null) return null;

  const colour = colours.find((value) => value.id === colourId) ?? colours[0];
  const size = sizes.find((value) => value.id === sizeId) ?? sizes[0];
  const sizeAvailable =
    size === undefined
      ? false
      : colour?.availableSizes === undefined
        ? size.inStock
        : colour.availableSizes.includes(size.id);
  const price = size?.price ?? product.price;
  const previousPrice = size?.previousPrice ?? product.previousPrice;
  const image = colour?.image ?? product.image;
  const sku = colour?.sku;

  return (
    <div className={`${styles.backdrop} hw-anim-backdrop`} onClick={onClose} data-lenis-prevent>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hw-variant-title"
        className={`${styles.sheet} hw-anim-sheet`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 id="hw-variant-title" className={styles.title}>
            Choose options
          </h2>
          <button type="button" aria-label="Close" className={styles.close} onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.summary}>
            <StorefrontImage
              image={image}
              alt={colour ? `${product.name} in ${colour.label}` : image.alt}
              className={styles.summaryImage}
              sizes="120px"
            />
            <div className={styles.summaryText}>
              <span className={styles.summaryName}>{product.name}</span>
              <span className={styles.summaryPriceRow}>
                <span className={styles.summaryPrice}>{formatMoney(price)}</span>
                {previousPrice ? (
                  <s className={styles.summaryWas}>{formatMoney(previousPrice)}</s>
                ) : null}
              </span>
            </div>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>
              Colour: <span className={styles.legendValue}>{colour?.label}</span>
            </legend>
            <div role="radiogroup" aria-label="Colour" className={styles.colours}>
              {colours.map((value) => {
                const selected = value.id === colour?.id;
                return (
                  <button
                    key={value.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={value.inStock ? value.label : `${value.label}, out of stock`}
                    className={`${styles.colour} ${selected ? styles.colourSelected : ''}`}
                    onClick={() => setColourId(value.id)}
                  >
                    <span
                      className={styles.colourDot}
                      style={{ background: value.swatchHex ?? 'var(--hw-bg-well)' }}
                    />
                    {value.inStock ? null : <span className={styles.colourStrike} />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {sizes.length > 0 ? (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Size</legend>
              <div role="radiogroup" aria-label="Size" className={styles.sizes}>
                {sizes.map((value) => {
                  const selected = value.id === size?.id;
                  const available =
                    colour?.availableSizes === undefined
                      ? value.inStock
                      : colour.availableSizes.includes(value.id);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={available ? value.label : `${value.label}, out of stock`}
                      className={`${styles.size} ${selected ? styles.sizeSelected : ''} ${
                        available ? '' : styles.sizeUnavailable
                      }`}
                      onClick={() => setSizeId(value.id)}
                    >
                      <span className={styles.sizeLabel}>{value.label}</span>
                      <span className={styles.sizeSub}>
                        {available
                          ? value.price
                            ? formatMoney(value.price)
                            : ''
                          : `Out of stock in ${colour?.label ?? 'this colour'}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <span
            className={`${styles.availability} ${
              sizeAvailable ? styles.availabilityOk : styles.availabilityMuted
            }`}
          >
            {product.availability === 'unknown'
              ? 'Availability confirmed at checkout'
              : `${sizeAvailable ? '✓ In stock' : '✕'} ${colour?.label ?? ''}${
                  size ? `, ${size.label.split(' · ')[0]}` : ''
                }${sizeAvailable ? '' : ' is out of stock'}`}
          </span>

          {sizeAvailable ? (
            <button
              type="button"
              className={styles.addButton}
              onClick={() => {
                if (onAdd !== undefined) {
                  onAdd({ colourId: colour?.id ?? '', sizeId: size?.id });
                  onClose();
                  return;
                }
                if (commerce === null) {
                  requestSignIn('cart');
                  return;
                }
                void commerce
                  .addProduct(product, { colourId: colour?.id, sizeId: size?.id })
                  .then((added) => {
                    if (added) onClose();
                  });
              }}
              disabled={commerce?.busy === true}
            >
              {addLabel ?? 'Add to cart'} · {formatMoney(price)}
            </button>
          ) : (
            <button type="button" className={styles.disabledButton} disabled>
              This combination is out of stock
            </button>
          )}

          <p className={styles.note}>
            {sku ? `SKU ${sku} · ` : ''}
            Adding to cart doesn’t reserve stock; price and availability are checked again at
            checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
