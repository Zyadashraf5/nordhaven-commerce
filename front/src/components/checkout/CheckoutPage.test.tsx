import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock, type MockCall, type MockReply } from '../../test/api-mock';
import {
  address,
  casseroleDetail,
  cartLine,
  cartOf,
  orderFor,
  quoteFor,
  shippingOptions,
  signedInSession,
} from '../../test/commerce-fixtures';
import { StorefrontShell } from '../providers/StorefrontShell';
import { CheckoutPage } from './CheckoutPage';
import type { AccountLang } from '../account/AccountAddresses';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout',
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Live checkout (F06 Batch 3). The server prices the cart (quote) and creates
 * the order; the page never adds totals up itself, never shows an order or a
 * payment that the API didn't confirm, and one confirmed quote can only ever
 * produce one order (stable Idempotency-Key, double-tap guard).
 */

type Route = MockReply | MockReply[] | ((call: MockCall) => MockReply);
const base = (extra: Record<string, Route> = {}): Record<string, Route> => ({
  'GET /api/session': { body: signedInSession },
  'GET /api/hc/cart': { body: cartOf(cartLine()) },
  'GET /api/hc/customers/me/wishlist': { body: { items: [] } },
  [`GET /api/hc/catalog/products/${casseroleDetail.slug}`]: { body: casseroleDetail },
  'GET /api/hc/customers/me/addresses': { body: { addresses: [address] } },
  'GET /api/hc/shipping/options?destinationCountryCode=EG': { body: shippingOptions },
  'POST /api/hc/checkout/quotes': { status: 201, body: quoteFor() },
  ...extra,
});

const renderCheckout = (lang: AccountLang = 'en') =>
  render(
    <StorefrontShell>
      <CheckoutPage lang={lang} />
    </StorefrontShell>,
  );

async function toReview() {
  const next = async (name: string) => {
    const button = await screen.findByRole('button', { name });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
  };
  await screen.findByRole('radio', { name: /Nadia Tester/ });
  await next('Continue to shipping');
  await screen.findByText('Standard delivery (test)');
  await next('Continue to payment');
  await next('Continue to review');
  await screen.findAllByText('Subtotal before tax');
}

beforeEach(() => {
  router.push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CheckoutPage (live)', () => {
  it('walks address → shipping → payment → server quote with the API’s own totals', async () => {
    installFetchMock(base());
    renderCheckout();
    // The default saved address is selected first.
    expect(await screen.findByRole('radio', { name: /Nadia Tester/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to shipping' }));
    expect(await screen.findByText('Standard delivery (test)')).toBeInTheDocument();
    expect(screen.getByText(/Delivery charges aren’t collected online yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(screen.getByText('Test payment')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect((await screen.findAllByText('EGP 595')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('EGP 4,250').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EGP 4,845').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Place order' })).not.toBeDisabled();
    expect(screen.queryByText(/payment (was|has been) (taken|received)/i)).not.toBeInTheDocument();
  });

  it('places exactly one order for one confirmed quote, then opens its confirmation', async () => {
    const calls = installFetchMock(
      base({
        'POST /api/hc/orders': () => ({ status: 201, body: orderFor() }),
      }),
    );
    renderCheckout();
    await toReview();
    const place = screen.getByRole('button', { name: 'Place order' });
    fireEvent.click(place);
    fireEvent.click(place);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/order-confirmation?order=${orderFor().id}`),
    );
    const posts = calls.filter((call) => call.method === 'POST' && call.url === '/api/hc/orders');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({
      destinationCountryCode: 'EG',
      expectedFingerprint: 'f'.repeat(64),
    });
    expect(posts[0]?.headers['idempotency-key']).toMatch(/.{8,}/);
    expect(posts[0]?.headers['x-hc-request']).toBe('storefront');
  });

  it('places nothing when the price changed, and re-quotes for the customer to confirm', async () => {
    const calls = installFetchMock(
      base({
        'POST /api/hc/orders': {
          status: 409,
          body: {
            statusCode: 409,
            code: 'ORDER_QUOTE_CHANGED',
            message: 'The price changed and must be confirmed again',
            correlationId: 'c',
          },
        },
      }),
    );
    renderCheckout();
    await toReview();
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('No order was placed')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.filter((call) => call.url === '/api/hc/checkout/quotes').length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('retries an unknown outcome with the same Idempotency-Key (never a second order)', async () => {
    const calls = installFetchMock(
      base({
        'POST /api/hc/orders': [
          {
            status: 503,
            body: {
              statusCode: 503,
              code: 'BACKEND_UNAVAILABLE',
              message: 'x',
              correlationId: 'c',
            },
          },
          { status: 201, body: orderFor() },
        ],
      }),
    );
    renderCheckout();
    await toReview();
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('No order was placed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const keys = calls
      .filter((call) => call.method === 'POST' && call.url === '/api/hc/orders')
      .map((call) => call.headers['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('lists the server’s blockers and keeps Place order disabled', async () => {
    installFetchMock(
      base({
        'POST /api/hc/checkout/quotes': {
          status: 201,
          body: quoteFor({
            ready: false,
            blockers: [{ code: 'INSUFFICIENT_STOCK', lineId: 'line-1', sku: 'HC-CI-CAS-28-SAG' }],
          }),
        },
      }),
    );
    renderCheckout();
    await toReview();
    expect(
      await screen.findByText(/Not enough stock for SKU HC-CI-CAS-28-SAG/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });

  it('renders the Arabic RTL layout', async () => {
    installFetchMock(base());
    renderCheckout('ar');
    await screen.findByRole('radio', { name: /Nadia Tester/ });
    expect(document.querySelector('section[dir="rtl"]')).not.toBeNull();
    expect(screen.getAllByText('عنوان التوصيل').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'إضافة عنوان جديد' })).toBeInTheDocument();
  });
});
