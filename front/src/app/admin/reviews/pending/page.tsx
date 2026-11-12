import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminReviewsPage } from '@/components/admin/AdminReviewsPage';

export const metadata: Metadata = {
  title: 'Pending reviews · Admin · Nordhaven Commerce',
  description: 'Reviews awaiting moderation.',
};

export default function AdminReviewsPendingRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[
          { label: 'Reviews', href: '/admin/reviews' },
          { label: 'Pending', href: '/admin/reviews/pending' },
        ]}
        activeLabel="Reviews"
      >
        <AdminReviewsPage />
      </AdminLayout>
    </>
  );
}
