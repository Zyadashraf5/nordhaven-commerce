'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCartWishlist } from '../providers/CartWishlistProvider';
import styles from '../shop/CartPage.module.css';

/**
 * The cart/wishlist confirmation outside the cart and wishlist pages (which
 * render their own): "added to your cart", "saved to your wishlist", or an
 * honest failure from the API. Uses the cart board's toast styling.
 */
export function CommerceToast() {
  const pathname = usePathname();
  const { toast, undo, dismissToast } = useCartWishlist();
  if (toast === null || pathname === '/cart' || pathname === '/wishlist') return null;
  const failed = toast.kind === 'error';
  return (
    <div role={failed ? 'alert' : 'status'} className={`${styles.toast} hw-anim-toast`}>
      <span aria-hidden="true" className={styles.toastCheck}>
        {failed ? '!' : '✓'}
      </span>
      <span className={styles.toastText}>{toast.text}</span>
      {toast.withUndo ? (
        <button type="button" className={styles.toastUndo} onClick={undo}>
          Undo
        </button>
      ) : null}
      {toast.withCart ? (
        <Link href="/cart" className={styles.toastLink} onClick={dismissToast}>
          View cart
        </Link>
      ) : null}
      {toast.withWish ? (
        <Link href="/wishlist" className={styles.toastLink} onClick={dismissToast}>
          View wishlist
        </Link>
      ) : null}
      {failed ? (
        <button type="button" className={styles.toastUndo} onClick={dismissToast}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
