import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import {
  adminOrder,
  customerDetail,
  customersPage,
  pendingAttempt,
} from '../../test/admin-fixtures';
import { orderFor } from '../../test/commerce-fixtures';
import { AdminOrdersPage } from './AdminOrdersPage';

/** Live admin orders (F06 Batch 4): real orders with owner, payment attempt and shipment; no sample rows. */

const cancelled = orderFor({ id: '11111111-2222-4333-8444-555555555555', status: 'CANCELLED' });

const routes = {
  'GET /api/hc/admin/orders': { body: { orders: [adminOrder, cancelled] } },
  'GET /api/hc/admin/customers?limit=50': { body: customersPage },
  'GET /api/hc/admin/customers/cust-1': { body: customerDetail },
  'GET /api/hc/admin/payments': { body: { attempts: [pendingAttempt] } },
  'GET /api/hc/admin/shipments': { body: { shipments: [] } },
  'GET /api/hc/admin/orders/pre-orders': { body: { preOrders: [] } },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminOrdersPage (live)', () => {
  it('lists the API orders with owner email, items, total and payment state', async () => {
    installFetchMock(routes);
    render(<AdminOrdersPage />);
    const link = await screen.findByRole('link', { name: 'HC-0D2F6A1C' });
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('nadia@example.test')).toBeInTheDocument();
    expect(within(row).getByText('EGP 4,845')).toBeInTheDocument();
    expect(within(row).getByText('Test payment · pending')).toBeInTheDocument();
    expect(screen.queryByText(/HC-260421/)).not.toBeInTheDocument();
  });

  it('filters by state and searches by number or email', async () => {
    installFetchMock(routes);
    render(<AdminOrdersPage />);
    await screen.findByRole('link', { name: 'HC-0D2F6A1C' });
    fireEvent.click(screen.getByRole('tab', { name: 'Cancelled' }));
    expect(screen.queryByRole('link', { name: 'HC-0D2F6A1C' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'HC-11111111' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'All orders' }));
    fireEvent.change(screen.getByLabelText('Search by order number or customer'), {
      target: { value: 'nadia@' },
    });
    expect(screen.getByRole('link', { name: 'HC-0D2F6A1C' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'HC-11111111' })).not.toBeInTheDocument();
  });

  it('keeps bulk selection but offers no fake bulk action', async () => {
    installFetchMock(routes);
    render(<AdminOrdersPage />);
    await screen.findByRole('link', { name: 'HC-0D2F6A1C' });
    fireEvent.click(screen.getByLabelText('Select all orders'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'No bulk order actions exist in the API' }),
    ).toBeDisabled();
  });

  it('shows the live pre-orders view with an honest empty state', async () => {
    installFetchMock(routes);
    render(<AdminOrdersPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Pre-orders' }));
    expect(await screen.findByText('No pre-orders')).toBeInTheDocument();
  });

  it('shows a retryable error when the API fails', async () => {
    installFetchMock({
      ...routes,
      'GET /api/hc/admin/orders': {
        status: 500,
        body: { statusCode: 500, code: 'INTERNAL', message: 'Boom', correlationId: 'c' },
      },
    });
    render(<AdminOrdersPage />);
    expect(await screen.findByText('We couldn’t load orders')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
