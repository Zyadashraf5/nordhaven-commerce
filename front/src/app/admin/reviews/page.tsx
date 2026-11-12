import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminReviewsPage } from '@/components/admin/AdminReviewsPage';

export const metadata: Metadata = {
  title: 'Reviews · Admin · Nordhaven Commerce',
  description: 'Customer reviews with moderation status.',
};

export default function AdminReviewsRoute() {
  return (
    <>
      <AdminLayout crumbs={[{ label: 'Reviews', href: '/admin/reviews' }]} activeLabel="Reviews">
        <AdminReviewsPage />
      </AdminLayout>
    </>
  );
}
