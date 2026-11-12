'use client';

import Link from 'next/link';
import { ShopShell } from '../../components/layout/ShopShell';
import { Icon } from '../../components/ui/Icon';
import styles from '../../components/shop/WishlistPage.module.css';

/**
 * The wishlist's error state (states board): the alert mark, a plain
 * explanation that saved items are on the account, and retry.
 */
export default function WishlistError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[wishlist] wishlist failed to render:', error);

  return (
    <ShopShell>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '28px var(--hw-gutter) 96px',
        }}
      >
        <div className={styles.emptyBox} role="alert">
          <Icon name="alert" size={44} strokeWidth={1.3} className={styles.emptyIcon} />
          <strong className={styles.emptyTitle}>We couldn’t load your wishlist</strong>
          <span className={styles.emptyBody}>
            Your saved items are still on your account. Check your connection and try again.
          </span>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.emptyPrimary}
              onClick={reset}
              style={{ border: 0, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Retry
            </button>
            <Link href="/products" className={styles.emptyOutline}>
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </ShopShell>
  );
}
