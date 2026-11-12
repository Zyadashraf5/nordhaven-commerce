import type { Metadata } from 'next';
import { ShopShell } from '../../components/layout/ShopShell';
import { AccountLayout } from '../../components/account/AccountLayout';
import { AccountOverview } from '../../components/account/AccountOverview';

/**
 * My account — overview (`/account`, Stage 3 boards). The signed-in identity
 * is the boards' sample record; nothing is authenticated.
 */

export const metadata: Metadata = {
  title: 'My account — Nordhaven Commerce',
  description: 'Your orders, pre-orders, wishlist and saved details, all in one place.',
};

export default function AccountRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Overview"
        activeLabel="Overview"
        notice="Your orders, pre-orders, messages, addresses and name come from your account."
      >
        <AccountOverview />
      </AccountLayout>
    </ShopShell>
  );
}
