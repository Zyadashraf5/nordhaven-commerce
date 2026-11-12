'use client';

import Link from 'next/link';
import { ShopShell } from '../../components/layout/ShopShell';
import { Icon } from '../../components/ui/Icon';
import styles from '../../components/shop/ProductListing.module.css';

/**
 * The error state (board-06 §4): the alert mark, a plain explanation, and
 * retry. Next.js keeps the URL (and therefore the visitor's filters) intact;
 * the message says exactly that.
 */
export default function ProductsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[products] listing failed:', error);

  return (
    <ShopShell mobileHeader="search">
      <div className={styles.page}>
        <div className={styles.errorBox} role="alert">
          <Icon name="alert" size={44} strokeWidth={1.3} className={styles.errorIcon} />
          <h1 className={styles.errorTitle}>We couldn’t load these products</h1>
          <p className={styles.errorBody}>
            Your filters are kept. Check your connection and try again.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className={styles.retry} onClick={reset}>
              Try again
            </button>
            <Link href="/" className={`${styles.retry} ${styles.retryLink}`}>
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </ShopShell>
  );
}
