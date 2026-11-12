'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Role } from '../../lib/api/auth-types';
import { useSession } from '../providers/SessionProvider';
import styles from './RequireSession.module.css';

/**
 * Shows its children only to a signed-in visitor (optionally with a role).
 * This is presentation, not protection: every request these pages make is
 * still authorised by the backend (role, MFA, ownership). It keeps signed-out
 * visitors from seeing empty or broken screens and tells them what to do.
 */
export function RequireSession({
  role,
  children,
}: {
  /** `ADMIN` for the admin area; any signed-in account otherwise. */
  role?: Role;
  children: ReactNode;
}) {
  const { state, signOut } = useSession();
  const pathname = usePathname();
  const signInHref = `/account/sign-in?next=${encodeURIComponent(pathname || '/')}`;

  if (state.status === 'loading') {
    return (
      <div className={styles.panel} role="status" aria-live="polite">
        <p className={styles.body}>Checking your session…</p>
      </div>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <div className={styles.panel} role="alert">
        <h1 className={styles.title}>We can’t reach the store right now</h1>
        <p className={styles.body}>{state.message} Please try again shortly.</p>
      </div>
    );
  }

  if (state.status === 'signed-out') {
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>
          {role === 'ADMIN' ? 'Administrator sign-in required' : 'Sign in to continue'}
        </h1>
        <p className={styles.body}>
          {role === 'ADMIN'
            ? 'The admin area needs an administrator account with two-step verification.'
            : 'Your orders, wishlist, addresses and profile are kept with your account.'}
        </p>
        <Link href={signInHref} className={styles.primary}>
          Sign in
        </Link>
      </div>
    );
  }

  if (role && state.principal.role !== role) {
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>This area is for administrators</h1>
        <p className={styles.body}>
          You’re signed in as {state.principal.user.email}, which isn’t an administrator account.
        </p>
        <div className={styles.actions}>
          <Link href="/account" className={styles.primary}>
            Go to my account
          </Link>
          <button type="button" className={styles.secondary} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
