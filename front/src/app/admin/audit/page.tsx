import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminAuditPage } from '@/components/admin/AdminAuditPage';

export const metadata: Metadata = {
  title: 'Audit log · Admin · Nordhaven Commerce',
  description: 'Security events - authentication and authorization decisions.',
};

export default function AdminAuditRoute() {
  return (
    <>
      <AdminLayout crumbs={[{ label: 'Audit log', href: '/admin/audit' }]} activeLabel="Audit log">
        <AdminAuditPage />
      </AdminLayout>
    </>
  );
}
