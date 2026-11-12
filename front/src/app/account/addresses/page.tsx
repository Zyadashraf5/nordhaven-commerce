import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { AccountAddresses, type AccountLang } from '../../../components/account/AccountAddresses';

/**
 * Addresses (`/account/addresses`, Stage 3 boards). `?lang=ar` renders the
 * Arabic RTL preview (`/account/addresses?lang=ar`) with the same two sample
 * addresses — the board shipped as "Addresses — mobile Arabic RTL".
 */

export const metadata: Metadata = {
  title: 'Addresses · Nordhaven Commerce',
  description: 'Saved delivery addresses, ready for checkout.',
};

export default async function AddressesRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = params.lang;
  const lang: AccountLang =
    (Array.isArray(requested) ? requested[0] : requested) === 'ar' ? 'ar' : 'en';

  return (
    <ShopShell>
      <AccountLayout
        crumb="Addresses"
        activeLabel="Addresses"
        notice={
          lang === 'ar'
            ? 'تُحفظ عناوينك في حسابك. معاينة اللغة العربية للتخطيط؛ تبقى أسماء المحافظات والمدن كما أدخلتها.'
            : 'Your addresses are saved to your account. The Arabic view is a layout preview; names are shown as you entered them.'
        }
      >
        <AccountAddresses lang={lang} />
      </AccountLayout>
    </ShopShell>
  );
}
