'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../ui/Icon';
import { useStorefrontUi } from '../providers/StorefrontUiProvider';
import styles from './SignInSheet.module.css';

const COPY = {
  cart: {
    title: 'Sign in to add to your cart',
    body: 'Your cart is kept with your account. You’ll come straight back here — browsing never needs an account.',
  },
  wishlist: {
    title: 'Sign in to save to your wishlist',
    body: 'Your wishlist is kept with your account, so it’s there on any device. You’ll come straight back to this page.',
  },
  account: {
    title: 'Sign in to your account',
    body: 'Your cart, wishlist and orders are kept with your account. You’ll come straight back to this page.',
  },
} as const;

/**
 * The sign-in sheet from the approved boards. Its actions lead to the real
 * account screens (`/account/sign-in`, F06) and carry the current path, so
 * the visitor comes straight back here after signing in.
 */
export function SignInSheet() {
  const { signInReason, closeSignIn } = useStorefrontUi();
  const dialogRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isOpen = signInReason !== null;
  // Come back to the exact page, including the picked variant (`?sku=…`),
  // which the product page keeps in the URL without a router round-trip.
  const search = isOpen && typeof window !== 'undefined' ? window.location.search : '';
  const next = encodeURIComponent(`${pathname || '/'}${search}`);
  const copy = signInReason === null ? null : COPY[signInReason];

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSignIn();
    };
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [isOpen, closeSignIn]);

  if (!isOpen || copy === null) return null;

  return (
    <div
      className={`${styles.backdrop} hw-anim-backdrop`}
      data-testid="signin-sheet"
      data-lenis-prevent
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className={`${styles.dialog} hw-anim-sheet`}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className={styles.heading}>
          <h2 id="signin-title" className={styles.title}>
            {copy.title}
          </h2>
          <button type="button" aria-label="Close" className={styles.close} onClick={closeSignIn}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className={styles.body}>{copy.body}</p>
        <Link
          className={styles.primary}
          href={`/account/sign-in?next=${next}`}
          onClick={closeSignIn}
        >
          Sign in
        </Link>
        <Link
          className={styles.secondary}
          href={`/account/sign-in?screen=register&next=${next}`}
          onClick={closeSignIn}
        >
          Create an account
        </Link>
        <button type="button" className={styles.keepBrowsing} onClick={closeSignIn}>
          Keep browsing
        </button>
      </div>
    </div>
  );
}
