'use client';

import Link from 'next/link';
import { ShopShell } from '../../components/layout/ShopShell';
import { Icon } from '../../components/ui/Icon';
import styles from '../../components/account/account.module.css';

/**
 * The account section's error state: same shape as the cart error boundary ’
 * a short explanation and retry, inside the storefront shell.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[account] account page failed to render:', error);

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
        <div
          className={styles.summaryAlert}
          role="alert"
          style={{ alignSelf: 'center', gap: 12, padding: '22px 24px' }}
        >
          <Icon name="alert" size={36} strokeWidth={1.4} stroke="#a1362b" />
          <div>
            <strong style={{ fontSize: 16 }}>We couldn’t load your account page</strong>
            <p className={styles.confirmBoxLabel} style={{ marginTop: 6 }}>
              Nothing was changed. Try again, or head back to the storefront.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className={styles.btnOutline} onClick={reset}>
                Retry
              </button>
              <Link href="/" className={styles.btnOutline}>
                Go home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ShopShell>
  );
}
