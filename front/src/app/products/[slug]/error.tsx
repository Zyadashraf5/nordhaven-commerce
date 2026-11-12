'use client';

import Link from 'next/link';
import { ShopShell } from '../../../components/layout/ShopShell';
import { Icon } from '../../../components/ui/Icon';
import styles from '../../../components/shop/ProductListing.module.css';

/** The product page when the catalogue cannot be read: a plain unavailable state with retry. */
export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[product] page failed:', error);

  return (
    <ShopShell>
      <div className={styles.page}>
        <div className={styles.errorBox} role="alert">
          <Icon name="alert" size={44} strokeWidth={1.3} className={styles.errorIcon} />
          <h1 className={styles.errorTitle}>We couldn’t load this product</h1>
          <p className={styles.errorBody}>
            The store service isn’t reachable right now. Nothing has been changed; try again in a
            moment.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className={styles.retry} onClick={reset}>
              Try again
            </button>
            <Link href="/products" className={`${styles.retry} ${styles.retryLink}`}>
              All products
            </Link>
          </div>
        </div>
      </div>
    </ShopShell>
  );
}
