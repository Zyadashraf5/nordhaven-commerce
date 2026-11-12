import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import {
  casseroleDetail,
  cartOf,
  signedInSession,
  signedOutSession,
} from '../../test/commerce-fixtures';
import { StorefrontShell } from '../providers/StorefrontShell';
import { WishlistPage } from './WishlistPage';

vi.mock('next/navigation', () => ({
  usePathname: () => '/wishlist',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** Live wishlist (F06 Batch 3): the saved products come from the API and every change goes back to it. */

const saved = {
  id: 'w1',
  productId: 'p-casserole',
  productName: 'Enamelled Cast-Iron Casserole',
  productSlug: casseroleDetail.slug,
  currentPriceMinor: 484500,
  currentCurrency: 'EGP',
  purchasable: true,
  savedAt: '2026-10-24T08:00:00Z',
};

const renderWishlist = () =>
  render(
    <StorefrontShell>
      <WishlistPage />
    </StorefrontShell>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WishlistPage (live)', () => {
  it('lists the saved product at its current API price and removes it with DELETE', async () => {
    const calls = installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': { body: cartOf() },
      'GET /api/hc/customers/me/wishlist': { body: { items: [saved] } },
      [`GET /api/hc/catalog/products/${casseroleDetail.slug}`]: { body: casseroleDetail },
      'DELETE /api/hc/customers/me/wishlist/w1': { body: { items: [] } },
    });
    renderWishlist();
    expect(
      await screen.findByRole('link', { name: 'Enamelled Cast-Iron Casserole' }),
    ).toBeInTheDocument();
    expect(screen.getByText('EGP 4,845')).toBeInTheDocument();
    expect(screen.getByText('Availability confirmed at checkout')).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'Remove Enamelled Cast-Iron Casserole from wishlist',
      })[1] as HTMLElement,
    );
    expect(await screen.findByText('Your wishlist is empty')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
  });

  it('asks a signed-out visitor to sign in', async () => {
    installFetchMock({ 'GET /api/session': { body: signedOutSession } });
    renderWishlist();
    expect(await screen.findByText('Sign in to see your wishlist')).toBeInTheDocument();
  });
});
