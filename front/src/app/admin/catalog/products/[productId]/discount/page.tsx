import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPricingPage } from '@/components/admin/AdminPricingPage';

/**
 * Admin pricing & promotions (`/admin/catalog/products/[productId]/discount`,
 * Stage 5 admin boards).
 * Product pricing with discounts. Read-only — pricing handled by the Catalog
 * capability (F06).
 */
export const metadata: Metadata = {
  title: 'Pricing & promotions · Admin · Nordhaven Commerce',
  description: 'Product pricing with discounts.',
};

export default function AdminPricingRoute() {
  return (
    <>
      <AdminLayout
        crumbs={[
          { label: 'Catalog products', href: '/admin/catalog/products' },
          { label: 'Pricing & promotions', href: '/admin/catalog/products/[productId]/discount' },
        ]}
        activeLabel="Pricing"
      >
        <AdminPricingPage />
      </AdminLayout>
    </>
  );
}
