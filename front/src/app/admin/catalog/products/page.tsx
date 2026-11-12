import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminCatalogProductsPage } from '@/components/admin/AdminCatalogProductsPage';

export const metadata: Metadata = {
  title: 'Products · Admin · Nordhaven Commerce',
  description: 'Product catalogue with stock status.',
};

export default function AdminCatalogProductsRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[{ label: 'Catalog', href: '/admin/catalog/products' }]}
        activeLabel="Catalog"
      >
        <AdminCatalogProductsPage />
      </AdminLayout>
    </>
  );
}
