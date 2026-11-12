import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShopShell } from '../../components/layout/ShopShell';
import { OrderConfirmation } from '../../components/checkout/OrderConfirmation';

/**
 * Order confirmation (`/order-confirmation?order=<id>`, Stage 3 confirmation
 * board) for an order the customer just placed (F06: `GET /orders/{id}`).
 */
export const metadata: Metadata = {
  title: 'Order placed · Nordhaven Commerce',
  description: 'Your order number and what happens next.',
};

export default function OrderConfirmationRoute() {
  return (
    <ShopShell>
      <Suspense>
        <OrderConfirmation />
      </Suspense>
    </ShopShell>
  );
}
