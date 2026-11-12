import Link from 'next/link';
import { Icon } from '../ui/Icon';
import styles from './CheckoutHeader.module.css';

/**
 * The checkout chrome from the Stage 3 checkout boards: the store navigation
 * is replaced by the wordmark, a "Secure checkout" marker and a way back to
 * the cart, so nothing pulls the shopper out of the flow.
 */
export function CheckoutHeader({ lang = 'en' }: { lang?: 'en' | 'ar' }) {
  const ar = lang === 'ar';
  return (
    <header className={styles.header} dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
      <div className={styles.inner}>
        <Link href="/cart" className={styles.back}>
          <Icon name="chevron-left" size={18} strokeWidth={2} aria-hidden="true" />
          {/* Arabic copy from the checkout RTL board. */}
          <span className={styles.backText}>{ar ? 'السلة' : 'Back to cart'}</span>
        </Link>
        <Link href="/" aria-label="Nordhaven Commerce home" className={styles.wordmark}>
          <span className={styles.wordmarkMain}>Nordhaven</span>
          <span className={styles.wordmarkSub}>Commerce</span>
        </Link>
        <span className={styles.secure}>
          <Icon name="lock" size={16} strokeWidth={1.8} aria-hidden="true" />
          {ar ? (
            'دفع آمن'
          ) : (
            <>
              Secure<span className={styles.secureRest}> checkout</span>
            </>
          )}
        </span>
      </div>
    </header>
  );
}
