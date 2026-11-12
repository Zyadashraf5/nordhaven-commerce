import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminEditProductPage } from '@/components/admin/AdminEditProductPage';

/**
 * Admin edit product (`/admin/catalog/products/[productId]`, Stage 5 admin boards).
 * Product editing with variants, SKU fields, images, attributes, validation
 * and action states. Read-only — product edits handled by the Catalog
 * capability (F06).
 */
export const metadata: Metadata = {
  title: 'Edit product · Admin · Nordhaven Commerce',
  description: 'Product editing with variants, SKU fields, images and attributes.',
};

export default function AdminEditProductRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[
          { label: 'Catalog products', href: '/admin/catalog/products' },
          { label: 'Edit product', href: '/admin/catalog/products/[productId]' },
        ]}
        activeLabel="Catalog"
      >
        <AdminEditProductPage />
      </AdminLayout>
    </>
  );
}
