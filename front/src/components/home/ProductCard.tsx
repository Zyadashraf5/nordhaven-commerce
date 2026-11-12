'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { Pulse } from '../../motion/Pulse';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney, formatSaving } from '../../data/money';
import { routes } from '../../lib/links';
import {
  getColourValues,
  getSizeValues,
  resolveAvailability,
  resolveCardAction,
} from '../../lib/product';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import { useOptionalCartWishlist } from '../providers/CartWishlistProvider';
import type { StorefrontProduct } from '../../data/types';
import styles from './ProductCard.module.css';

export interface ProductCardProps {
  product: StorefrontProduct;
  onChooseOptions: (product: StorefrontProduct, colourId: string | undefined) => void;
}

export function ProductCard({ product, onChooseOptions }: ProductCardProps) {
  const colours = getColourValues(product);
  const [selectedColourId, setSelectedColourId] = useState<string | undefined>(colours[0]?.id);
  const { requestSignIn } = useStorefrontUi();
  const commerce = useOptionalCartWishlist();
  const wished = commerce?.isWished(product.id) ?? false;

  const selectedColour = colours.find((colour) => colour.id === selectedColourId) ?? colours[0];
  const image = selectedColour?.image ?? product.image;
  const availability = resolveAvailability(product, selectedColourId);
  const action = resolveCardAction(product, selectedColourId);
  const sizes = getSizeValues(product);
  const saving =
    product.previousPrice && product.price.amountMinor < product.previousPrice.amountMinor
      ? product.previousPrice.amountMinor - product.price.amountMinor
      : null;

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <Link
          href={routes.product(product.slug)}
          tabIndex={-1}
          aria-hidden="true"
          className={styles.mediaLink}
        >
          <StorefrontImage
            image={image}
            alt={selectedColour ? `${product.name} in ${selectedColour.label}` : image.alt}
            fill
            sizes="(max-width: 1023px) 50vw, 300px"
            className={styles.image}
          />
        </Link>

        {product.discountBadge ? (
          <span className={styles.badge} data-shine>
            {product.discountBadge}
          </span>
        ) : null}
        {product.preOrder ? <span className={styles.preOrderTag}>Pre-order</span> : null}

        <button
          type="button"
          aria-label={`${wished ? 'Remove' : 'Save'} ${product.name} ${
            wished ? 'from wishlist' : 'to wishlist'
          }`}
          aria-pressed={wished}
          className={styles.wishlist}
          onClick={() => {
            // The wishlist belongs to an account: signed out, the sign-in sheet opens.
            if (commerce === null) {
              requestSignIn('wishlist');
              return;
            }
            commerce.toggleWishlist(product);
          }}
        >
          <Pulse value={wished}>
            <Icon
              name="heart"
              size={20}
              strokeWidth={1.6}
              fill={wished ? 'var(--hw-action-primary)' : 'none'}
              stroke={wished ? 'var(--hw-action-primary)' : 'var(--hw-text-primary)'}
            />
          </Pulse>
        </button>
      </div>

      <div className={styles.body}>
        {colours.length > 0 ? (
          <div className={styles.swatchRow}>
            <div role="radiogroup" aria-label="Colour" className={styles.swatches}>
              {colours.map((colour) => {
                const selected = colour.id === selectedColour?.id;
                const soldOut = colour.inStock === false;
                return (
                  <button
                    key={colour.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={soldOut ? `${colour.label}, out of stock` : colour.label}
                    className={`${styles.swatch} ${selected ? styles.swatchSelected : ''}`}
                    onClick={() => setSelectedColourId(colour.id)}
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
            {selectedColour ? (
              <span className={styles.swatchLabel}>{selectedColour.label}</span>
            ) : null}
          </div>
        ) : (
          <div className={styles.variantNote}>{product.variantNote ?? `${sizes.length} sizes`}</div>
        )}

        <div className={styles.titleGroup}>
          <Link href={routes.product(product.slug)} className={styles.name}>
            <span className="hw-wide">{product.name}</span>
            <span className="hw-narrow">{product.nameShort ?? product.name}</span>
          </Link>
          <span className={styles.summary}>{product.summary}</span>
        </div>

        <div className={styles.priceRow}>
          <span
            className={`${styles.price} ${saving !== null ? styles.priceOffer : ''} ${
              product.availability === 'out_of_stock' ? styles.priceMuted : ''
            }`}
          >
            {formatMoney(product.price)}
          </span>
          {product.previousPrice ? (
            <s className={styles.was}>{formatMoney(product.previousPrice)}</s>
          ) : null}
          {saving !== null ? (
            <span className={styles.save}>
              {formatSaving({ amountMinor: saving, currency: 'EGP' })}
            </span>
          ) : null}
        </div>

        <span
          className={`${styles.availability} ${
            availability.state === 'in_stock'
              ? styles.availabilityOk
              : availability.state === 'partial'
                ? styles.availabilityPartial
                : availability.state === 'preorder'
                  ? styles.availabilityInfo
                  : styles.availabilityMuted
          }`}
        >
          {availability.state === 'in_stock' ? (
            <Icon name="check" size={15} strokeWidth={1.8} />
          ) : null}
          {availability.state === 'partial' ? (
            <Icon name="half" size={15} strokeWidth={1.6} />
          ) : null}
          {availability.state === 'out_of_stock' ? (
            <Icon name="cross" size={15} strokeWidth={1.8} />
          ) : null}
          {availability.state === 'preorder' ? (
            <Icon name="clock" size={15} strokeWidth={1.6} />
          ) : null}
          <span className={styles.availabilityLong}>{availability.text}</span>
          <span className={styles.availabilityShort}>{availability.shortWithSymbol}</span>
        </span>

        <div className={styles.action}>
          {action.kind === 'add' ? (
            <button
              type="button"
              className={styles.actionSolid}
              onClick={() => {
                // Adds the card's single SKU to the live cart; signed out, the sheet opens.
                if (commerce === null) {
                  requestSignIn('cart');
                  return;
                }
                void commerce.addProduct(product, { colourId: selectedColourId });
              }}
              disabled={commerce?.busy === true}
            >
              <Icon name="bag" size={17} strokeWidth={1.9} />
              {action.label}
            </button>
          ) : null}
          {action.kind === 'options' ? (
            <button
              type="button"
              className={styles.actionOutline}
              onClick={() => {
                onChooseOptions(product, selectedColourId);
              }}
            >
              {action.label}
            </button>
          ) : null}
          {action.kind === 'disabled' ? (
            <button type="button" className={styles.actionDisabled} disabled>
              {action.label}
            </button>
          ) : null}
          {action.kind === 'preorder' ? (
            <Link href={routes.product(product.slug)} className={styles.actionPreOrder}>
              View details
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
