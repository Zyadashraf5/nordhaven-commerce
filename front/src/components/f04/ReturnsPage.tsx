'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/ui/Icon';
import { formatMoney } from '../../data/money';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiOrder, ApiOrderList } from '../../lib/api/commerce-types';
import { orderReference, placedDate } from '../../lib/commerce-mapper';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import styles from '../f04/f04.module.css';

export interface ApiReturn {
  id: string;
  orderId: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED' | 'CANCELLED';
  reasonCode: string;
  totalMinor: number;
  currency: string;
  lines: { id: string; orderLineId: string; quantity: number; restocked: boolean }[];
  refundId: string | null;
  refundStatus: string | null;
  createdAt: string;
  decidedAt: string | null;
  receivedAt: string | null;
}

const REASONS = [
  { code: 'DAMAGED', label: 'Arrived damaged' },
  { code: 'WRONG_ITEM', label: 'Wrong item sent' },
  { code: 'NOT_AS_DESCRIBED', label: 'Not as described' },
  { code: 'CHANGED_MIND', label: 'Changed my mind' },
];

/**
 * Returns (`/account/returns`, Stage 4 returns & refunds boards), live (F06):
 * `GET /returns`, a request against a paid order (`POST /returns`: the order
 * lines and quantities; the backend computes the amount and refuses more units
 * than the order holds), and cancelling a request that hasn't been received
 * (`DELETE /returns/{id}`). Nothing is refunded and no stock moves until the
 * store receives the items. Refund states are shown exactly as reported —
 * PENDING or FAILED is never shown as refunded.
 */
export function ReturnsPage() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; returns: ApiReturn[]; paid: ApiOrder[] }
  >({ status: 'loading' });
  const [startOpen, setStartOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [returns, orders] = await Promise.all([
        api.get<{ returns: ApiReturn[] }>('returns'),
        api.get<ApiOrderList>('orders'),
      ]);
      setState({
        status: 'ready',
        returns: returns.returns,
        paid: orders.orders.filter(
          (o) =>
            o.status === 'PAID' ||
            o.status === 'PAID_PENDING_ALLOCATION' ||
            o.status === 'FULFILLED',
        ),
      });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error, 'Please try again.') });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.headTitles}>
          <h1 className={styles.headline} data-intro data-split="words">
            Returns
          </h1>
          <p className={styles.subtitle}>
            Request a return for a paid order and follow it until any refund is made.
          </p>
        </div>
        <Link href="/account" className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Back to my account
        </Link>
      </div>

      {state.status === 'loading' ? (
        <p className={styles.fieldHelp} role="status">
          Loading your returns…
        </p>
      ) : state.status === 'error' ? (
        <div className={styles.errorState} role="alert">
          <Icon name="alert" size={36} strokeWidth={1.4} stroke="#a1362b" aria-hidden="true" />
          <h2 className={styles.errorTitle}>We couldn’t load your returns</h2>
          <p className={styles.errorBody}>{state.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.actions}>
            {state.paid.length > 0 ? (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setStartOpen((open) => !open)}
              >
                {startOpen ? 'Close' : 'Start a return'}
              </button>
            ) : (
              <p className={styles.fieldHelp}>
                Returns can be requested for paid orders. You have no paid orders yet.
              </p>
            )}
          </div>
          {startOpen ? (
            <StartReturn
              orders={state.paid}
              onDone={() => {
                setStartOpen(false);
                void load();
              }}
            />
          ) : null}
          {state.returns.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>
                <Icon name="returns" size={24} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <h2 className={styles.emptyTitle}>No returns</h2>
              <p className={styles.emptyBody}>
                Return requests you make appear here with their progress.
              </p>
            </div>
          ) : (
            <ul className={styles.list} data-reveal-stagger>
              {state.returns.map((r) => (
                <li key={r.id} className={styles.cardRow}>
                  <div className={styles.cardBody}>
                    <span className={styles.cardLabel}>
                      Return for order {orderReference({ id: r.orderId })}
                    </span>
                    <span className={styles.cardLines}>
                      {REASONS.find((x) => x.code === r.reasonCode)?.label ?? r.reasonCode} ·{' '}
                      {placedDate(r.createdAt)}
                    </span>
                    <span className="numerals">
                      {formatMoney({ amountMinor: r.totalMinor, currency: 'EGP' })}
                    </span>
                    {r.refundStatus !== null ? (
                      <span className={styles.fieldHelp}>
                        Refund {r.refundStatus.toLowerCase()}
                      </span>
                    ) : null}
                  </div>
                  <OrderStatusBadge kind="return" status={r.status} />
                  <Link href={`/account/returns/${r.id}`} className={styles.btnOutline}>
                    View return
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function StartReturn({ orders, onDone }: { orders: ApiOrder[]; onDone: () => void }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const order = orders.find((o) => o.id === orderId);

  const submit = async () => {
    const lines = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderLineId, quantity]) => ({ orderLineId, quantity }));
    if (lines.length === 0) return setError('Select at least one item to return.');
    if (reason === '') return setError('Choose a reason.');
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.post('returns', { orderId, lines, reasonCode: reason });
      onDone();
    } catch (failure) {
      setError(errorMessage(failure, 'We couldn’t request the return. Nothing was changed.'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Start a return</h2>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ret-order">
          Order
        </label>
        <select
          id="ret-order"
          className={styles.textField}
          value={orderId}
          onChange={(e) => {
            setOrderId(e.target.value);
            setQuantities({});
          }}
        >
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {orderReference(o)} · {placedDate(o.createdAt)}
            </option>
          ))}
        </select>
      </div>
      {order?.lines.map((line) => (
        <div key={line.id} className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`ret-${line.id}`}>
            {line.productName} · SKU {line.sku} (ordered {line.quantity})
          </label>
          <select
            id={`ret-${line.id}`}
            className={styles.textField}
            value={quantities[line.id] ?? 0}
            onChange={(e) => setQuantities({ ...quantities, [line.id]: Number(e.target.value) })}
          >
            {Array.from({ length: line.quantity + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Don’t return' : `Return ${n}`}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="ret-reason">
          Reason
        </label>
        <select
          id="ret-reason"
          className={styles.textField}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Choose a reason</option>
          {REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {error !== null ? (
        <p className={styles.fieldHelp} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.fieldHelp}>
        The store checks the request and works out the amount. Nothing is refunded until the items
        are received.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? 'Sending…' : 'Request return'}
        </button>
      </div>
    </section>
  );
}
