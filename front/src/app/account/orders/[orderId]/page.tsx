import type { Metadata } from 'next';
import { ShopShell } from '../../../../components/layout/ShopShell';
import { AccountLayout } from '../../../../components/account/AccountLayout';
import { OrderDetailPage } from '../../../../components/f04/OrderDetailPage';

/**
 * Order detail (`/account/orders/[orderId]`, Stage 4 orders boards + shipment
 * tracking boards) on the real order (F06): items, totals, payment attempts,
 * shipment and cancel. `?lang=ar` renders the Arabic RTL layout.
 */
export const metadata: Metadata = {
  title: 'Order · Nordhaven Commerce',
  description: 'Track your order and shipment.',
};

export default function OrderDetailRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Orders"
        activeLabel="Orders"
        notice="Orders, totals and statuses come from your account. Payments here use the store’s test provider — no real money moves."
        back={{ label: 'My orders', href: '/account/orders' }}
      >
        <OrderDetailPage />
      </AccountLayout>
    </ShopShell>
  );
}
