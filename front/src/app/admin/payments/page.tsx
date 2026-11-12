import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPaymentsPage } from '@/components/admin/AdminPaymentsPage';

export const metadata: Metadata = {
  title: 'Payments · Admin · Nordhaven Commerce',
  description: 'Payment attempts and refund status.',
};

export default function AdminPaymentsRoute() {
  return (
    <>
      <AdminLayout crumbs={[{ label: 'Payments', href: '/admin/payments' }]} activeLabel="Payments">
        <AdminPaymentsPage />
      </AdminLayout>
    </>
  );
}
