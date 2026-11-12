'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/ui/Icon';
import { formatMoney } from '../../data/money';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiOrder } from '../../lib/api/commerce-types';
import { orderReference, placedDate } from '../../lib/commerce-mapper';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import styles from '../f04/f04.module.css';

interface ApiPreOrder {
  id: string;
  status:
    | 'AWAITING_STOCK'
    | 'STOCK_RESERVED'
    | 'AWAITING_PAYMENT'
    | 'CONVERTED'
    | 'CANCELLED'
    | 'EXPIRED';
  statusReason: string | null;
  currency: string;
  totalMinor: number;
  orderId: string | null;
  reservationId: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

const CLOSED: ApiPreOrder['status'][] = ['CONVERTED', 'CANCELLED', 'EXPIRED'];

/**
 * Pre-orders list (boards: Pre-orders desktop / mobile) on the customer's real
 * pre-orders (F06: `GET /orders/pre-orders`). The contract reports each
 * pre-order's state and recorded total, not its items, so that is what is
 * shown. Nothing is charged for a pre-order; once stock is reserved it can be
 * turned into a payable order (`POST …/convert`), and an open one can be
 * cancelled (`DELETE`).
 */
export function PreOrdersPage() {
  const router = useRouter();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; preOrders: ApiPreOrder[] }
  >({ status: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { preOrders } = await api.get<{ preOrders: ApiPreOrder[] }>('orders/pre-orders');
      setState({ status: 'ready', preOrders });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error, 'Please try again.') });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (id: string) => {
    setBusy(id);
    setActionError(null);
    try {
      await api.delete(`orders/pre-orders/${id}`);
      setCancelOpen(null);
      await load();
    } catch (error) {
      setCancelOpen(null);
      setActionError(errorMessage(error, 'We couldn’t cancel that pre-order. It’s unchanged.'));
    } finally {
      setBusy(null);
    }
  };

  const convert = async (id: string) => {
    setBusy(id);
    setActionError(null);
    try {
      const order = await api.post<ApiOrder>(`orders/pre-orders/${id}/convert`, {
        expectedFingerprint: null,
      });
      router.push(`/account/orders/${order.id}`);
    } catch (error) {
      setActionError(
        errorMessage(error, 'We couldn’t turn that pre-order into an order. Nothing was charged.'),
      );
      setBusy(null);
    }
  };

  const preOrders = state.status === 'ready' ? state.preOrders : [];
  const current = preOrders.filter((p) => !CLOSED.includes(p.status));
  const past = preOrders.filter((p) => CLOSED.includes(p.status));
  const reference = (p: ApiPreOrder) => `PO-${orderReference(p).slice(3)}`;

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.headTitles}>
          <h1 className={styles.headline} data-intro data-split="words">
            Pre-orders
          </h1>
          <p className={styles.subtitle}>
            Items you’ve reserved while they’re out of stock. Nothing is charged until stock is
            reserved and you pay.
          </p>
        </div>
        <Link href="/account" className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Back to my account
        </Link>
      </div>

      {actionError !== null ? (
        <div className={styles.demoAlert} role="alert">
          <Icon name="alert" size={16} strokeWidth={1.8} stroke="#a1362b" aria-hidden="true" />
          <div>{actionError}</div>
        </div>
      ) : null}

      {state.status === 'loading' ? (
        <p className={styles.fieldHelp} role="status">
          Loading your pre-orders…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className={styles.errorState} role="alert">
          <Icon name="alert" size={36} strokeWidth={1.4} stroke="#a1362b" aria-hidden="true" />
          <h2 className={styles.errorTitle}>We couldn’t load your pre-orders</h2>
          <p className={styles.errorBody}>{state.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {state.status === 'ready' && preOrders.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <Icon name="clock" size={24} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <h2 className={styles.emptyTitle}>You have no pre-orders</h2>
          <p className={styles.emptyBody}>
            When an item you want is out of stock and offers pre-order, it shows up here.
          </p>
          <div className={styles.actions}>
            <Link href="/products" className={styles.btnPrimary}>
              Browse products
            </Link>
          </div>
        </div>
      ) : null}

      {current.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>
            Current pre-orders <span className={styles.tabCount}>{current.length}</span>
          </h2>
          <ul className={styles.list} data-reveal-stagger>
            {current.map((pre) => (
              <li key={pre.id} className={styles.cardRow}>
                <div className={styles.cardBody}>
                  <span className="numerals">Pre-order {reference(pre)}</span>
                  <span className={styles.fieldHelp}>{placedDate(pre.createdAt)}</span>
                  <span className="numerals">
                    {formatMoney({ amountMinor: pre.totalMinor, currency: 'EGP' })}
                  </span>
                </div>
                <OrderStatusBadge kind="pre-order" status={pre.status} />
                <div
                  style={{
                    marginInlineStart: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {pre.status === 'STOCK_RESERVED' ? (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => void convert(pre.id)}
                      disabled={busy !== null}
                    >
                      {busy === pre.id ? 'Creating order…' : 'Continue to payment'}
                    </button>
                  ) : null}
                  {pre.orderId !== null ? (
                    <Link href={`/account/orders/${pre.orderId}`} className={styles.btnOutline}>
                      View order
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={styles.btnOutline}
                    onClick={() => setCancelOpen(pre.id)}
                    disabled={busy !== null}
                  >
                    Cancel pre-order
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {past.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Past pre-orders</h2>
          <ul className={styles.list} data-reveal-stagger>
            {past.map((pre) => (
              <li key={pre.id} className={styles.cardRow}>
                <div className={styles.cardBody}>
                  <span className="numerals">Pre-order {reference(pre)}</span>
                  <span className={styles.fieldHelp}>{placedDate(pre.createdAt)}</span>
                  <span className="numerals">
                    {formatMoney({ amountMinor: pre.totalMinor, currency: 'EGP' })}
                  </span>
                </div>
                <OrderStatusBadge kind="pre-order" status={pre.status} />
                {pre.orderId !== null ? (
                  <Link
                    href={`/account/orders/${pre.orderId}`}
                    className={styles.btnOutline}
                    style={{ marginInlineStart: 'auto' }}
                  >
                    View order
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {cancelOpen !== null ? (
        <div className={styles.overlay}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pre-cancel-title"
            className={styles.dialog}
            style={{ maxWidth: 480 }}
          >
            <div className={styles.confirmBox}>
              <h2 id="pre-cancel-title" className={styles.dialogTitle}>
                Cancel this pre-order?
              </h2>
              <p className={styles.confirmBoxLabel}>
                Nothing has been charged. Any stock held for it is released. This can’t be undone.
              </p>
              <div className={styles.dialogFooter} style={{ paddingTop: 6 }}>
                <button
                  type="button"
                  className={styles.btnOutline}
                  onClick={() => setCancelOpen(null)}
                  disabled={busy !== null}
                >
                  Keep pre-order
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => void cancel(cancelOpen)}
                  disabled={busy !== null}
                >
                  {busy === cancelOpen ? 'Cancelling…' : 'Cancel pre-order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
