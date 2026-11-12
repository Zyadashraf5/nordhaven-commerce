import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { AccountSecurity } from '../../../components/account/AccountSecurity';

/**
 * Password & security (`/account/security`, Stage 3 "My account" security
 * board). The password form validates the board's rules and then states that
 * no passwords are changed in this preview.
 */

export const metadata: Metadata = {
  title: 'Password & security — Nordhaven Commerce',
  description: 'Change your password and see where you’re signed in.',
};

export default function SecurityRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Password & security"
        activeLabel="Password & security"
        notice="Your password and signed-in devices are managed by your account. Changing your password signs out every other device."
      >
        <AccountSecurity />
      </AccountLayout>
    </ShopShell>
  );
}
