'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '../ui/Icon';
import { useOptionalSession } from '../providers/SessionProvider';
import styles from './AccountSidebar.module.css';

/**
 * The account sidebar from the Stage 3 boards (wishlist / my account shell):
 * greeting with the signed-in email, section links and a real sign-out
 * (F06). The demo unread pill is gone until notifications are read from the
 * backend, so no invented count is shown.
 */

interface SidebarSection {
  label: string;
  icon: IconName;
  href: string;
  /** Renders the demo unread pill. */
  badge?: number;
  isCurrent?: boolean;
}

const SECTIONS: SidebarSection[] = [
  { label: 'Overview', icon: 'house', href: '/account' },
  { label: 'Orders', icon: 'orders', href: '/account/orders' },
  { label: 'Pre-orders', icon: 'clock', href: '/account/pre-orders' },
  { label: 'Returns', icon: 'returns', href: '/account/returns' },
  { label: 'Wishlist', icon: 'heart', href: '/wishlist' },
  { label: 'Reviews', icon: 'reviews', href: '/account/reviews' },
  { label: 'Notifications', icon: 'bell', href: '/account/notifications' },
  { label: 'Addresses', icon: 'pin', href: '/account/addresses' },
  { label: 'Profile', icon: 'user', href: '/account/profile' },
  { label: 'Password & security', icon: 'lock', href: '/account/security' },
];

export function AccountSidebar({ activeLabel = 'Wishlist' }: { activeLabel?: string }) {
  const session = useOptionalSession();
  const router = useRouter();
  const email = session?.principal?.user.email ?? null;
  return (
    <aside aria-label="My account" className={styles.sidebar}>
      <div className={styles.greeting}>
        {/* The signed-in account (F06, GET /api/v1/auth/principal). */}
        <span className={styles.greetingName}>Hello</span>
        {email ? <span className={styles.greetingEmail}>{email}</span> : null}
      </div>
      <nav aria-label="Account sections" className={styles.nav}>
        {SECTIONS.map((section) => (
          <Link
            key={section.label}
            href={section.href}
            className={`${styles.section} ${section.label === activeLabel ? styles.sectionActive : ''}`}
            aria-current={section.label === activeLabel ? 'page' : undefined}
          >
            <Icon name={section.icon} size={20} strokeWidth={1.6} aria-hidden="true" />
            <span className={styles.sectionLabel}>{section.label}</span>
            {section.badge !== undefined ? (
              <span className={styles.badge}>
                {section.badge}
                <span className="hw-visually-hidden"> unread</span>
              </span>
            ) : null}
          </Link>
        ))}
        <span aria-hidden="true" className={styles.divider} />
        {/* Ends this session at the backend (DELETE /api/v1/auth/sessions/current). */}
        <button
          type="button"
          className={styles.section}
          onClick={() => {
            void session?.signOut().then(() => {
              router.push('/');
            });
          }}
        >
          <Icon name="sign-out" size={20} strokeWidth={1.6} aria-hidden="true" />
          <span className={styles.sectionLabel}>Sign out</span>
        </button>
      </nav>
    </aside>
  );
}
