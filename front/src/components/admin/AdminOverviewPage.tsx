'use client';

import Link from 'next/link';
import { Icon, type IconName } from '../../components/ui/Icon';
import type { AdminOverview } from '../../lib/api/admin-types';
import { AdminLoad, useAdminResource } from './admin-data';
import { formatMoney } from '../../data/money';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin overview dashboard (Stage 5 admin boards — operational picture).
 * M13 FR-005 / FR-006 / FR-007: orders, shipments, returns, reviews and
 * notifications by state; accounts, collected money, refunded money, pending
 * refund money — live from GET /admin/overview (F06). Read-only.
 */
export function AdminOverviewPage() {
  const { state, reload } = useAdminResource<AdminOverview>('admin/overview');
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Overview</h1>
        <p className={styles.sectionIntro}>
          Read-only view assembled from each capability’s own records (GET /admin/overview). Nothing
          here moves money, stock or an order.
        </p>
        <AdminLoad state={state} onRetry={() => void reload()} what="the overview">
          {(o) => <OverviewBody o={o} />}
        </AdminLoad>
      </section>
    </div>
  );
}

const sum = (rows: { count: number }[]) => rows.reduce((total, row) => total + row.count, 0);

function OverviewBody({ o }: { o: AdminOverview }) {
  const money = (minor: number) => formatMoney({ amountMinor: minor, currency: 'EGP' });
  const cards: Array<{ label: string; value: string; sub: string; icon: IconName }> = [
    { label: 'Orders', value: String(sum(o.orders)), sub: 'across all states', icon: 'orders' },
    { label: 'Shipments', value: String(sum(o.shipments)), sub: 'being tracked', icon: 'truck' },
    { label: 'Returns', value: String(sum(o.returns)), sub: 'requests & refunds', icon: 'returns' },
    {
      label: 'Reviews',
      value: String(sum(o.reviews)),
      sub: 'pending / approved / rejected',
      icon: 'reviews',
    },
    { label: 'Customers', value: String(o.accounts), sub: 'accounts', icon: 'user' },
    { label: 'Collected', value: money(o.collectedMinor), sub: 'succeeded payments', icon: 'coin' },
    { label: 'Refunded', value: money(o.refundedMinor), sub: 'succeeded refunds', icon: 'coin' },
    {
      label: 'Pending refunds',
      value: money(o.pendingRefundMinor),
      sub: 'not yet paid out',
      icon: 'coin',
    },
  ];
  const panel = (title: string, rows: { state: string; count: number }[]) => (
    <StatePanel
      title={title}
      items={rows.map((row) => ({ label: row.state.replace(/_/g, ' '), count: row.count }))}
    />
  );
  return (
    <>
      <div className={styles.statGrid} data-reveal-stagger>
        {cards.map((card) => (
          <Link key={card.label} href={cardHref(card.label)} className={styles.statCard}>
            <div className={styles.statIcon}>
              <Icon name={card.icon} size={18} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className={styles.statBody}>
              <span className={styles.statLabel}>{card.label}</span>
              <span className={styles.statValue}>{card.value}</span>
              <span className={styles.statSub}>{card.sub}</span>
            </div>
          </Link>
        ))}
      </div>
      <div className={styles.stateGrid} data-reveal-stagger>
        {panel('Orders by state', o.orders)}
        {panel('Shipments by state', o.shipments)}
        {panel('Returns by state', o.returns)}
        {panel('Reviews by state', o.reviews)}
        {panel('Notifications by state', o.notifications)}
      </div>
    </>
  );
}

function cardHref(label: string): string {
  switch (label) {
    case 'Orders':
      return '/admin/orders';
    case 'Shipments':
      return '/admin/orders';
    case 'Returns':
      return '/admin/returns';
    case 'Reviews':
      return '/admin/reviews';
    case 'Customers':
      return '/admin/customers';
    case 'Collected':
    case 'Refunded':
    case 'Pending refunds':
      return '/admin/payments';
    default:
      return '/admin';
  }
}

function StatePanel({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
}) {
  const total = items.reduce((a, b) => a + b.count, 0);
  return (
    <section className={styles.statePanel}>
      <h3 className={styles.statePanelTitle}>{title}</h3>
      <div className={styles.statePanelList}>
        {items.length === 0 ? <span className={styles.stateRowLabel}>No records yet</span> : null}
        {items.map((item) => (
          <div
            key={item.label}
            className={styles.stateRow}
            style={{ justifyContent: 'space-between', gap: 12 }}
          >
            <span className={styles.stateRowLabel}>{item.label}</span>
            <span className={styles.stateRowCount}>{item.count}</span>
          </div>
        ))}
        <div
          className={styles.stateRow}
          style={{
            borderTop: `1px solid var(--hw-border-card)`,
            paddingTop: 8,
            marginTop: 6,
            fontWeight: 600,
            color: 'var(--hw-text-primary)',
          }}
        >
          <span className={styles.stateRowLabel}>Total</span>
          <span className={styles.stateRowCount}>{total}</span>
        </div>
      </div>
    </section>
  );
}
