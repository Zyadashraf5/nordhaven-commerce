'use client';

import { f05StateRows } from '../../data/admin-sample';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin system states gallery (Stage 5 admin boards). Every customer-facing
 * state with meaning. Read-only reference.
 */
export function AdminStatesPage() {
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>System states gallery</h1>
        <p className={styles.sectionIntro}>
          Every customer-facing state with its meaning. Read-only reference.
        </p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Area</th>
                <th>State</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody data-rows>
              {f05StateRows.map((row) => (
                <tr key={`${row.area}-${row.state}`} className={styles.tableRow}>
                  <td className={styles.tableCell}>{row.area}</td>
                  <td className={styles.tableCell}>{row.state}</td>
                  <td className={styles.tableCell}>{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
