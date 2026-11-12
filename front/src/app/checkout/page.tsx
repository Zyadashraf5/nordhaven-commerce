import type { Metadata } from 'next';
import { ShopShell } from '../../components/layout/ShopShell';
import { CheckoutPage } from '../../components/checkout/CheckoutPage';
import type { AccountLang } from '../../components/account/AccountAddresses';

/**
 * Checkout (`/checkout`, Stage 3 checkout boards). Delivery address → shipping
 * method → payment → review & place order, on the live API (F06): the server
 * quotes the cart and creates the order; payment starts from the order page.
 */
export const metadata: Metadata = {
  title: 'Checkout · Nordhaven Commerce',
  description: 'Delivery address, shipping method, payment method and order review.',
};

export default async function CheckoutRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = params.lang;
  const lang: AccountLang =
    (Array.isArray(requested) ? requested[0] : requested) === 'ar' ? 'ar' : 'en';

  return (
    <ShopShell chrome="checkout" lang={lang}>
      <CheckoutPage lang={lang} />
    </ShopShell>
  );
}
