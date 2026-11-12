'use client';

import Link from 'next/link';
import { Icon, type IconName } from '../ui/Icon';
import styles from './AdminLayout.module.css';

interface AdminSidebarSection {
  label: string;
  icon: IconName;
  href: string;
  /** Page `activeLabel`s that light up this entry. */
  matches?: string[];
}

/**
 * Grouped navigation from the Stage 5 admin boards (Sales, Catalog,
 * Operations, Customers, System). The boards' "Shipping" entry has no
 * screen yet, so it is not listed; shipping is handled on Returns.
 */
const GROUPS: Array<{ label: string | null; sections: AdminSidebarSection[] }> = [
  { label: null, sections: [{ label: 'Overview', icon: 'chart', href: '/admin' }] },
  {
    label: 'Sales',
    sections: [
      { label: 'Orders', icon: 'orders', href: '/admin/orders' },
      { label: 'Pre-orders', icon: 'clock', href: '/admin/pre-orders' },
      {
        label: 'Payments & refunds',
        icon: 'coin',
        href: '/admin/payments',
        matches: ['Payments', 'Refunds'],
      },
      { label: 'Returns', icon: 'returns', href: '/admin/returns' },
    ],
  },
  {
    label: 'Catalog',
    sections: [
      { label: 'Products', icon: 'grid', href: '/admin/catalog/products', matches: ['Catalog'] },
      {
        label: 'Categories & brands',
        icon: 'sliders',
        href: '/admin/catalog/categories',
        matches: ['Categories'],
      },
      {
        label: 'Pricing & promotions',
        icon: 'coin',
        href: '/admin/catalog/products/all/discount',
        matches: ['Pricing'],
      },
      { label: 'Reviews', icon: 'reviews', href: '/admin/reviews' },
    ],
  },
  {
    label: 'Operations',
    sections: [
      { label: 'Inventory', icon: 'package', href: '/admin/inventory' },
      { label: 'Bundles', icon: 'package', href: '/admin/bundles' },
    ],
  },
  {
    label: 'Customers',
    sections: [
      { label: 'Customers', icon: 'user', href: '/admin/customers' },
      { label: 'Notifications', icon: 'bell', href: '/admin/notifications' },
    ],
  },
  {
    label: 'System',
    sections: [
      { label: 'Settings', icon: 'settings', href: '/admin/users', matches: ['Users & roles'] },
      { label: 'Audit log', icon: 'document', href: '/admin/audit' },
      { label: 'System states', icon: 'info', href: '/admin/states' },
    ],
  },
];

/** Arabic sidebar labels from the Admin Orders RTL board (* = polish pass). */
const AR: Record<string, string> = {
  Overview: 'نظرة عامة',
  Sales: 'المبيعات',
  Orders: 'الطلبات',
  'Pre-orders': 'الطلبات المسبقة',
  'Payments & refunds': 'المدفوعات والمبالغ المستردة',
  Returns: 'المرتجعات',
  Catalog: 'الكتالوج',
  Products: 'المنتجات',
  'Categories & brands': 'الفئات والعلامات التجارية',
  'Pricing & promotions': 'الأسعار والعروض',
  Reviews: 'التقييمات',
  Operations: 'العمليات',
  Inventory: 'المخزون',
  Bundles: 'الأطقم',
  Customers: 'العملاء',
  Notifications: 'الإشعارات',
  System: 'النظام',
  Settings: 'الإعدادات',
  'Audit log': 'سجل التدقيق',
  'System states': 'حالات النظام', // *
};

export function AdminSidebar({
  activeLabel = 'Overview',
  lang = 'en',
}: {
  activeLabel?: string;
  lang?: 'en' | 'ar';
}) {
  const t = (label: string) => (lang === 'ar' ? (AR[label] ?? label) : label);
  return (
    <nav aria-label="Admin sections" className={styles.adminNav}>
      {GROUPS.map((group) => (
        <div key={group.label ?? 'top'} className={styles.adminNav}>
          {group.label ? <span className={styles.navGroupLabel}>{t(group.label)}</span> : null}
          {group.sections.map((section) => {
            const active =
              section.label === activeLabel || (section.matches ?? []).includes(activeLabel);
            return (
              <Link
                key={section.label}
                href={section.href}
                className={`${styles.adminSection} ${active ? styles.adminSectionActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.adminSectionIcon} aria-hidden="true">
                  <Icon name={section.icon} size={17} strokeWidth={1.8} />
                </span>
                <span className={styles.adminSectionLabel}>{t(section.label)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
