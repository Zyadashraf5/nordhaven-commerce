import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { ReturnsPage } from '../../../components/f04/ReturnsPage';

/**
 * My account — returns (`/account/returns`, Stage 4 returns & refunds boards).
 * Return requests and refunds for delivered orders, plus a “Start a return”
 * flow. Demo workings: backend owns eligibility and refundable amounts (F06);
 * no fake refunds.
 */
export const metadata: Metadata = {
  title: 'Returns & refunds · Nordhaven Commerce',
  description: 'Start or track a return for a delivered order.',
};

export default function ReturnsRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Returns"
        activeLabel="Returns"
        notice="Returns and refunds come from your account. Nothing is refunded until the store receives the items."
      >
        <ReturnsPage />
      </AccountLayout>
    </ShopShell>
  );
}
