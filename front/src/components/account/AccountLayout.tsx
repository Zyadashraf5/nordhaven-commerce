import Link from 'next/link';
import type { ReactNode } from 'react';
import { AccountSidebar } from '../layout/AccountSidebar';
import { RequireSession } from '../auth/RequireSession';
import { Icon } from '../ui/Icon';
import styles from './account.module.css';

/**
 * Shared shell for the built account pages (Stage 3 "My account" boards): a
 * breadcrumb, the sidebar and the content column, plus the page-level demo
 * note every preview carries.
 *
 * Narrow layout (Stage 3/4 mobile boards): inner pages show one back link to
 * the account instead of the trail and the section menu; the overview shows
 * the section menu as a list after its cards.
 */
export function AccountLayout({
  crumb,
  activeLabel,
  notice,
  back = { label: 'My account', href: '/account' },
  children,
}: {
  /** Current section label rendered after "My account". */
  crumb: string;
  /** Sidebar entry that is on this page. */
  activeLabel: string;
  /** Page-level sample-data disclaimer. */
  notice: string;
  /** Narrow-layout back link on inner pages. */
  back?: { label: string; href: string };
  children: ReactNode;
}) {
  const overview = crumb === 'Overview';
  return (
    <div className={`${styles.main} ${overview ? styles.mainOverview : ''}`}>
      {overview ? null : (
        <Link href={back.href} className={styles.mobileBack}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <Link href="/" className={styles.crumbLink}>
          Home
        </Link>
        <span aria-hidden="true" className={styles.crumbSep}>
          /
        </span>
        {crumb === 'Overview' ? (
          <span aria-current="page" className={styles.crumbCurrent}>
            My account
          </span>
        ) : (
          <>
            <Link href="/account" className={styles.crumbLink}>
              My account
            </Link>
            <span aria-hidden="true" className={styles.crumbSep}>
              /
            </span>
            <span aria-current="page" className={styles.crumbCurrent}>
              {crumb}
            </span>
          </>
        )}
      </nav>
      <RequireSession>
        <div className={styles.columns}>
          <div className={styles.sidebarSlot}>
            <AccountSidebar activeLabel={activeLabel} />
          </div>
          <div className={styles.content}>
            {children}
            <p className={styles.demoNote}>
              <Icon name="alert" size={13} strokeWidth={1.8} aria-hidden="true" />{' '}
              <span>{notice}</span>
            </p>
          </div>
        </div>
      </RequireSession>
    </div>
  );
}
