import Link from 'next/link';
import { placeholderHref, routes } from '../../lib/links';
import { Icon } from '../ui/Icon';
import {
  AccountGreeting,
  DefaultAddressBody,
  LatestOrderBody,
  NotificationsBody,
  PreOrdersBody,
} from './AccountLiveBits';
import styles from './account.module.css';

/**
 * The account overview (Stage 3 "My account" overview boards, desktop 1440 +
 * mobile 390): latest order, pre-orders, default address and the notifications
 * snapshot (all live, F06), then the quick links.
 */
export function AccountOverview() {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
        <h1 id="acc-h1" className={styles.headline}>
          {/* The account boards greet differently per layout. */}
          <AccountGreeting />
        </h1>
        <p className={styles.headlineBody}>
          Your orders, pre-orders and saved details, all in one place.
        </p>
      </div>

      <div className={styles.overviewGrid} data-overview-grid data-reveal-stagger>
        {/* Latest order */}
        <article className={styles.card}>
          <div className={styles.cardTopRow}>
            <h2 className={styles.cardLabel}>Latest order</h2>
          </div>
          <LatestOrderBody styles={styles} />
        </article>

        {/* Pre-orders */}
        <article className={styles.card}>
          <div className={styles.cardTopRow}>
            <h2 className={styles.cardLabel}>Pre-orders</h2>
          </div>
          <PreOrdersBody styles={styles} />
        </article>

        {/* Default address */}
        <article className={styles.card}>
          <h2 className={styles.cardLabel}>Default address</h2>
          <DefaultAddressBody />
          <div style={{ marginTop: 'auto', paddingTop: 4 }}>
            <Link href="/account/addresses" className={styles.btnOutline}>
              Manage addresses
            </Link>
          </div>
        </article>

        {/* Notifications */}
        <article className={styles.card}>
          <h2 className={styles.cardLabel}>Notifications</h2>
          <NotificationsBody styles={styles} />
          <div style={{ marginTop: 'auto', paddingTop: 4 }}>
            <Link href={routes.notifications} className={styles.btnOutline}>
              Open notifications
            </Link>
          </div>
        </article>
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2
          style={{ margin: 0, fontFamily: 'var(--hw-font-display)', fontWeight: 400, fontSize: 28 }}
        >
          Quick links
        </h2>
        <div className={styles.quickGrid}>
          <QuickLink label="Wishlist" href="/wishlist" />
          <QuickLink label="Start a return" href={routes.returns} />
          <QuickLink label="Review your purchases" href={routes.reviews} />
          <QuickLink label="Edit your profile" href="/account/profile" />
          <QuickLink label="Change your password" href="/account/security" />
          <QuickLink label="Help centre" href={placeholderHref('Help centre')} />
        </div>
      </div>
    </>
  );
}

function QuickLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className={styles.quickLink}
      style={{ justifyContent: 'space-between', minHeight: 56, padding: '0 8px', gap: 12 }}
    >
      <span>{label}</span>
      <Icon name="chevron-right" size={16} strokeWidth={2} />
    </Link>
  );
}
