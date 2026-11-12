import type { Metadata } from 'next';
import { ShopShell } from '../../../../components/layout/ShopShell';
import { AccountLayout } from '../../../../components/account/AccountLayout';
import { ReturnDetailPage } from '../../../../components/f04/ReturnDetailPage';

/**
 * Return detail (`/account/returns/[returnId]`, Stage 4 returns boards), live
 * (F06): status progression and refund state from the backend.
 */
export const metadata: Metadata = {
  title: 'Return · Nordhaven Commerce',
  description: 'Track your return and refund.',
};

export default function ReturnDetailRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Returns"
        activeLabel="Returns"
        back={{ label: 'Returns', href: '/account/returns' }}
        notice="Returns and refunds come from your account. Nothing is refunded until the store receives the items."
      >
        <ReturnDetailPage />
      </AccountLayout>
    </ShopShell>
  );
}
