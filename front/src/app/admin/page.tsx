import type { Metadata } from 'next';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { AdminOverviewPage } from '../../components/admin/AdminOverviewPage';

/**
 * Admin overview — `/admin` (Stage 5 admin boards). Operational picture
 * assembled from each capability's own read contracts. Demo workings: read-only
 * orchestration, no live operation.
 */
export const metadata: Metadata = {
  title: 'Admin overview · Nordhaven Commerce',
  description: 'Operational picture: orders, shipments, returns, reviews and money by state.',
};

export default function AdminOverviewRoute() {
  return (
    <>
      <AdminLayout crumbs={[{ label: 'Overview', href: '/admin' }]} activeLabel="Overview">
        <AdminOverviewPage />
      </AdminLayout>
    </>
  );
}
