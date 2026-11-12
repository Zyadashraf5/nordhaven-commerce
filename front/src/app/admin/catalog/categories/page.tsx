import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminCategoriesPage } from '@/components/admin/AdminCategoriesPage';

export const metadata: Metadata = {
  title: 'Categories · Admin · Nordhaven Commerce',
  description: 'Product categories and brands.',
};

export default function AdminCategoriesRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'Categories', href: '/admin/catalog/categories' }]}
        activeLabel="Categories"
      >
        <AdminCategoriesPage />
      </AdminLayout>
    </>
  );
}
