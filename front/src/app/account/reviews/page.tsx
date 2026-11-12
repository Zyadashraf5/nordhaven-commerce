import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { MyReviewsPage } from '../../../components/f04/MyReviewsPage';

/**
 * My account — reviews (`/account/reviews`, Stage 4 reviews boards). Ready-to-
 * review items from delivered orders plus the customer’s own reviews with
 * moderation status. Demo workings: reviews are moderated and never presented
 * as persisted.
 */
export const metadata: Metadata = {
  title: 'My reviews · Nordhaven Commerce',
  description: 'Review items from your delivered orders.',
};

export default function MyReviewsRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Reviews"
        activeLabel="Reviews"
        notice="Your reviews come from your account and are checked before they appear."
      >
        <MyReviewsPage />
      </AccountLayout>
    </ShopShell>
  );
}
