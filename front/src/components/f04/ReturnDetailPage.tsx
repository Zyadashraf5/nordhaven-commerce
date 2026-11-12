'use client';

import { fire } from '../../lib/fire';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '../../components/ui/Icon';
import { formatMoney } from '../../data/money';
import { api, errorMessage } from '../../lib/api/browser';
import { orderReference, placedDate } from '../../lib/commerce-mapper';
import { OrderStatusBadge } from './OrderStatusBadge';
import type { ApiReturn } from './ReturnsPage';
import styles from './f04.module.css';

interface Transition {
  actor: string;
  eventType: string;
  nextStatus: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * Return detail (`/account/returns/[returnId]`), live (F06): `GET /returns/{id}`
 * and its recorded transitions; a request not yet received can be cancelled
 * (`DELETE /returns/{id}`). The refund state is the backend's.
 */
export function ReturnDetailPage() {
  const { returnId } = useParams();
  const id = typeof returnId === 'string' ? returnId : '';
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'missing' }
    | { status: 'error'; message: string }
    | { status: 'ready'; item: ApiReturn; events: Transition[] }
  >({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [item, events] = await Promise.all([
        api.get<ApiReturn>(`returns/${encodeURIComponent(id)}`),
        api.get<{ events: Transition[] }>(`returns/${encodeURIComponent(id)}/events`),
      ]);
      setState({ status: 'ready', item, events: events.events });
    } catch (error) {
      const status = (error as { status?: number }).status;
      setState(
        status === 404 || status === 400
          ? { status: 'missing' }
          : { status: 'error', message: errorMessage(error, 'Please try again.') },
      );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <div className={styles.headTitles}>
          <h1 className={styles.headline} data-intro data-split="words">
            Return
          </h1>
        </div>
        <Link href="/account/returns" className={styles.continueLink}>
          <Icon name="chevron-left" size={16} strokeWidth={2} aria-hidden="true" />
          Back to returns
        </Link>
      </div>
      {state.status === 'loading' ? (
        <p className={styles.fieldHelp} role="status">
          Loading the return…
        </p>
      ) : state.status === 'missing' ? (
        <p className={styles.fieldHelp} role="alert">
          We couldn’t find that return.
        </p>
      ) : state.status === 'error' ? (
        <p className={styles.fieldHelp} role="alert">
          {state.message}{' '}
          <button type="button" className={styles.btnOutline} onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : (
        <section className={styles.section}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <OrderStatusBadge kind="return" status={state.item.status} />
            <span className="numerals">
              {formatMoney({ amountMinor: state.item.totalMinor, currency: 'EGP' })}
            </span>
          </div>
          <p className={styles.fieldHelp}>
            Order{' '}
            <Link href={`/account/orders/${state.item.orderId}`}>
              {orderReference({ id: state.item.orderId })}
            </Link>{' '}
            · requested {placedDate(state.item.createdAt)} ·{' '}
            {state.item.lines.reduce((sum, l) => sum + l.quantity, 0)} item(s)
          </p>
          <p className={styles.fieldHelp}>
            Refund:{' '}
            {state.item.refundStatus === null
              ? 'none yet — made after the items are received'
              : state.item.refundStatus.toLowerCase()}
          </p>
          <h2 className={styles.sectionTitle}>Progress</h2>
          <ol className={styles.list}>
            {state.events.map((e, index) => (
              <li key={index} className={styles.fieldHelp}>
                {(e.nextStatus ?? e.eventType).replace(/_/g, ' ').toLowerCase()} ·{' '}
                {placedDate(e.createdAt)}
                {e.reason !== null ? ` · ${e.reason}` : ''}
              </li>
            ))}
          </ol>
          {actionError !== null ? (
            <p className={styles.fieldHelp} role="alert">
              {actionError}
            </p>
          ) : null}
          {state.item.status === 'REQUESTED' || state.item.status === 'APPROVED' ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnOutline}
                disabled={busy}
                onClick={fire(async () => {
                  setBusy(true);
                  setActionError(null);
                  try {
                    await api.delete(`returns/${state.item.id}`);
                    await load();
                  } catch (error) {
                    setActionError(errorMessage(error, 'We couldn’t cancel the return.'));
                  } finally {
                    setBusy(false);
                  }
                })}
              >
                {busy ? 'Cancelling…' : 'Cancel this return'}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
