import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminOrderDetailPage } from '@/components/admin/AdminOrderDetailPage';

/**
 * Admin order detail (`/admin/orders/[orderId]`, Stage 5 auth boards).
 * Order items, summary, payment, delivery and shipment tracking. Read-only.
 */
export const metadata: Metadata = {
  title: 'Order detail · Admin · Nordhaven Commerce',
  description: 'Order detail and shipment tracking.',
};

export default function AdminOrderDetailRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[
          { label: 'Orders', href: '/admin/orders' },
          { label: 'Order detail', href: '/admin/orders/[orderId]' },
        ]}
        activeLabel="Orders"
      >
        <AdminOrderDetailPage />
      </AdminLayout>
    </>
  );
}
