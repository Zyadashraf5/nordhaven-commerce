import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminCustomersPage } from '@/components/admin/AdminCustomersPage';

export const metadata: Metadata = {
  title: 'Customers · Admin · Nordhaven Commerce',
  description: 'Customers with order, review, shipment and return counts.',
};

export default function AdminCustomersRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'Customers', href: '/admin/customers' }]}
        activeLabel="Customers"
      >
        <AdminCustomersPage />
      </AdminLayout>
    </>
  );
}
