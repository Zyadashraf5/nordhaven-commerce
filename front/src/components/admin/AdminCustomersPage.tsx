'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminCustomerDetail, AdminCustomerRow } from '../../lib/api/admin-types';
import {
  AdminLoad,
  adminDate,
  readAllPages,
  shortId,
  useAdminLoader,
  useAdminResource,
} from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin customers (Stage 5 admin boards), live (F06): `GET /admin/customers`
 * (accounts and commerce identities with order, review, shipment and return
 * counts) and `GET /admin/customers/{id}` for the record ids. The contract has
 * no customer names, addresses or editing, so none are shown or offered.
 */
export function AdminCustomersPage() {
  const { state, reload } = useAdminLoader(
    () => readAllPages<AdminCustomerRow>('admin/customers', 'customers'),
    [],
  );
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Customers</h1>
        <p className={styles.sectionIntro}>
          Accounts with their order, review, shipment and return counts. Read-only — the API has no
          customer editing.
        </p>

        <AdminLoad state={state} onRetry={() => void reload()} what="customers">
          {({ items }) => (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Role</th>
                    <th>Since</th>
                    <th className={styles.textRight}>Orders</th>
                    <th className={styles.textRight}>Reviews</th>
                    <th className={styles.textRight}>Shipments</th>
                    <th className={styles.textRight}>Returns</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody data-rows>
                  {items.flatMap((c) => [
                    <tr key={c.customerId} className={styles.tableRow}>
                      <td className={styles.tableCell}>
                        <div>{c.email ?? 'No account (historical reference)'}</div>
                        <div
                          style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}
                          className="numerals"
                        >
                          {shortId(c.customerId)}
                        </div>
                      </td>
                      <td className={styles.tableCell}>{c.role ?? '—'}</td>
                      <td className={styles.tableCell}>{adminDate(c.accountCreatedAt)}</td>
                      <td className={`${styles.tableCell} ${styles.textRight}`}>
                        <span className="numerals">{c.orderCount}</span>
                      </td>
                      <td className={`${styles.tableCell} ${styles.textRight}`}>
                        <span className="numerals">{c.reviewCount}</span>
                      </td>
                      <td className={`${styles.tableCell} ${styles.textRight}`}>
                        <span className="numerals">{c.shipmentCount}</span>
                      </td>
                      <td className={`${styles.tableCell} ${styles.textRight}`}>
                        <span className="numerals">{c.returnCount}</span>
                      </td>
                      <td className={styles.tableCell}>
                        <button
                          type="button"
                          className={styles.btnOutline}
                          aria-expanded={open === c.customerId}
                          onClick={() => setOpen(open === c.customerId ? null : c.customerId)}
                        >
                          {open === c.customerId ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>,
                    open === c.customerId ? (
                      <tr key={`${c.customerId}-detail`}>
                        <td colSpan={8} className={styles.tableCell}>
                          <CustomerDetail id={c.customerId} />
                        </td>
                      </tr>
                    ) : null,
                  ])}
                </tbody>
              </table>
            </div>
          )}
        </AdminLoad>
      </section>
    </div>
  );
}

function CustomerDetail({ id }: { id: string }) {
  const { state, reload } = useAdminResource<AdminCustomerDetail>(`admin/customers/${id}`);
  return (
    <AdminLoad state={state} onRetry={() => void reload()} what="this customer">
      {(detail) => (
        <div className={styles.summaryGrid}>
          <div>
            <h3 className={styles.subsectionTitle}>Orders ({detail.orderCount})</h3>
            {detail.orderIds.length === 0 ? (
              <p className={styles.fieldHelp}>None.</p>
            ) : (
              detail.orderIds.map((orderId) => (
                <div key={orderId}>
                  <Link href={`/admin/orders/${orderId}`} className="numerals">
                    {shortId(orderId, 'HC-')}
                  </Link>
                </div>
              ))
            )}
          </div>
          <div>
            <h3 className={styles.subsectionTitle}>Other records</h3>
            <p className={styles.fieldHelp}>
              Reviews {detail.reviewCount} · Shipments {detail.shipmentCount} · Returns{' '}
              {detail.returnCount}
            </p>
            {detail.recordsTruncated ? (
              <p className={styles.fieldHelp}>Only the newest 500 ids per type are listed.</p>
            ) : null}
          </div>
        </div>
      )}
    </AdminLoad>
  );
}
