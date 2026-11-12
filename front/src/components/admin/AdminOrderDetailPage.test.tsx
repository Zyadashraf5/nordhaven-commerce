import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import {
  adminOrder,
  customerDetail,
  customersPage,
  pendingAttempt,
} from '../../test/admin-fixtures';
import { AdminOrderDetailPage } from './AdminOrderDetailPage';

vi.mock('next/navigation', () => ({
  useParams: () => ({ orderId: '0d2f6a1c-1111-4222-8333-944445555666' }),
  usePathname: () => '/admin/orders/x',
}));

/** Live admin order detail (F06 Batch 4). */

const routes = {
  [`GET /api/hc/admin/orders/${adminOrder.id}`]: { body: adminOrder },
  'GET /api/hc/admin/customers?limit=50': { body: customersPage },
  'GET /api/hc/admin/customers/cust-1': { body: customerDetail },
  'GET /api/hc/admin/payments': { body: { attempts: [pendingAttempt] } },
  'GET /api/hc/admin/shipments': { body: { shipments: [] } },
  'GET /api/hc/admin/shipping/methods': { body: { methods: [] } },
  'GET /api/hc/admin/payments/attempts/pa-1/refunds': { body: { refunds: [] } },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminOrderDetailPage (live)', () => {
  it('renders the order snapshot, owner, pending test payment and no shipment for an unpaid order', async () => {
    installFetchMock(routes);
    render(<AdminOrderDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Order HC-0D2F6A1C' })).toBeInTheDocument();
    expect(screen.getByText(/nadia@example.test/)).toBeInTheDocument();
    expect(screen.getByText('SKU HC-CI-CAS-28-SAG · −15%')).toBeInTheDocument();
    expect(screen.getByText(/Test payment \(non-production provider\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/A shipment can only be created once the order is paid/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
    expect(screen.getByText(/stores no delivery address/)).toBeInTheDocument();
  });

  it('shows not-found for an unknown order', async () => {
    installFetchMock({
      ...routes,
      [`GET /api/hc/admin/orders/${adminOrder.id}`]: {
        status: 404,
        body: {
          statusCode: 404,
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
          correlationId: 'c',
        },
      },
    });
    render(<AdminOrderDetailPage />);
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});
