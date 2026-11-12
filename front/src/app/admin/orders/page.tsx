import type { Metadata } from 'next';
import { AdminLayout } from '../../../components/admin/AdminLayout';
import { AdminOrdersPage } from '../../../components/admin/AdminOrdersPage';

/**
 * Admin orders list (`/admin/orders`, Stage 5 admin boards). Orders with
 * status tabs, search and table UI. Read-only orchestration layer.
 */
export const metadata: Metadata = {
  title: 'Orders · Admin · Nordhaven Commerce',
  description: 'Orders by state for fulfilment operations.',
};

export default async function AdminOrdersRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `?lang=ar` renders the Arabic RTL preview (Stage 5 "Admin — Orders, Arabic RTL").
  const params = await searchParams;
  const requested = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const lang = requested === 'ar' ? 'ar' : 'en';

  return (
    <>
      <AdminLayout
        crumbs={[{ label: lang === 'ar' ? 'الطلبات' : 'Orders', href: '/admin/orders' }]}
        activeLabel="Orders"
        lang={lang}
      >
        <AdminOrdersPage lang={lang} />
      </AdminLayout>
    </>
  );
}
