import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';

export const metadata: Metadata = {
  title: 'Notifications · Admin · Nordhaven Commerce',
  description: 'Platform notifications with delivery status.',
};

export default function AdminNotificationsRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'Notifications', href: '/admin/notifications' }]}
        activeLabel="Notifications"
      >
        <AdminNotificationsPage />
      </AdminLayout>
    </>
  );
}
