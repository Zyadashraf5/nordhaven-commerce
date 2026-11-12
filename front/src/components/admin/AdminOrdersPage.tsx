'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/ui/Icon';
import { api } from '../../lib/api/browser';
import type {
  AdminOrder,
  AdminPaymentAttempt,
  AdminPreOrder,
  AdminShipment,
} from '../../lib/api/admin-types';
import { AdminLoad, adminDate, shortId, useAdminLoader, useAdminResource } from './admin-data';
import { loadOrderOwners } from './admin-customers';
import { formatMoney } from '../../data/money';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin orders list (Stage 5 admin boards), live (F06): `GET /admin/orders`
 * with each order's latest payment attempt (`GET /admin/payments`), shipment
 * (`GET /admin/shipments`) and owner (via `/admin/customers`). The admin
 * order surface is read-only by contract: orders change through the
 * customer, payments and shipments, never directly here.
 */

const ORDER_TAB_KEYS = [
  'all',
  'FULFILLED',
  'PAID',
  'PAID_PENDING_ALLOCATION',
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
  'preorders',
] as const;

/* Page copy; Arabic from the Admin Orders RTL board (* = polish pass). */
const COPY = {
  en: {
    tabs: {
      all: 'All orders',
      FULFILLED: 'Fulfilled',
      PAID: 'Paid',
      PAID_PENDING_ALLOCATION: 'Pending allocation',
      PENDING_PAYMENT: 'Pending payment',
      PAYMENT_FAILED: 'Payment failed',
      CANCELLED: 'Cancelled',
      EXPIRED: 'Expired',
      REFUNDED: 'Refunded',
      preorders: 'Pre-orders',
    } as Record<string, string>,
    title: 'Orders',
    intro:
      'Orders by state with search. The order record is read-only here: it changes through customer cancellation, payment events and shipments.',
    tabsLabel: 'Filter orders by state',
    filter: 'Filter by status',
    search: 'Search by order number or customer',
    placeholder: 'e.g. HC-3C32F6DB or an email',
    emptyTitle: 'No orders found',
    emptyBody: 'Try adjusting your search or filter.',
    clear: 'Clear filters',
    selected: (n: number) => `${n} selected`,
    actions: 'No bulk order actions exist in the API',
    noneTitle: 'No orders yet',
    noneBody: 'Orders appear here as customers place them.',
    noAttempt: 'No payment started',
    testPayment: 'Test payment',
    preNone: 'No pre-orders',
    selectAll: 'Select all orders',
    selectOne: (no: string) => `Select order ${no}`,
    cols: ['Order', 'Date', 'Customer', 'Items', 'Total', 'Payment', 'Status'],
    shown: (n: number) => `${n} shown`,
    preTitle: 'Pre-orders',
    preIntro:
      'Pre-orders awaiting stock or payment. The contract reports each pre-order’s state and recorded total. No pre-order is charged before its stock is available and reserved.',
    preCols: ['Pre-order', 'Placed', 'Total', 'Status', 'Order'],
  },
  ar: {
    tabs: {
      all: 'الكل',
      FULFILLED: 'تم التنفيذ', // *
      PAID: 'مدفوع',
      PAID_PENDING_ALLOCATION: 'بانتظار التخصيص', // *
      PENDING_PAYMENT: 'بانتظار الدفع',
      PAYMENT_FAILED: 'فشل الدفع',
      CANCELLED: 'ملغاة',
      EXPIRED: 'انتهت المهلة',
      REFUNDED: 'مسترد', // *
      preorders: 'طلبات مسبقة',
    } as Record<string, string>,
    title: 'الطلبات',
    intro: 'معالجة الطلبات وتتبعها. سجل الطلب للعرض فقط هنا — يتغير عبر العميل والدفع والشحن.', // second sentence *
    tabsLabel: 'تصفية الطلبات حسب الحالة', // *
    filter: 'تصفية حسب الحالة', // *
    search: 'ابحث برقم الطلب أو اسم العميل',
    placeholder: 'مثال: HC-3C32F6DB', // *
    emptyTitle: 'لا توجد طلبات', // *
    emptyBody: 'جرّب تعديل البحث أو التصفية.', // *
    clear: 'مسح التصفية', // *
    selected: (n: number) => `تم تحديد ${n}`,
    actions: 'لا توجد إجراءات جماعية للطلبات', // *
    noneTitle: 'لا توجد طلبات بعد', // *
    noneBody: 'تظهر الطلبات هنا عندما يقدّمها العملاء.', // *
    noAttempt: 'لم يبدأ الدفع', // *
    testPayment: 'دفع تجريبي', // *
    preNone: 'لا توجد طلبات مسبقة', // *
    selectAll: 'تحديد كل الطلبات', // *
    selectOne: (no: string) => `تحديد الطلب ${no}`, // *
    cols: ['الطلب', 'التاريخ', 'العميل', 'المنتجات', 'الإجمالي', 'الدفع', 'الحالة'],
    shown: (n: number) => `عرض ${n}`, // *
    preTitle: 'طلبات مسبقة',
    preIntro: 'طلبات مسبقة بانتظار المخزون أو الدفع. لا يُخصم أي مبلغ قبل توفر المخزون وحجزه.', // *
    preCols: ['الطلب المسبق', 'التاريخ', 'الإجمالي', 'الحالة', 'الطلب'], // partly *
  },
};

const ORDER_TABS = ORDER_TAB_KEYS.map((key) => ({ key }));

interface OrdersData {
  orders: AdminOrder[];
  owners: Map<string, { customerId: string; email: string | null }>;
  payments: Map<string, AdminPaymentAttempt>;
  shipments: Map<string, AdminShipment>;
}

async function loadOrders(): Promise<OrdersData> {
  const [orders, owners, payments, shipments] = await Promise.all([
    api.get<{ orders: AdminOrder[] }>('admin/orders'),
    loadOrderOwners(),
    api.get<{ attempts: AdminPaymentAttempt[] }>('admin/payments'),
    api.get<{ shipments: AdminShipment[] }>('admin/shipments'),
  ]);
  // Newest attempt per order (the list is newest first).
  const latest = new Map<string, AdminPaymentAttempt>();
  for (const attempt of payments.attempts)
    if (!latest.has(attempt.orderId)) latest.set(attempt.orderId, attempt);
  return {
    orders: orders.orders,
    owners,
    payments: latest,
    shipments: new Map(shipments.shipments.map((s) => [s.orderId, s])),
  };
}

export function AdminOrdersPage({ lang = 'en' }: { lang?: 'en' | 'ar' }) {
  const t = COPY[lang];
  const [tab, setTab] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { state, reload } = useAdminLoader(loadOrders, []);

  const inOrdersView = tab !== 'preorders';
  const data = state.status === 'ready' ? state.data : null;

  const visible = useMemo(
    () =>
      (data?.orders ?? []).filter((order) => {
        const matchesTab = tab === 'all' || order.status === tab;
        const q = query.trim().toLowerCase();
        const owner = data?.owners.get(order.id)?.email ?? '';
        const matchesQuery =
          q === '' ||
          shortId(order.id, 'HC-').toLowerCase().includes(q) ||
          owner.toLowerCase().includes(q);
        return matchesTab && matchesQuery;
      }),
    [data, tab, query],
  );

  const selectedVisible = visible.filter((order) => selectedIds.has(order.id));
  const allVisibleSelected =
    visible.length > 0 && visible.every((order) => selectedIds.has(order.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((order) => next.delete(order.id));
      else visible.forEach((order) => next.add(order.id));
      return next;
    });
  };

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>{t.title}</h1>
        <p className={styles.sectionIntro}>{t.intro}</p>

        <div role="tablist" aria-label={t.tabsLabel} className={styles.tabs}>
          {ORDER_TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              type="button"
              role="tab"
              aria-selected={tab === tabItem.key}
              className={`${styles.adminTab} ${tab === tabItem.key ? styles.adminTabActive : ''}`}
              onClick={() => setTab(tabItem.key)}
            >
              {t.tabs[tabItem.key]}
            </button>
          ))}
        </div>

        {inOrdersView ? (
          <AdminLoad state={state} onRetry={() => void reload()} what="orders">
            {(loaded) => (
              <>
                <div className={styles.filterBar}>
                  <div className={styles.filterChip}>
                    <label className={styles.fieldLabel} htmlFor="order-status-filter">
                      {t.filter}
                    </label>
                    <select
                      id="order-status-filter"
                      className={styles.textField}
                      value={tab}
                      onChange={(event) => setTab(event.target.value)}
                    >
                      {ORDER_TABS.map((tabItem) => (
                        <option key={tabItem.key} value={tabItem.key}>
                          {t.tabs[tabItem.key]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="order-search">
                      {t.search}
                    </label>
                    <input
                      id="order-search"
                      type="text"
                      className={styles.textField}
                      placeholder={t.placeholder}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </div>

                {visible.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span className={styles.emptyIcon}>
                      <Icon name="bag" size={24} strokeWidth={1.6} aria-hidden="true" />
                    </span>
                    <h2 className={styles.emptyTitle}>
                      {loaded.orders.length === 0 ? t.noneTitle : t.emptyTitle}
                    </h2>
                    <p className={styles.emptyBody}>
                      {loaded.orders.length === 0 ? t.noneBody : t.emptyBody}
                    </p>
                    {loaded.orders.length > 0 ? (
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={() => {
                          setQuery('');
                          setTab('all');
                        }}
                      >
                        {t.clear}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {selectedVisible.length > 0 ? (
                      <div className={styles.bulkBar} role="status">
                        <span>{t.selected(selectedVisible.length)}</span>
                        <button
                          type="button"
                          className={styles.btnOutline}
                          disabled={true}
                          title={t.actions}
                        >
                          {t.actions}
                        </button>
                      </div>
                    ) : null}
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.tableCell}>
                              <input
                                type="checkbox"
                                aria-label={t.selectAll}
                                checked={allVisibleSelected}
                                onChange={toggleAllVisible}
                              />
                            </th>
                            {t.cols.map((col) => (
                              <th key={col} className={styles.tableCell}>
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody data-rows>
                          {visible.map((order) => {
                            const isSelected = selectedIds.has(order.id);
                            const number = shortId(order.id, 'HC-');
                            const owner = loaded.owners.get(order.id);
                            const payment = loaded.payments.get(order.id);
                            const shipment = loaded.shipments.get(order.id);
                            const items = order.lines.reduce((sum, line) => sum + line.quantity, 0);
                            return (
                              <tr
                                key={order.id}
                                className={styles.tableRow}
                                style={
                                  isSelected ? { backgroundColor: 'var(--hw-bg-well)' } : undefined
                                }
                              >
                                <td className={styles.tableCell}>
                                  <input
                                    type="checkbox"
                                    aria-label={t.selectOne(number)}
                                    checked={isSelected}
                                    onChange={() => toggleSelect(order.id)}
                                  />
                                </td>
                                <td className={styles.tableCell}>
                                  <Link href={`/admin/orders/${order.id}`}>{number}</Link>
                                </td>
                                <td className={styles.tableCell}>
                                  <bdi className={styles.numerals}>
                                    {adminDate(order.createdAt)}
                                  </bdi>
                                </td>
                                <td className={styles.tableCell}>
                                  <span style={{ fontSize: 13 }}>{owner?.email ?? '—'}</span>
                                </td>
                                <td className={styles.tableCell}>
                                  <span className={styles.numerals}>{items}</span>
                                </td>
                                <td className={styles.tableCell} style={{ fontWeight: 600 }}>
                                  <span className={styles.numerals}>
                                    {formatMoney({
                                      amountMinor: order.totalMinor,
                                      currency: 'EGP',
                                    })}
                                  </span>
                                </td>
                                <td className={styles.tableCell}>
                                  {payment === undefined ? (
                                    <span
                                      style={{ fontSize: 13, color: 'var(--hw-text-secondary)' }}
                                    >
                                      {t.noAttempt}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 13 }}>
                                      {payment.provider === 'LOCAL_TEST'
                                        ? t.testPayment
                                        : payment.provider}{' '}
                                      · {payment.status.toLowerCase()}
                                    </span>
                                  )}
                                </td>
                                <td className={styles.tableCell}>
                                  <OrderStatusBadge
                                    kind="order"
                                    status={order.status}
                                    lang={lang}
                                  />
                                  {shipment !== undefined ? (
                                    <div style={{ marginTop: 4 }}>
                                      <OrderStatusBadge
                                        kind="shipment"
                                        status={shipment.status}
                                        lang={lang}
                                      />
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--hw-text-secondary)', margin: 0 }}>
                      <span className={styles.numerals}>{t.shown(visible.length)}</span>
                    </p>
                  </>
                )}
              </>
            )}
          </AdminLoad>
        ) : (
          <section className={styles.section}>
            <h2 className={styles.subsectionTitle}>{t.preTitle}</h2>
            <p className={styles.sectionIntro}>{t.preIntro}</p>
            <PreOrderTable lang={lang} />
          </section>
        )}
      </section>
    </div>
  );
}

/** Admin pre-orders (`GET /admin/orders/pre-orders`): the contract reports state and total, not items or customer. */
export function PreOrderTable({ lang = 'en' }: { lang?: 'en' | 'ar' }) {
  const t = COPY[lang];
  const { state, reload } = useAdminResource<{ preOrders: AdminPreOrder[] }>(
    'admin/orders/pre-orders',
  );
  return (
    <AdminLoad state={state} onRetry={() => void reload()} what="pre-orders">
      {({ preOrders }) =>
        preOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <Icon name="clock" size={24} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h3 className={styles.emptyTitle}>{t.preNone}</h3>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {t.preCols.map((col) => (
                    <th key={col} className={styles.tableCell}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody data-rows>
                {preOrders.map((pre) => (
                  <tr key={pre.id} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      <span className={styles.numerals}>{shortId(pre.id, 'PO-')}</span>
                    </td>
                    <td className={styles.tableCell}>
                      <bdi className={styles.numerals}>{adminDate(pre.createdAt)}</bdi>
                    </td>
                    <td className={styles.tableCell}>
                      <span className={styles.numerals}>
                        {formatMoney({ amountMinor: pre.totalMinor, currency: 'EGP' })}
                      </span>
                    </td>
                    <td className={styles.tableCell}>
                      <OrderStatusBadge kind="pre-order" status={pre.status} lang={lang} />
                    </td>
                    <td className={styles.tableCell}>
                      {pre.orderId !== null ? (
                        <Link href={`/admin/orders/${pre.orderId}`}>
                          {shortId(pre.orderId, 'HC-')}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </AdminLoad>
  );
}
