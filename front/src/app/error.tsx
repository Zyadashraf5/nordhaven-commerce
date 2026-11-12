'use client';

import { ShopShell } from '../components/layout/ShopShell';
import { Icon } from '../components/ui/Icon';
import styles from '../components/shop/ProductListing.module.css';

/**
 * Root error state (homepage and any page without its own boundary): the
 * store service could not be read. Nothing is replaced by invented content.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[storefront] page failed:', error);

  return (
    <ShopShell>
      <div className={styles.page}>
        <div className={styles.errorBox} role="alert">
          <Icon name="alert" size={44} strokeWidth={1.3} className={styles.errorIcon} />
          <h1 className={styles.errorTitle}>The store isn’t available right now</h1>
          <p className={styles.errorBody}>
            We couldn’t reach the store service. Nothing has been changed; please try again in a
            moment.
          </p>
          <button type="button" className={styles.retry} onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </ShopShell>
  );
}
