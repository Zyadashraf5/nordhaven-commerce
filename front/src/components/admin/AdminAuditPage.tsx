'use client';

import type { AdminAuditEvent } from '../../lib/api/admin-types';
import { AdminLoad, adminDate, shortId, useAdminResource } from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin audit log (Stage 5 admin boards), live (F06): the security trail of
 * authentication and authorization decisions (`GET /admin/audit`, newest 200).
 * It never carries a credential. The contract has no route field, so the
 * correlation id is shown instead.
 */
export function AdminAuditPage() {
  const { state, reload } = useAdminResource<{ events: AdminAuditEvent[] }>('admin/audit', {
    limit: 200,
  });
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Audit log</h1>
        <p className={styles.sectionIntro}>
          Every sign-in, MFA and authorization decision the platform recorded, newest first.
        </p>
        <AdminLoad state={state} onRetry={() => void reload()} what="the audit log">
          {({ events }) => (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Correlation</th>
                    <th>Result</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody data-rows>
                  {events.map((e) => (
                    <tr
                      key={`${e.correlationId}-${e.eventType}-${e.createdAt}`}
                      className={styles.tableRow}
                    >
                      <td className={styles.tableCell}>
                        {e.actorRole ?? 'Anonymous'}
                        {e.actorUserId !== null ? (
                          <div style={{ fontSize: 12 }} className="numerals">
                            {shortId(e.actorUserId)}
                          </div>
                        ) : null}
                      </td>
                      <td className={styles.tableCell}>
                        {e.eventType.replace(/_/g, ' ').toLowerCase()}
                      </td>
                      <td className={styles.tableCell}>
                        <span className="numerals">{shortId(e.correlationId)}</span>
                      </td>
                      <td className={styles.tableCell}>{e.outcome.toLowerCase()}</td>
                      <td className={styles.tableCell}>{adminDate(e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminLoad>
      </section>
    </div>
  );
}
