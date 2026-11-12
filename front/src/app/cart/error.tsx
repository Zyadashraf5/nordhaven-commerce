'use client';

import Link from 'next/link';
import { ShopShell } from '../../components/layout/ShopShell';
import { Icon } from '../../components/ui/Icon';
import styles from '../../components/shop/CartPage.module.css';

/**
 * The cart's error state (Stage 3 "Cart states" board): the alert mark, a
 * plain explanation that items are saved on the account, and retry.
 */
export default function CartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[cart] cart failed to render:', error);

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
        <div className={styles.errorBox} role="alert">
          <Icon name="alert" size={44} strokeWidth={1.3} className={styles.errorIcon} />
          <strong className={styles.errorTitle}>We couldn’t load your cart</strong>
          <span className={styles.errorBody}>
            Your items are still saved to your account. Check your connection and try again.
          </span>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className={styles.retry} onClick={reset}>
              Retry
            </button>
            <Link href="/products" className={styles.retry}>
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </ShopShell>
  );
}
