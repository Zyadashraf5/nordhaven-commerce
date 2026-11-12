import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { OrdersPage } from '../../../components/f04/OrdersPage';

/**
 * My account — orders (`/account/orders`, Stage 4 orders boards). The
 * customer's real orders (F06: `GET /orders`) with status tabs, search and
 * empty/loading/error states.
 */
export const metadata: Metadata = {
  title: 'My orders · Nordhaven Commerce',
  description: 'Follow your orders from payment to delivery.',
};

export default function OrdersRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Orders"
        activeLabel="Orders"
        notice="Orders, totals and statuses come from your account. Payments here use the store’s test provider — no real money moves."
      >
        <OrdersPage />
      </AccountLayout>
    </ShopShell>
  );
}
