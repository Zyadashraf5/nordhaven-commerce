import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import {
  casseroleDetail,
  cartLine,
  cartOf,
  signedInSession,
  signedOutSession,
} from '../../test/commerce-fixtures';
import { StorefrontShell } from '../providers/StorefrontShell';
import { CartPage } from './CartPage';

vi.mock('next/navigation', () => ({
  usePathname: () => '/cart',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Live cart (F06 Batch 3): the page shows exactly what GET /cart returns, every
 * change is an API call whose answer replaces the cart, a failure says so and
 * leaves the cart as it was, and no sample line ever appears.
 */

const CASSEROLE = `GET /api/hc/catalog/products/${casseroleDetail.slug}`;

const renderCart = () =>
  render(
    <StorefrontShell>
      <CartPage />
    </StorefrontShell>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CartPage (live cart)', () => {
  it('shows the API line with its exact SKU, API price and unknown-stock wording', async () => {
    installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': { body: cartOf(cartLine({ quantity: 2 })) },
      'GET /api/hc/customers/me/wishlist': { body: { items: [] } },
      [CASSEROLE]: { body: casseroleDetail },
    });
    renderCart();
    const line = await screen.findByRole('article', { name: 'Enamelled Cast-Iron Casserole' });
    expect(within(line).getByText('SKU HC-CI-CAS-28-SAG')).toBeInTheDocument();
    expect(within(line).getByText('EGP 9,690')).toBeInTheDocument();
    expect(within(line).getByText('EGP 4,845 each')).toBeInTheDocument();
    expect(within(line).getByText('Availability confirmed at checkout')).toBeInTheDocument();
    await waitFor(() => expect(within(line).getByText('Sage · 28 cm')).toBeInTheDocument());
    // The old sample price never appears.
    expect(screen.queryByText(/4,850/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Preview with sample data/)).not.toBeInTheDocument();
  });

  it('changes the quantity through PATCH /cart/items/{id} and shows the API answer', async () => {
    const calls = installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': { body: cartOf(cartLine()) },
      'GET /api/hc/customers/me/wishlist': { body: { items: [] } },
      [CASSEROLE]: { body: casseroleDetail },
      'PATCH /api/hc/cart/items/line-1': { body: cartOf(cartLine({ quantity: 2 })) },
    });
    renderCart();
    fireEvent.click(await screen.findByRole('button', { name: /Increase quantity/ }));
    await waitFor(() => expect(screen.getByText('EGP 4,845 each')).toBeInTheDocument());
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({ quantity: 2 });
    expect(patch?.headers['x-hc-request']).toBe('storefront');
  });

  it('keeps the cart unchanged and says so when the API refuses a change', async () => {
    installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': { body: cartOf(cartLine()) },
      'GET /api/hc/customers/me/wishlist': { body: { items: [] } },
      [CASSEROLE]: { body: casseroleDetail },
      'PATCH /api/hc/cart/items/line-1': {
        status: 400,
        body: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          correlationId: 'c',
        },
      },
    });
    renderCart();
    fireEvent.click(await screen.findByRole('button', { name: /Increase quantity/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Request validation failed');
    expect(screen.getByLabelText(/Quantity for/)).toHaveTextContent('1');
  });

  it('removes a line with DELETE and offers Undo, which adds the same variant back', async () => {
    const calls = installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': { body: cartOf(cartLine({ quantity: 3 })) },
      'GET /api/hc/customers/me/wishlist': { body: { items: [] } },
      [CASSEROLE]: { body: casseroleDetail },
      'DELETE /api/hc/cart/items/line-1': { body: cartOf() },
      'POST /api/hc/cart/items': {
        status: 201,
        body: cartOf(cartLine({ id: 'line-2', quantity: 3 })),
      },
    });
    renderCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByRole('article', { name: 'Enamelled Cast-Iron Casserole' });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      variantId: 'v-28-sag',
      quantity: 3,
    });
  });

  it('marks an unpublished line as not available and blocks checkout', async () => {
    installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': { body: cartOf(cartLine({ purchasable: false })) },
      'GET /api/hc/customers/me/wishlist': { body: { items: [] } },
      [CASSEROLE]: { body: casseroleDetail },
    });
    renderCart();
    expect(await screen.findByText('No longer available')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Continue to checkout' })[0]).toBeDisabled();
  });

  it('asks a signed-out visitor to sign in instead of showing any cart', async () => {
    installFetchMock({ 'GET /api/session': { body: signedOutSession } });
    renderCart();
    expect(await screen.findByText('Sign in to see your cart')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows an unavailable state with retry when the cart API fails (no sample fallback)', async () => {
    installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': {
        status: 503,
        body: { statusCode: 503, code: 'BACKEND_UNAVAILABLE', message: 'x', correlationId: 'c' },
      },
      'GET /api/hc/customers/me/wishlist': { body: { items: [] } },
    });
    renderCart();
    expect(await screen.findByText('We couldn’t load your cart')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
