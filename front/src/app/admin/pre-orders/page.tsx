import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPreOrdersPage } from '@/components/admin/AdminPreOrdersPage';

/**
 * Admin pre-orders list (`/admin/pre-orders`, Stage 5 admin boards).
 * Read-only orchestration layer.
 */
export const metadata: Metadata = {
  title: 'Pre-orders · Admin · Nordhaven Commerce',
  description: 'Pre-orders by state for fulfilment operations.',
};

export default function AdminPreOrdersRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'Pre-orders', href: '/admin/pre-orders' }]}
        activeLabel="Pre-orders"
      >
        <AdminPreOrdersPage />
      </AdminLayout>
    </>
  );
}
