import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import { orderFor } from '../../test/commerce-fixtures';
import { OrderDetailPage } from './OrderDetailPage';

const ORDER_ID = orderFor().id;
vi.mock('next/navigation', () => ({
  useParams: () => ({ orderId: '0d2f6a1c-1111-4222-8333-944445555666' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/account/orders/x',
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * Order detail on the real order (F06 Batch 3): the backend's status and
 * totals; "Pay now" starts a payment attempt that is shown as pending, never
 * as paid; cancel goes through DELETE /orders/{id}.
 */

const attempt = {
  id: 'pa-1',
  orderId: ORDER_ID,
  provider: 'LOCAL_TEST',
  providerReference: 'local-test-payment-pa-1',
  status: 'PENDING',
  statusReason: null,
  amountMinor: 484500,
  currency: 'EGP',
  refundedMinor: 0,
  pendingRefundMinor: 0,
  createdAt: '2026-10-24T08:01:00Z',
  succeededAt: null,
  failedAt: null,
};

const common = {
  'GET /api/hc/shipments': { body: { shipments: [] } },
  'GET /api/hc/catalog/products?limit=50': { body: { items: [], nextCursor: null } },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrderDetailPage (live)', () => {
  it('shows the order snapshot and a pending test payment without claiming it is paid', async () => {
    const calls = installFetchMock({
      ...common,
      [`GET /api/hc/orders/${ORDER_ID}`]: { body: orderFor() },
      'GET /api/hc/payments': [{ body: { attempts: [] } }, { body: { attempts: [attempt] } }],
      'POST /api/hc/payments/attempts': { status: 201, body: attempt },
    });
    render(<OrderDetailPage />);
    expect(await screen.findByRole('heading', { name: /Order HC-0D2F6A1C/ })).toBeInTheDocument();
    expect(screen.getAllByText('EGP 4,845').length).toBeGreaterThan(0);
    expect(screen.getByText('Not paid yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pay now' }));
    expect(await screen.findByText(/Test payment · Pending/)).toBeInTheDocument();
    expect(screen.queryByText('Total paid')).not.toBeInTheDocument();
    const post = calls.find((call) => call.url === '/api/hc/payments/attempts');
    expect(post?.body).toEqual({ orderId: ORDER_ID });
    expect(post?.headers['idempotency-key']).toBe(`order-${ORDER_ID}-attempt-1`);
    expect(
      screen.queryByRole('button', { name: /Pay now|Try paying again/ }),
    ).not.toBeInTheDocument();
  });

  it('cancels an unpaid order through DELETE and shows the cancelled state', async () => {
    const calls = installFetchMock({
      ...common,
      [`GET /api/hc/orders/${ORDER_ID}`]: [
        { body: orderFor() },
        { body: orderFor({ status: 'CANCELLED', cancelledAt: '2026-10-24T08:05:00Z' }) },
      ],
      'GET /api/hc/payments': { body: { attempts: [] } },
      [`DELETE /api/hc/orders/${ORDER_ID}`]: { body: orderFor({ status: 'CANCELLED' }) },
    });
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel order' }).at(-1) as HTMLElement);
    expect(await screen.findByText(/This order was cancelled/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument(),
    );
  });

  it('shows not-found for an order that isn’t the customer’s', async () => {
    installFetchMock({
      ...common,
      [`GET /api/hc/orders/${ORDER_ID}`]: {
        status: 404,
        body: {
          statusCode: 404,
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
          correlationId: 'c',
        },
      },
    });
    render(<OrderDetailPage />);
    expect(await screen.findByText('We couldn’t find that order')).toBeInTheDocument();
  });
});
