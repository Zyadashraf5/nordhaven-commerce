import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { NotificationsPage } from '../../../components/f04/NotificationsPage';

/**
 * My account — notifications (`/account/notifications`, Stage 4 notifications
 * boards). Notifications center with read/unread state and preferences.
 * Demo workings: notifications are sample data; no real email/SMS delivery.
 */
export const metadata: Metadata = {
  title: 'Notifications · Nordhaven Commerce',
  description: 'Updates about your orders, payments, pre-orders and account.',
};

export default function NotificationsRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Notifications"
        activeLabel="Notifications"
        notice="Messages come from your account. Email and SMS delivery are not switched on yet."
      >
        <NotificationsPage />
      </AccountLayout>
    </ShopShell>
  );
}
