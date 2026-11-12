'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/ui/Icon';
import { StorefrontImage } from '../../components/ui/StorefrontImage';
import { formatMoney } from '../../data/money';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiOrder, ApiOrderList, OrderStatus } from '../../lib/api/commerce-types';
import { orderItemCount, orderReference, placedDate } from '../../lib/commerce-mapper';
import { useProductsById } from '../../lib/use-products-by-id';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import styles from '../f04/f04.module.css';

/**
 * Orders list (boards: Orders desktop / mobile / tablet) on the customer's
 * real orders (F06: `GET /orders`, newest first). Status, totals and lines are
 * the order's own immutable snapshot; pictures come from the public catalogue
 * where the product is still published.
 */
/** The orders boards group the order states into four filters. */
type OrderGroup = 'All' | 'progress' | 'delivered' | 'closed';

const ORDER_GROUPS: Record<Exclude<OrderGroup, 'All'>, readonly OrderStatus[]> = {
  progress: ['PENDING_PAYMENT', 'PAID', 'PAID_PENDING_ALLOCATION'],
  delivered: ['FULFILLED', 'REFUNDED'],
  closed: ['PAYMENT_FAILED', 'CANCELLED', 'EXPIRED'],
};

export function OrdersPage() {
  const [tab, setTab] = useState<OrderGroup>('All');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'loaded'; orders: ApiOrder[] }
  >({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { orders } = await api.get<ApiOrderList>('orders');
      setState({ status: 'loaded', orders });
    } catch (error) {
      setState({
        status: 'error',
        message: errorMessage(error, 'Check your connection and try again.'),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orders = useMemo(() => (state.status === 'loaded' ? state.orders : []), [state]);
  const products = useProductsById(
    orders.flatMap((order) => order.lines.map((line) => line.productId)),
  );

  const tabs: { key: OrderGroup; label: string }[] = [
    { key: 'All', label: 'All' },
    { key: 'progress', label: 'In progress' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'closed', label: 'Cancelled & failed' },
  ];

  const filtered = useMemo(
    () =>
      orders.filter((order) => {
        const matchTab = tab === 'All' || ORDER_GROUPS[tab].includes(order.status);
        const matchQuery =
          query === '' || orderReference(order).toLowerCase().includes(query.trim().toLowerCase());
        return matchTab && matchQuery;
      }),
    [orders, tab, query],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: orders.length };
    (Object.keys(ORDER_GROUPS) as Array<Exclude<OrderGroup, 'All'>>).forEach((group) => {
      map[group] = orders.filter((o) => ORDER_GROUPS[group].includes(o.status)).length;
    });
    return map;
  }, [orders]);

  if (state.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.headRow}>
          <div className={styles.headTitles}>
            <h1 className={styles.headline} data-intro data-split="words">
              Orders
            </h1>
          </div>
          <Link href="/account" className={styles.continueLink}>
            <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
            Back to my account
          </Link>
        </div>
        <div className={styles.errorState} role="alert">
          <Icon name="alert" size={36} strokeWidth={1.4} stroke="#a1362b" aria-hidden="true" />
          <h2 className={styles.errorTitle}>We couldn’t load your orders</h2>
          <p className={styles.errorBody}>Your orders are safe. {state.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
              Try again
            </button>
            <Link href="/" className={styles.btnOutline}>
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const empty = filtered.length === 0;

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.headTitles}>
          <h1 className={styles.headline} data-intro data-split="words">
            Orders
          </h1>
          <p className={styles.subtitle}>
            Check progress and pay for an order that’s waiting for payment.
          </p>
        </div>
        <Link href="/account" className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Back to my account
        </Link>
      </div>

      <div className={styles.pillTabs} role="group" aria-label="Filter orders">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              className={`${styles.pillTab} ${active ? styles.pillTabActive : ''}`}
              onClick={() => setTab(t.key)}
              aria-pressed={active}
            >
              {t.label}
              <span className={styles.pillCount}>{counts[t.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="orders-search">
          Search by order number
        </label>
        <input
          id="orders-search"
          type="search"
          className={styles.textField}
          placeholder="e.g. HC-1A2B3C4D"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {state.status === 'loading' ? (
        <p className={styles.fieldHelp} role="status">
          Loading your orders…
        </p>
      ) : empty ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Icon name="bag" size={24} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <h2 className={styles.emptyTitle}>
            {orders.length === 0 ? 'You haven’t placed any orders yet' : 'No orders match'}
          </h2>
          <p className={styles.emptyBody}>
            {orders.length === 0
              ? 'When you place an order, you’ll be able to follow it here from payment to delivery.'
              : 'Try another filter or order number.'}
          </p>
          <div className={styles.actions}>
            <Link href="/products" className={styles.btnPrimary}>
              Start shopping
            </Link>
            <Link href="/" className={styles.btnOutline}>
              Go home
            </Link>
          </div>
        </div>
      ) : (
        <ul className={styles.list} data-reveal-stagger>
          {filtered.map((order) => {
            const first = order.lines[0];
            const more = order.lines.length - 1;
            const count = orderItemCount(order);
            return (
              <li key={order.id} className={styles.orderCard}>
                <div className={styles.orderCardHead}>
                  <span className={`numerals ${styles.orderCardNo}`}>{orderReference(order)}</span>
                  <span className={styles.orderCardDate}>{placedDate(order.createdAt)}</span>
                  <span className={styles.orderCardBadge}>
                    <OrderStatusBadge kind="order" status={order.status} />
                  </span>
                </div>
                <div className={styles.orderCardBody}>
                  <span className={styles.orderCardThumbs} aria-hidden="true">
                    {order.lines.slice(0, 2).map((line) => {
                      const product = products.get(line.productId);
                      return product !== undefined ? (
                        <StorefrontImage
                          key={line.id}
                          image={product.image}
                          alt=""
                          className={styles.orderCardThumb}
                          sizes="48px"
                        />
                      ) : null;
                    })}
                  </span>
                  <span className={styles.orderCardText}>
                    {first ? (
                      <span className={styles.orderCardName}>
                        {first.productName}
                        {more > 0 ? ` + ${more} more` : ''}
                      </span>
                    ) : null}
                    <span className={styles.orderCardMeta}>
                      {count} {count === 1 ? 'item' : 'items'} ·{' '}
                      <strong className="numerals">
                        {formatMoney({ amountMinor: order.totalMinor, currency: 'EGP' })}
                      </strong>
                    </span>
                  </span>
                  <Link href={`/account/orders/${order.id}`} className={styles.btnOutline}>
                    View order
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
