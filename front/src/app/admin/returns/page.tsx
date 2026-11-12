import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminReturnsPage } from '@/components/admin/AdminReturnsPage';

export const metadata: Metadata = {
  title: 'Returns · Admin · Nordhaven Commerce',
  description: 'Return requests and refund status.',
};

export default function AdminReturnsRoute() {
  return (
    <>
      <AdminLayout crumbs={[{ label: 'Returns', href: '/admin/returns' }]} activeLabel="Returns">
        <AdminReturnsPage />
      </AdminLayout>
    </>
  );
}
