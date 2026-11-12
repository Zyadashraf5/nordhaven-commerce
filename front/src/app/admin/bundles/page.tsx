import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminBundlesPage } from '@/components/admin/AdminBundlesPage';

export const metadata: Metadata = {
  title: 'Bundles · Admin · Nordhaven Commerce',
  description: 'Fixed and dynamic bundles with stock.',
};

export default function AdminBundlesRoute() {
  return (
    <>
      <AdminLayout crumbs={[{ label: 'Bundles', href: '/admin/bundles' }]} activeLabel="Bundles">
        <AdminBundlesPage />
      </AdminLayout>
    </>
  );
}
