'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { Pulse } from '../../motion/Pulse';
import { StorefrontImage } from '../ui/StorefrontImage';
import { formatMoney, formatSaving } from '../../data/money';
import { getColourValues, resolveAvailability, resolveCardAction } from '../../lib/product';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import { useOptionalCartWishlist } from '../providers/CartWishlistProvider';
import type { StorefrontBundle, StorefrontProduct } from '../../data/types';
import styles from './ListingCard.module.css';

export type ListingCardModel =
  | { kind: 'product'; product: StorefrontProduct }
  | { kind: 'bundle'; bundle: StorefrontBundle };

export interface ListingCardProps {
  model: ListingCardModel;
  onChooseOptions: (product: StorefrontProduct, colourId: string | undefined) => void;
}

/**
 * The approved Stage 2 listing card (board-04 wide, board-05 narrow).
 *
 * One component renders both record kinds, because the boards design them on
 * the shared card anatomy: brand eyebrow, name, price, availability line and
 * one action. The action rules are F01's (`lib/product.ts` bay — the same
 * table both boards approve), bundles carry a "View set" action and never a
 * discount badge or savings claim.
 */
export function ListingCard({ model, onChooseOptions }: ListingCardProps) {
  if (model.kind === 'bundle') {
    return <BundleCard bundle={model.bundle} />;
  }
  return <ProductListingCard product={model.product} onChooseOptions={onChooseOptions} />;
}

/* ------------------------------------------------------------------ *
 * Product card
 * ------------------------------------------------------------------ */

function ProductListingCard({
  product,
  onChooseOptions,
}: {
  product: StorefrontProduct;
  onChooseOptions: ListingCardProps['onChooseOptions'];
}) {
  const colours = getColourValues(product);
  const [selectedColourId, setSelectedColourId] = useState<string | undefined>(colours[0]?.id);
  const { requestSignIn } = useStorefrontUi();
  const commerce = useOptionalCartWishlist();
  const wished = commerce?.isWished(product.id) ?? false;

  const selectedColour = colours.find((colour) => colour.id === selectedColourId) ?? colours[0];
  const image = selectedColour?.image ?? product.image;
  const availability = resolveAvailability(product, selectedColourId);
  const action = resolveCardAction(product, selectedColourId);
  const saving =
    product.previousPrice && product.price.amountMinor < product.previousPrice.amountMinor
      ? product.previousPrice.amountMinor - product.price.amountMinor
      : null;

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <Link
          href={`/products/${product.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className={styles.mediaLink}
        >
          <StorefrontImage
            image={image}
            alt={selectedColour ? `${product.name} in ${selectedColour.label}` : image.alt}
            fill
            sizes="(max-width: 1023px) 50vw, 340px"
          />
        </Link>

        {product.discountBadge ? (
          <span className={styles.badgeDiscount}>{product.discountBadge}</span>
        ) : null}
        {product.preOrder ? <span className={styles.badgePreOrder}>Pre-order</span> : null}

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
          <span className={styles.wishlistCircle}>
            <Pulse value={wished}>
              <Icon
                name="heart"
                size={20}
                strokeWidth={1.6}
                fill={wished ? 'var(--hw-action-primary)' : 'none'}
                stroke={wished ? 'var(--hw-action-primary)' : 'var(--hw-text-primary)'}
              />
            </Pulse>
          </span>
        </button>
      </div>

      <div className={styles.body}>
        {colours.length > 0 ? (
          <div className={styles.slot}>
            <div role="radiogroup" aria-label="Colour" className={styles.swatches}>
              {colours.map((colour) => {
                const selected = colour.id === selectedColour?.id;
                const soldOut =
                  !colour.inStock ||
                  (colour.availableSizes !== undefined && colour.availableSizes.length === 0);
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
          <div className={`${styles.slot} ${styles.swatchNote}`}>
            {product.variantNote ?? product.summary}
          </div>
        )}

        <div className={styles.titleGroup}>
          <span className={styles.brand}>{product.brand.name}</span>
          <Link href={`/products/${product.slug}`} className={styles.name}>
            {product.name}
          </Link>
        </div>

        <div className={styles.priceRow}>
          <bdi>
            <span
              className={`${styles.price} ${saving !== null ? styles.priceOffer : ''} ${
                product.availability === 'out_of_stock' ? styles.priceMuted : ''
              }`}
            >
              {formatMoney(product.price)}
            </span>
          </bdi>
          {product.previousPrice ? (
            <bdi>
              <s className={styles.was}>{formatMoney(product.previousPrice)}</s>
            </bdi>
          ) : null}
          {saving !== null ? (
            <bdi>
              <span className={styles.save}>
                {formatSaving({ amountMinor: saving, currency: 'EGP' })}
              </span>
            </bdi>
          ) : null}
        </div>

        <span
          className={`${styles.availability} ${
            availability.state === 'in_stock'
              ? styles.availabilityOk
              : availability.state === 'partial'
                ? styles.availabilityOk
                : availability.state === 'preorder'
                  ? styles.availabilityInfo
                  : styles.availabilityMuted
          }`}
        >
          {availability.state === 'in_stock' || availability.state === 'partial' ? (
            <Icon name="check" size={15} strokeWidth={1.8} />
          ) : null}
          {availability.state === 'out_of_stock' ? (
            <Icon name="cross" size={15} strokeWidth={1.8} />
          ) : null}
          {availability.state === 'preorder' ? (
            <Icon name="clock" size={15} strokeWidth={1.6} />
          ) : null}
          <span className="hw-wide">{availability.text}</span>
          <span className="hw-narrow">{availability.shortWithSymbol}</span>
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
            <Link href={`/products/${product.slug}`} className={styles.actionPreOrder}>
              View details
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Bundle card — "View set" only; no savings badge, no discount strike.
 * ------------------------------------------------------------------ */

function BundleCard({ bundle }: { bundle: StorefrontBundle }) {
  const available = bundle.kind === 'fixed' ? bundle.inStock : bundle.available;
  const inStockCount = bundle.components.filter((component) => component.inStock).length;
  const isFixed = bundle.kind === 'fixed';

  // The boards' "items · stock" note lines, per layout and set kind.
  const noteLong = isFixed
    ? `${bundle.components.length} items · one packed box`
    : inStockCount === bundle.components.length
      ? `${bundle.components.length} items · each in stock`
      : `${inStockCount} of ${bundle.components.length} items in stock`;
  const noteShort = `${bundle.components.length} items`;
  const availabilityLong = available
    ? isFixed
      ? '✓ In stock as a packed set'
      : '✓ All items in stock'
    : isFixed
      ? '✕ Out of stock'
      : '✕ Not available right now';
  const availabilityShort = available
    ? isFixed
      ? '✓ In stock as a set'
      : availabilityLong
    : availabilityLong;

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <Link
          href={`/bundles/${bundle.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className={styles.mediaLink}
        >
          <StorefrontImage image={bundle.image} fill sizes="(max-width: 1023px) 50vw, 340px" />
        </Link>

        {isFixed ? (
          <span className={styles.badgeFixed}>
            <span className="hw-wide">Ready-packed set</span>
            <span className="hw-narrow">Ready-packed</span>
          </span>
        ) : (
          <span className={styles.badgeDynamic}>
            <span className="hw-wide">Set of individual items</span>
            <span className="hw-narrow">Item set</span>
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={`${styles.slot} ${styles.swatchNote}`}>
          <span className="hw-wide">{noteLong}</span>
          <span className="hw-narrow">{noteShort}</span>
        </div>

        <div className={styles.titleGroup}>
          <span className={styles.brand}>Nordhaven Commerce</span>
          <Link href={`/bundles/${bundle.slug}`} className={styles.name}>
            {bundle.name}
          </Link>
        </div>

        <div className={styles.priceRow}>
          <bdi>
            <span className={available ? styles.price : `${styles.price} ${styles.priceMuted}`}>
              {formatMoney(bundle.price)}
            </span>
          </bdi>
        </div>

        <span
          className={`${styles.availability} ${available ? styles.availabilityOk : styles.availabilityMuted}`}
        >
          <span className="hw-wide">{availabilityLong}</span>
          <span className="hw-narrow">{availabilityShort}</span>
        </span>

        <div className={styles.action}>
          <Link href={`/bundles/${bundle.slug}`} className={styles.actionOutline}>
            <Icon name="package" size={17} strokeWidth={1.8} />
            View set
          </Link>
        </div>
      </div>
    </article>
  );
}
