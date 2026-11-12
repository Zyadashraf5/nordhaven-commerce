'use client';

import { fire } from '../../lib/fire';
import { useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '../../data/money';
import { api } from '../../lib/api/browser';
import type {
  AdminPaymentAttempt,
  AdminPaymentEvent,
  AdminReconciliation,
} from '../../lib/api/admin-types';
import {
  AdminEmpty,
  AdminLoad,
  AdminNotice,
  adminDate,
  shortId,
  useAdminAction,
  useAdminResource,
} from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin payments & refunds (Stage 5 admin boards), live (F06):
 * - attempts `GET /admin/payments` (refunds are issued from each order's page);
 * - provider events `GET /admin/payments/events` (every delivered event, applied or not);
 * - reconciliation `GET /admin/payments/reconciliation` — compares the platform with the
 *   provider and records differences; it never moves money, so it runs only on request.
 * The only provider in this build is LOCAL_TEST (non-production).
 */
export function AdminPaymentsPage() {
  const [tab, setTab] = useState<'attempts' | 'events' | 'reconciliation'>('attempts');
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Payments &amp; refunds</h1>
        <p className={styles.sectionIntro}>
          Payment attempts, provider events and reconciliation. Refunds are issued from the order
          page for a succeeded payment. This build has only the non-production test provider.
        </p>
        <div role="tablist" aria-label="Payment views" className={styles.tabs}>
          {(
            [
              { id: 'attempts', label: 'Attempts' },
              { id: 'events', label: 'Provider events' },
              { id: 'reconciliation', label: 'Reconciliation' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.adminTab} ${tab === t.id ? styles.adminTabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'attempts' ? <Attempts /> : tab === 'events' ? <Events /> : <Reconciliation />}
      </section>
    </div>
  );
}

const money = (amountMinor: number) => formatMoney({ amountMinor, currency: 'EGP' });

function Attempts() {
  const { state, reload } = useAdminResource<{ attempts: AdminPaymentAttempt[] }>('admin/payments');
  return (
    <AdminLoad state={state} onRetry={() => void reload()} what="payments">
      {({ attempts }) =>
        attempts.length === 0 ? (
          <AdminEmpty
            icon="coin"
            title="No payment attempts"
            body="Attempts appear when customers start paying for orders."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Order</th>
                  <th>Provider</th>
                  <th className={styles.textRight}>Amount</th>
                  <th>Status</th>
                  <th className={styles.textRight}>Refunded</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody data-rows>
                {attempts.map((a) => (
                  <tr key={a.id} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      <span className="numerals">{shortId(a.id, 'PAY-')}</span>
                    </td>
                    <td className={styles.tableCell}>
                      <Link href={`/admin/orders/${a.orderId}`} className="numerals">
                        {shortId(a.orderId, 'HC-')}
                      </Link>
                    </td>
                    <td className={styles.tableCell}>
                      {a.provider === 'LOCAL_TEST' ? 'Test provider' : a.provider}
                    </td>
                    <td className={`${styles.tableCell} ${styles.textRight}`}>
                      <span className="numerals">{money(a.amountMinor)}</span>
                    </td>
                    <td className={styles.tableCell}>
                      {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                    </td>
                    <td className={`${styles.tableCell} ${styles.textRight}`}>
                      <span className="numerals">{money(a.refundedMinor)}</span>
                      {a.pendingRefundMinor > 0 ? (
                        <div style={{ fontSize: 12 }}>+{money(a.pendingRefundMinor)} pending</div>
                      ) : null}
                    </td>
                    <td className={styles.tableCell}>{adminDate(a.createdAt)}</td>
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

function Events() {
  const { state, reload } = useAdminResource<{ events: AdminPaymentEvent[] }>(
    'admin/payments/events',
  );
  return (
    <AdminLoad state={state} onRetry={() => void reload()} what="provider events">
      {({ events }) =>
        events.length === 0 ? (
          <AdminEmpty
            icon="coin"
            title="No provider events"
            body="No payment provider has delivered an event to the store."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Event</th>
                  <th>Outcome</th>
                  <th>Order</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody data-rows>
                {events.map((e) => (
                  <tr key={e.id} className={styles.tableRow}>
                    <td className={styles.tableCell}>{adminDate(e.createdAt)}</td>
                    <td className={styles.tableCell}>
                      {e.eventType} · {e.provider}
                    </td>
                    <td className={styles.tableCell}>
                      {e.outcome.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className={styles.tableCell}>
                      {e.orderId !== null ? (
                        <Link href={`/admin/orders/${e.orderId}`}>{shortId(e.orderId, 'HC-')}</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={styles.tableCell}>{e.reason ?? '—'}</td>
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

function Reconciliation() {
  const action = useAdminAction();
  const [result, setResult] = useState<AdminReconciliation | null>(null);
  return (
    <div>
      <p className={styles.fieldHelp}>
        Asks the provider for its view of every attempt and reports differences. It records the
        check and changes no payment. The test provider reports every payment it is asked about as
        succeeded, so pending test payments show up as differences — that is expected for the
        simulation.
      </p>
      <AdminNotice notice={action.notice} />
      <button
        type="button"
        className={styles.btnPrimary}
        disabled={action.busy !== null}
        onClick={fire(async () => {
          const next = await action.run('reconcile', () =>
            api.get<AdminReconciliation>('admin/payments/reconciliation'),
          );
          if (next !== null) setResult(next);
        })}
      >
        {action.busy !== null ? 'Checking…' : 'Run reconciliation check'}
      </button>
      {result !== null ? (
        <div style={{ marginTop: 12 }}>
          <p className={styles.fieldHelp}>
            Checked {result.checked} attempt{result.checked === 1 ? '' : 's'} ·{' '}
            {result.differences.length} difference
            {result.differences.length === 1 ? '' : 's'}
          </p>
          {result.differences.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Attempt</th>
                    <th>Order</th>
                    <th>Store</th>
                    <th>Provider</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody data-rows>
                  {result.differences.map((d) => (
                    <tr key={d.attemptId} className={styles.tableRow}>
                      <td className={styles.tableCell}>
                        <span className="numerals">{shortId(d.attemptId, 'PAY-')}</span>
                      </td>
                      <td className={styles.tableCell}>
                        <Link href={`/admin/orders/${d.orderId}`}>{shortId(d.orderId, 'HC-')}</Link>
                      </td>
                      <td className={styles.tableCell}>{d.platformStatus}</td>
                      <td className={styles.tableCell}>{d.providerStatus ?? '—'}</td>
                      <td className={styles.tableCell}>
                        {d.reason.replace(/_/g, ' ').toLowerCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
