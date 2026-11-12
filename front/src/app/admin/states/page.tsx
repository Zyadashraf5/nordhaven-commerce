import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminStatesPage } from '@/components/admin/AdminStatesPage';

export const metadata: Metadata = {
  title: 'System states · Admin · Nordhaven Commerce',
  description: 'Every customer-facing state with its meaning.',
};

export default function AdminStatesRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'System states', href: '/admin/states' }]}
        activeLabel="System states"
      >
        <AdminStatesPage />
      </AdminLayout>
    </>
  );
}
