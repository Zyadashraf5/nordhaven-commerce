import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import { productPage } from '../../test/admin-fixtures';
import { AdminPricingPage } from './AdminPricingPage';

vi.mock('next/navigation', () => ({
  useParams: () => ({ productId: 'all' }),
  usePathname: () => '/admin/catalog/products/all/discount',
}));

/** Live pricing (F06 Batch 4): API prices, discount saved as basis points, no promotion model invented. */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminPricingPage (live)', () => {
  it('lists base, discount and effective price from the API', async () => {
    installFetchMock({ 'GET /api/hc/admin/catalog/products?limit=50': { body: productPage } });
    render(<AdminPricingPage />);
    expect(await screen.findByText('Enamelled Cast-Iron Casserole')).toBeInTheDocument();
    expect(screen.getByText('EGP 5,700')).toBeInTheDocument();
    expect(screen.getByText('EGP 4,845')).toBeInTheDocument();
    expect(screen.getByLabelText('Discount % for Enamelled Cast-Iron Casserole')).toHaveValue('15');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/admin/catalog/products/p-casserole',
    );
  });

  it('saves a new discount once, in basis points, even if Save is clicked twice', async () => {
    const calls = installFetchMock({
      'GET /api/hc/admin/catalog/products?limit=50': { body: productPage },
      'PUT /api/hc/admin/catalog/products/p-casserole/discount': { body: {} },
    });
    render(<AdminPricingPage />);
    fireEvent.change(await screen.findByLabelText('Discount % for Enamelled Cast-Iron Casserole'), {
      target: { value: '20' },
    });
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(
      await screen.findByText('Enamelled Cast-Iron Casserole: 20% discount saved.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ basisPoints: 2000 });
  });

  it('shows the honest empty state for promotions', () => {
    installFetchMock({ 'GET /api/hc/admin/catalog/products?limit=50': { body: productPage } });
    render(<AdminPricingPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Promotions' }));
    expect(screen.getByText('No promotions are configured')).toBeInTheDocument();
  });
});
