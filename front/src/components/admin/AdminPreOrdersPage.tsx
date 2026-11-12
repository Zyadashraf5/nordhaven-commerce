'use client';

import { PreOrderTable } from './AdminOrdersPage';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin pre-orders (Stage 5 admin boards), live (F06):
 * `GET /admin/orders/pre-orders`. The admin surface reads pre-orders; the
 * customer cancels or converts them. The contract reports state, total and
 * the linked order, not the items or the customer.
 */
export function AdminPreOrdersPage() {
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Pre-orders</h1>
        <p className={styles.sectionIntro}>
          Items reserved while out of stock. No payment is taken until stock is reserved and a
          payment window opens.
        </p>
        <PreOrderTable />
      </section>
    </div>
  );
}
