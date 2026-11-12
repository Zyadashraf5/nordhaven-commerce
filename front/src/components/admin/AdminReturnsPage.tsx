'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '../../data/money';
import { api } from '../../lib/api/browser';
import type { AdminReturn, AdminTransition } from '../../lib/api/admin-types';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import {
  AdminEmpty,
  AdminLoad,
  AdminNotice,
  adminDate,
  shortId,
  useAdminAction,
  useAdminLoader,
  useAdminResource,
} from './admin-data';
import { loadOrderOwners } from './admin-customers';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin returns & refunds (Stage 5 admin boards), live (F06):
 * `GET /admin/returns`, the administrator's decision (`POST …/decision`,
 * approve or reject with a reason — the eligibility policy is not approved,
 * so the decision is the admin's), and the receipt (`POST …/receipt`: which
 * lines go back to stock and whether to refund; keyed by the return, so a
 * repeat restocks and refunds nothing twice). Events per return.
 */
export function AdminReturnsPage() {
  const { state, reload } = useAdminLoader(async () => {
    const [returns, owners] = await Promise.all([
      api.get<{ returns: AdminReturn[] }>('admin/returns'),
      loadOrderOwners(),
    ]);
    return { returns: returns.returns, owners };
  }, []);
  const action = useAdminAction();

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Returns &amp; refunds</h1>
        <p className={styles.sectionIntro}>
          Return requests from customers. Approve or reject them, then record the receipt: which
          items go back to stock and whether to refund.
        </p>
        <AdminNotice notice={action.notice} />
        <AdminLoad state={state} onRetry={() => void reload()} what="returns">
          {({ returns, owners }) =>
            returns.length === 0 ? (
              <AdminEmpty
                icon="returns"
                title="No return requests"
                body="Customers request returns from their paid orders."
              />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Return</th>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Refund</th>
                      <th className={styles.textRight}>Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody data-rows>
                    {returns.map((r) => (
                      <ReturnRow
                        key={r.id}
                        item={r}
                        email={owners.get(r.orderId)?.email ?? null}
                        action={action}
                        onSaved={() => void reload()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </AdminLoad>
      </section>
    </div>
  );
}

function ReturnRow({
  item,
  email,
  action,
  onSaved,
}: {
  item: AdminReturn;
  email: string | null;
  action: ReturnType<typeof useAdminAction>;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState<Set<string>>(new Set(item.lines.map((l) => l.id)));
  const [refund, setRefund] = useState(true);
  const [open, setOpen] = useState(false);
  const act = async (label: string, call: () => Promise<unknown>, success: string) => {
    const done = await action.run(label, call, success);
    if (done !== null) onSaved();
  };
  return (
    <>
      <tr className={styles.tableRow}>
        <td className={styles.tableCell}>
          <span className="numerals">{shortId(item.id, 'RT-')}</span>
          <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
            {item.reasonCode.replace(/_/g, ' ').toLowerCase()} · {adminDate(item.createdAt)}
          </div>
        </td>
        <td className={styles.tableCell}>
          <Link href={`/admin/orders/${item.orderId}`}>{shortId(item.orderId, 'HC-')}</Link>
        </td>
        <td className={styles.tableCell}>{email ?? '—'}</td>
        <td className={styles.tableCell}>
          <OrderStatusBadge kind="return" status={item.status} />
        </td>
        <td className={styles.tableCell}>{item.refundStatus?.toLowerCase() ?? '—'}</td>
        <td className={`${styles.tableCell} ${styles.textRight}`}>
          <span className="numerals">
            {formatMoney({ amountMinor: item.totalMinor, currency: 'EGP' })}
          </span>
        </td>
        <td className={styles.tableCell}>
          {item.status === 'REQUESTED' ? (
            <div className={styles.filterBar}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`rr-${item.id}`}>
                  Reason (shown to the customer)
                </label>
                <input
                  id={`rr-${item.id}`}
                  className={styles.textField}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={action.busy !== null}
                onClick={() =>
                  void act(
                    'approve',
                    () =>
                      api.post(`admin/returns/${item.id}/decision`, {
                        decision: 'APPROVED',
                        reason: reason.trim() || null,
                      }),
                    'Return approved.',
                  )
                }
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.btnOutline}
                disabled={action.busy !== null || reason.trim() === ''}
                title={reason.trim() === '' ? 'Give a reason to reject' : undefined}
                onClick={() =>
                  void act(
                    'reject',
                    () =>
                      api.post(`admin/returns/${item.id}/decision`, {
                        decision: 'REJECTED',
                        reason: reason.trim(),
                      }),
                    'Return rejected.',
                  )
                }
              >
                Reject
              </button>
            </div>
          ) : item.status === 'APPROVED' ? (
            <div>
              {item.lines.map((line) => (
                <label key={line.id} style={{ display: 'block', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={restock.has(line.id)}
                    onChange={() => {
                      const next = new Set(restock);
                      if (next.has(line.id)) next.delete(line.id);
                      else next.add(line.id);
                      setRestock(next);
                    }}
                  />{' '}
                  Restock line {shortId(line.orderLineId)} × {line.quantity}
                </label>
              ))}
              <label style={{ display: 'block', fontSize: 13 }}>
                <input type="checkbox" checked={refund} onChange={() => setRefund(!refund)} />{' '}
                Refund the customer
              </label>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={action.busy !== null}
                onClick={() =>
                  void act(
                    'receipt',
                    () =>
                      api.post(`admin/returns/${item.id}/receipt`, {
                        refund,
                        restockLineIds: [...restock],
                      }),
                    'Receipt recorded.',
                  )
                }
              >
                Record receipt
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.btnOutline}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Hide history' : 'History'}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={7} className={styles.tableCell}>
            <Events path={`admin/returns/${item.id}/events`} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function Events({ path }: { path: string }) {
  const { state, reload } = useAdminResource<{ events: AdminTransition[] }>(path);
  return (
    <AdminLoad state={state} onRetry={() => void reload()} what="history">
      {({ events }) => (
        <ol className={styles.timeline}>
          {events.map((e, index) => (
            <li key={index} className={styles.timelineRow}>
              <span className={styles.timelineDot} />
              <div>
                <div style={{ fontWeight: 600 }}>
                  {(e.nextStatus ?? e.eventType).replace(/_/g, ' ').toLowerCase()} ·{' '}
                  {e.actor.toLowerCase()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
                  {adminDate(e.createdAt)}
                  {e.reason !== null ? ` · ${e.reason}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AdminLoad>
  );
}
