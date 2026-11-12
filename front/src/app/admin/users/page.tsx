import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminUsersPage } from '@/components/admin/AdminUsersPage';

export const metadata: Metadata = {
  title: 'Users & roles · Admin · Nordhaven Commerce',
  description: 'Admin users with role and MFA status.',
};

export default function AdminUsersRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'Users & roles', href: '/admin/users' }]}
        activeLabel="Users & roles"
      >
        <AdminUsersPage />
      </AdminLayout>
    </>
  );
}
