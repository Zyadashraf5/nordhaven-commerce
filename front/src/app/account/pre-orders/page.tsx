import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { PreOrdersPage } from '../../../components/f04/PreOrdersPage';

/**
 * My account — pre-orders (`/account/pre-orders`, Stage 4 pre-orders boards).
 * The customer's real pre-orders (F06: `/orders/pre-orders`): awaiting stock,
 * reserved, converted, cancelled or expired. Nothing is charged for a pre-order.
 */
export const metadata: Metadata = {
  title: 'My pre-orders · Nordhaven Commerce',
  description: 'Items you’ve reserved while they’re out of stock.',
};

export default function PreOrdersRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Pre-orders"
        activeLabel="Pre-orders"
        notice="Pre-orders come from your account. Nothing is charged for a pre-order."
      >
        <PreOrdersPage />
      </AccountLayout>
    </ShopShell>
  );
}
