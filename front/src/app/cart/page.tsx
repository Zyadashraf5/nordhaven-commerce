import type { Metadata } from 'next';
import { ShopShell } from '../../components/layout/ShopShell';
import { CartPage } from '../../components/shop/CartPage';

/**
 * The Cart page — `/cart` (Stage 3 cart boards) on the customer's live cart
 * (F06: `GET/POST/PATCH/DELETE /cart*`).
 */

export const metadata: Metadata = {
  title: 'Your cart · Nordhaven Commerce',
  description: 'Items you have saved for checkout.',
};

export default function CartRoute() {
  return (
    <ShopShell>
      <CartPage />
    </ShopShell>
  );
}
