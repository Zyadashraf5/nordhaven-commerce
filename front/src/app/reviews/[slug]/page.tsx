import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { ProductReviewsPage } from '../../../components/f04/ProductReviewsPage';

/**
 * Product reviews (`/reviews/[slug]`, Stage 4 reviews boards on the PDP).
 * Average rating, rating breakdown and published reviews. Demo workings:
 * reviews are moderated sample data.
 */
export const metadata: Metadata = {
  title: 'Reviews · Nordhaven Commerce',
  description: 'Customer reviews for this product.',
};

export default function ProductReviewsRoute() {
  return (
    <ShopShell>
      <ProductReviewsPage />
    </ShopShell>
  );
}
