'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api/browser';
import type { ApiCustomerAddress, ApiCustomerProfile } from '../../lib/api/catalog-types';
import Link from 'next/link';
import { governorates } from '../../data/account-sample';
import { formatMoney } from '../../data/money';
import type { ApiOrder, ApiOrderList } from '../../lib/api/commerce-types';
import { orderItemCount, orderReference, placedDate } from '../../lib/commerce-mapper';
import { useProductsById } from '../../lib/use-products-by-id';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import { StorefrontImage } from '../ui/StorefrontImage';

/**
 * The account-overview pieces that read real data (F06): the greeting
 * (profile display name), the default-address card, the latest order and the
 * pre-order count. They stay neutral while loading and when a request fails — no sample
 * name or address is shown in their place.
 */

export function AccountGreeting() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .get<ApiCustomerProfile>('customers/me/profile')
      .then((profile) => {
        if (live) setName(profile.displayName?.trim().split(/\s+/)[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <span className="hw-wide">{name ? `Welcome back, ${name}` : 'Welcome back'}</span>
      <span className="hw-narrow">{name ? `Hello, ${name}` : 'Hello'}</span>
    </>
  );
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; address: ApiCustomerAddress | null };

const governorateName = (value: string | null): string =>
  value === null ? '' : (governorates.find((g) => g.en === value || g.ar === value)?.en ?? value);

export function DefaultAddressBody() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    api
      .get<{ addresses: ApiCustomerAddress[] }>('customers/me/addresses')
      .then((result) => {
        if (live) {
          setState({ status: 'ready', address: result.addresses.find((a) => a.isDefault) ?? null });
        }
      })
      .catch(() => {
        if (live) setState({ status: 'error' });
      });
    return () => {
      live = false;
    };
  }, []);

  const muted = { color: 'var(--hw-text-secondary)' } as const;

  if (state.status === 'loading') {
    return (
      <p role="status" style={{ margin: 0, fontSize: 15, ...muted }}>
        Loading your address…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" style={{ margin: 0, fontSize: 15, lineHeight: 1.5, ...muted }}>
        We couldn’t load your addresses right now.
      </p>
    );
  }
  const { address } = state;
  if (address === null) {
    return (
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, ...muted }}>
        You haven’t saved an address yet. Adding one makes checkout quicker.
      </p>
    );
  }
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 15, lineHeight: 1.5 }}
    >
      <strong style={{ fontWeight: 600 }}>{address.recipientName}</strong>
      <span style={muted}>
        {address.line2 ? `${address.line1}, ${address.line2}` : address.line1}
      </span>
      <span style={muted}>
        {[address.city, governorateName(address.region)].filter(Boolean).join(', ')}
        {address.postalCode ? ` ${address.postalCode}` : ''}
      </span>
      <span style={muted}>{address.countryCode === 'EG' ? 'Egypt' : address.countryCode}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Latest order and pre-orders (F06 Batch 3: GET /orders, /orders/pre-orders)
 * ------------------------------------------------------------------ */

type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: T };

function useLoaded<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    load()
      .then((value) => {
        if (live) setState({ status: 'ready', value });
      })
      .catch(() => {
        if (live) setState({ status: 'error' });
      });
    return () => {
      live = false;
    };
    // `load` is a stable module-level reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

const readLatestOrder = () =>
  api.get<ApiOrderList>('orders').then((list) => list.orders[0] ?? null);
const readPreOrders = () =>
  api
    .get<{ preOrders: { status: string; totalMinor: number }[] }>('orders/pre-orders')
    .then((list) => list.preOrders);

export function LatestOrderBody({ styles }: { styles: Record<string, string> }) {
  const state = useLoaded<ApiOrder | null>(readLatestOrder);
  const products = useProductsById(
    state.status === 'ready' && state.value !== null
      ? state.value.lines.map((line) => line.productId)
      : [],
  );
  const muted = {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.5,
    color: 'var(--hw-text-secondary)',
  } as const;
  if (state.status === 'loading')
    return (
      <p role="status" style={muted}>
        Loading your orders…
      </p>
    );
  if (state.status === 'error')
    return (
      <p role="alert" style={muted}>
        We couldn’t load your orders right now.
      </p>
    );
  const order = state.value;
  if (order === null) {
    return (
      <>
        <p style={muted}>You haven’t placed an order yet.</p>
        <div className={styles.cardActionsRow} style={{ marginTop: 'auto', paddingTop: 4 }}>
          <Link href="/products" className={styles.btnOutline}>
            Start shopping
          </Link>
        </div>
      </>
    );
  }
  const count = orderItemCount(order);
  const names = order.lines.map((line) => line.productName).join(', ');
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <OrderStatusBadge kind="order" status={order.status} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--hw-font-display)',
            fontSize: 26,
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {orderReference(order)}
        </span>
        <span style={{ fontSize: 14, color: 'var(--hw-text-secondary)' }}>
          {placedDate(order.createdAt)} — {count} {count === 1 ? 'item' : 'items'} ·{' '}
          {formatMoney({ amountMinor: order.totalMinor, currency: 'EGP' })}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={styles.thumbRow}>
          {order.lines.slice(0, 3).map((line) => {
            const product = products.get(line.productId);
            return product !== undefined ? (
              <span key={line.id} className={styles.thumb}>
                <StorefrontImage image={product.image} alt="" fill sizes="56px" />
              </span>
            ) : null;
          })}
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--hw-text-secondary)' }}>
          {names}
        </span>
      </div>
      <div className={styles.cardActionsRow} style={{ marginTop: 'auto', paddingTop: 4 }}>
        <Link href={`/account/orders/${order.id}`} className={styles.btnOutline}>
          View order
        </Link>
        <Link href="/account/orders" className={styles.inlineLink}>
          All orders
        </Link>
      </div>
    </>
  );
}

export function PreOrdersBody({ styles }: { styles: Record<string, string> }) {
  const state = useLoaded(readPreOrders);
  const muted = {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.5,
    color: 'var(--hw-text-secondary)',
  } as const;
  const body =
    state.status === 'loading' ? (
      <p role="status" style={muted}>
        Loading your pre-orders…
      </p>
    ) : state.status === 'error' ? (
      <p role="alert" style={muted}>
        We couldn’t load your pre-orders right now.
      </p>
    ) : (
      <p style={muted}>
        {(() => {
          const open = state.value.filter(
            (p) => !['CONVERTED', 'CANCELLED', 'EXPIRED'].includes(p.status),
          ).length;
          return open === 0
            ? 'You have no open pre-orders. Nothing is charged for a pre-order.'
            : `${open} open ${open === 1 ? 'pre-order' : 'pre-orders'}. Nothing is charged until stock is reserved and you pay.`;
        })()}
      </p>
    );
  return (
    <>
      {body}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <Link href="/account/pre-orders" className={styles.btnOutline}>
          View pre-orders
        </Link>
      </div>
    </>
  );
}

const readNotifications = () =>
  api
    .get<{ notifications: { subject: string; createdAt: string }[] }>('notifications')
    .then((list) => list.notifications);

/** Messages the store recorded for the customer (GET /notifications; it has no read/unread state). */
export function NotificationsBody({ styles }: { styles: Record<string, string> }) {
  const state = useLoaded(readNotifications);
  const muted = {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.5,
    color: 'var(--hw-text-secondary)',
  } as const;
  if (state.status === 'loading')
    return (
      <p role="status" style={muted}>
        Loading your messages…
      </p>
    );
  if (state.status === 'error')
    return (
      <p role="alert" style={muted}>
        We couldn’t load your messages right now.
      </p>
    );
  const latest = state.value[0];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontFamily: 'var(--hw-font-display)',
            fontSize: 44,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {state.value.length}
        </span>
        <span style={{ fontSize: 15, color: 'var(--hw-text-secondary)' }}>
          {state.value.length === 1 ? 'message' : 'messages'}
        </span>
      </div>
      {latest !== undefined ? (
        <div className={styles.noticeBubble}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{latest.subject}</span>
          <span style={{ fontSize: 13, color: 'var(--hw-text-muted)' }}>
            {placedDate(latest.createdAt)}
          </span>
        </div>
      ) : (
        <p style={muted}>No messages yet.</p>
      )}
    </>
  );
}
