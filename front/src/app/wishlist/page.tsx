import type { Metadata } from 'next';
import { ShopShell } from '../../components/layout/ShopShell';
import { WishlistPage } from '../../components/shop/WishlistPage';

/**
 * The Wishlist page — `/wishlist` (Stage 3 wishlist boards). Demo workings:
 * saved items are a clearly labeled sample set; the wishlist belongs to an
 * account once the auth stage connects.
 */

export const metadata: Metadata = {
  title: 'Wishlist · Nordhaven Commerce',
  description: 'Items you have saved for later.',
};

export default function WishlistRoute() {
  return (
    <ShopShell>
      <WishlistPage />
    </ShopShell>
  );
}
