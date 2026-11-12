'use client';

import { fire } from '../../lib/fire';
import { api } from '../../lib/api/browser';
import type { AdminNotification } from '../../lib/api/admin-types';
import { OrderStatusBadge } from '../f04/OrderStatusBadge';
import {
  AdminEmpty,
  AdminLoad,
  AdminNotice,
  adminDate,
  useAdminAction,
  useAdminResource,
} from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin notifications (Stage 5 admin boards), live (F06):
 * `GET /admin/notifications` — what the store sent or would have sent, and
 * why a delivery didn't happen. A failed message can be retried
 * (`POST …/retry`); only the local/test transports exist (production sends
 * nothing until a provider is approved, HC-DEC-014), and a delivered message
 * is never sent twice.
 */
export function AdminNotificationsPage() {
  const { state, reload } = useAdminResource<{ notifications: AdminNotification[] }>(
    'admin/notifications',
  );
  const action = useAdminAction();
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Notifications</h1>
        <p className={styles.sectionIntro}>
          Messages to customers and their delivery state. No delivery provider is approved yet, so
          messages are recorded rather than sent.
        </p>
        <AdminNotice notice={action.notice} />
        <AdminLoad state={state} onRetry={() => void reload()} what="notifications">
          {({ notifications }) =>
            notifications.length === 0 ? (
              <AdminEmpty
                icon="bell"
                title="No messages yet"
                body="Messages are recorded when orders, reviews or returns change."
              />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Time</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody data-rows>
                    {notifications.map((n) => (
                      <tr key={n.id} className={styles.tableRow}>
                        <td className={styles.tableCell}>
                          <div style={{ fontWeight: 600 }}>{n.subject}</div>
                          {n.failureReason !== null ? (
                            <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
                              {n.failureReason}
                            </div>
                          ) : null}
                        </td>
                        <td className={styles.tableCell}>
                          {n.kind.replace(/_/g, ' ').toLowerCase()}
                        </td>
                        <td className={styles.tableCell}>
                          <OrderStatusBadge kind="notification" status={n.status} />
                          {n.provider !== null ? (
                            <div style={{ fontSize: 12 }}>{n.provider}</div>
                          ) : null}
                        </td>
                        <td className={styles.tableCell}>{adminDate(n.createdAt)}</td>
                        <td className={styles.tableCell}>
                          {n.status === 'FAILED' ? (
                            <button
                              type="button"
                              className={styles.btnOutline}
                              disabled={action.busy !== null}
                              onClick={fire(async () => {
                                const done = await action.run(
                                  n.id,
                                  () => api.post(`admin/notifications/${n.id}/retry`),
                                  'Retry requested.',
                                );
                                if (done !== null) void reload();
                              })}
                            >
                              Retry
                            </button>
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
      </section>
    </div>
  );
}
