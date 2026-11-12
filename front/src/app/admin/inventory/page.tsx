import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminInventoryPage } from '@/components/admin/AdminInventoryPage';

export const metadata: Metadata = {
  title: 'Inventory · Admin · Nordhaven Commerce',
  description: 'Inventory balances with on-hand, reserved and available quantities.',
};

export default function AdminInventoryRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'Inventory', href: '/admin/inventory' }]}
        activeLabel="Inventory"
      >
        <AdminInventoryPage />
      </AdminLayout>
    </>
  );
}
