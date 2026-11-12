import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { AccountProfile } from '../../../components/account/AccountProfile';

/**
 * Profile (`/account/profile`, Stage 3 "My account" profile board). The saved
 * record is the boards' sample identity; "saving" edits the preview only.
 */

export const metadata: Metadata = {
  title: 'Profile — Nordhaven Commerce',
  description: 'The name and contact details we use for your account and orders.',
};

export default function ProfileRoute() {
  return (
    <ShopShell>
      <AccountLayout
        crumb="Profile"
        activeLabel="Profile"
        notice="Your name and mobile number are saved to your account. Your sign-in email can’t be changed here."
      >
        <AccountProfile />
      </AccountLayout>
    </ShopShell>
  );
}
