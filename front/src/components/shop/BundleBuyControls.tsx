'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import styles from './BundleDetail.module.css';

/**
 * The quantity stepper and the Add-set action of the bundle detail page.
 *
 * The Add-set button stays disabled in this milestone on purpose: the
 * existing backend contract has no bundle-add / set-checkout endpoint yet,
 * so a click must never imply that any stock was reserved or an order
 * started. The tail note names that honestly.
 */
export function BundleBuyControls({
  /** aria-labelledby of the name heading, so the button reads as one action. */
  nameId,
  noteId,
  tailnote,
  children,
}: {
  nameId: string;
  noteId: string;
  tailnote: string;
  children?: ReactNode;
}) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className={styles.buyStack}>
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
        <button
          type="button"
          className={styles.addSet}
          disabled
          aria-describedby={noteId}
          aria-labelledby={`${nameId} ${noteId}`}
        >
          <Icon name="bag" size={20} strokeWidth={1.8} aria-hidden="true" />
          Add set to cart
        </button>
      </div>
      <span id={noteId} className={styles.demoTailnote}>
        {tailnote}
      </span>
      {children}
    </div>
  );
}
