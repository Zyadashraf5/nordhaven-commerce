'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { useOptionalSession } from '../providers/SessionProvider';
import styles from './AdminLayout.module.css';
import { AdminSidebar } from './AdminSidebar';
import { RequireSession } from '../auth/RequireSession';
import { MotionMain } from '../../motion/MotionMain';

/**
 * Admin shell (Stage 5 admin boards): a full-height charcoal sidebar with the
 * grouped sections, a top bar with the breadcrumb and the signed-in admin
 * identity, and the content column. It replaces the storefront chrome; on
 * the narrow board the sidebar becomes a drawer behind a menu button.
 *
 * The shell shows the signed-in administrator; the backend enforces the
 * ADMIN role + MFA on every /admin request (F06), the page guard only keeps
 * other visitors from seeing empty screens.
 */
interface AdminLayoutProps {
  /** Breadcrumbs rendered after "Admin". */
  crumbs: Array<{ label: string; href: string }>;
  /** Sidebar entry that is on this page. */
  activeLabel: string;
  /** `ar` renders the Arabic RTL preview of the shell. */
  lang?: 'en' | 'ar';
  children: ReactNode;
}

/* Shell copy; Arabic from the Admin Orders RTL board (* = polish pass). */
const SHELL_COPY = {
  en: {
    skip: 'Skip to content',
    tag: 'Admin',
    store: 'Egypt store · EGP',
    viewStore: 'View the store',
    admin: 'Admin',
    menu: 'Open admin menu',
    close: 'Close menu',
    mfa: (on: boolean) => `MFA ${on ? 'enrolled' : 'not enrolled'}`,
    demo: 'Live admin — figures come from the store’s API, and the backend checks the ADMIN role and second factor on every request. This is the TEST environment: payments use the non-production test provider.',
  },
  ar: {
    skip: 'انتقل إلى المحتوى', // *
    tag: 'لوحة الإدارة',
    store: 'متجر مصر · EGP',
    viewStore: 'عرض المتجر', // *
    admin: 'الإدارة',
    menu: 'فتح قائمة الإدارة', // *
    close: 'إغلاق القائمة', // *
    mfa: (on: boolean) => (on ? 'التحقق الثنائي مُفعّل' : 'التحقق الثنائي غير مُفعّل'), // *
    demo: 'لوحة إدارة فعلية — الأرقام من واجهة المتجر، ويتحقق الخادم من صلاحية المسؤول والتحقق الثنائي في كل طلب. هذه بيئة اختبار: الدفع عبر مزوّد تجريبي.', // *
  },
};

export function AdminLayout({ crumbs, activeLabel, lang = 'en', children }: AdminLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const t = SHELL_COPY[lang];
  const principal = useOptionalSession()?.principal ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className={styles.shell} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <a href="#main" className="hw-skip-link">
        {t.skip}
      </a>

      <aside
        id="admin-sidebar"
        aria-label="Admin navigation"
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}
      >
        <div className={styles.brand}>
          <Link href="/admin" className={styles.brandMark}>
            <span className={styles.brandName}>Nordhaven</span>
            <span className={styles.brandTag}>{t.tag}</span>
          </Link>
          <span className={styles.brandStore}>{t.store}</span>
        </div>
        <AdminSidebar activeLabel={activeLabel} lang={lang} />
        <div className={styles.sidebarFoot}>
          <Link href="/">{t.viewStore}</Link>
        </div>
      </aside>
      {menuOpen ? (
        <button
          type="button"
          aria-label={t.close}
          className={styles.backdrop}
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className={styles.workspace}>
        <header className={styles.topBar}>
          <button
            type="button"
            aria-label={t.menu}
            aria-expanded={menuOpen}
            aria-controls="admin-sidebar"
            className={styles.menuButton}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" size={22} strokeWidth={1.8} />
          </button>
          <Link href="/admin" className={styles.mobileBrand}>
            <span className={styles.brandName}>Nordhaven</span>
            <span className={styles.brandTag}>{t.tag}</span>
          </Link>

          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            <Link href="/admin" className={styles.crumbLink}>
              {t.admin}
            </Link>
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <Fragment key={crumb.label}>
                  <span aria-hidden="true" className={styles.crumbSep}>
                    /
                  </span>
                  {last ? (
                    <span aria-current="page" className={styles.crumbCurrent}>
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className={styles.crumbLink}>
                      {crumb.label}
                    </Link>
                  )}
                </Fragment>
              );
            })}
          </nav>

          {/* The signed-in administrator (GET /api/v1/auth/principal). The
              backend issues an ADMIN session only after the second factor. */}
          {principal?.role === 'ADMIN' ? (
            <div className={styles.adminIdentity}>
              <span className={styles.adminIdentityName}>{principal.user.email}</span>
              <span className={styles.adminIdentityRole}>{principal.role}</span>
              <span className={styles.adminIdentityMfa}>{t.mfa(true)}</span>
            </div>
          ) : null}
        </header>

        <MotionMain className={styles.content} admin>
          <RequireSession role="ADMIN">{children}</RequireSession>
        </MotionMain>

        <p className={styles.demoNote}>{t.demo}</p>
      </div>
    </div>
  );
}
