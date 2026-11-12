import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import { adminBrands, adminCategories, adminProduct } from '../../test/admin-fixtures';
import { AdminEditProductPage } from './AdminEditProductPage';

vi.mock('next/navigation', () => ({
  useParams: () => ({ productId: 'p-casserole' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/catalog/products/p-casserole',
}));

/** Live product editor (F06 Batch 4): reads the admin product, saves each panel through its own contract. */

const base = {
  'GET /api/hc/admin/catalog/products/p-casserole': { body: adminProduct },
  'GET /api/hc/admin/catalog/categories': { body: adminCategories },
  'GET /api/hc/admin/catalog/brands': { body: adminBrands },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminEditProductPage (live)', () => {
  it('prefills the details from the API product and keeps Save disabled until a change', async () => {
    installFetchMock(base);
    render(<AdminEditProductPage />);
    expect(await screen.findByLabelText('Product name')).toHaveValue(
      'Enamelled Cast-Iron Casserole',
    );
    expect(screen.getByLabelText('Base price (before discount)')).toHaveValue('5700');
    expect(screen.getByText('HC-CI-CAS-24-TER')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('PATCHes only after a change, with the exact minor-unit price and the CSRF header', async () => {
    const calls = installFetchMock({
      ...base,
      'PATCH /api/hc/admin/catalog/products/p-casserole': {
        body: { ...adminProduct, basePriceMinor: 575050 },
      },
    });
    render(<AdminEditProductPage />);
    fireEvent.change(await screen.findByLabelText('Base price (before discount)'), {
      target: { value: '5750.50' },
    });
    const save = screen.getByRole('button', { name: 'Save changes' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(await screen.findByText('Product details saved.')).toBeInTheDocument();
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0]?.body).toMatchObject({ basePriceMinor: 575050, baseCurrency: 'EGP' });
    expect(patches[0]?.headers['x-hc-request']).toBe('storefront');
  });

  it('shows the API refusal instead of claiming success (publishing without a sellable variant)', async () => {
    installFetchMock({
      ...base,
      'GET /api/hc/admin/catalog/products/p-casserole': {
        body: { ...adminProduct, status: 'DRAFT' },
      },
      'PUT /api/hc/admin/catalog/products/p-casserole/status': {
        status: 409,
        body: {
          statusCode: 409,
          code: 'PRODUCT_NOT_PUBLISHABLE',
          message: 'The product has no sellable variant',
          correlationId: 'c',
        },
      },
    });
    render(<AdminEditProductPage />);
    fireEvent.change(await screen.findByLabelText('Status'), { target: { value: 'PUBLISHED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The product has no sellable variant',
    );
  });

  it('says the session ended on 401 and offers sign-in, without sample data', async () => {
    installFetchMock({
      'GET /api/hc/admin/catalog/products/p-casserole': {
        status: 401,
        body: { statusCode: 401, code: 'UNAUTHENTICATED', message: 'x', correlationId: 'c' },
      },
      'GET /api/hc/admin/catalog/categories': { body: adminCategories },
      'GET /api/hc/admin/catalog/brands': { body: adminBrands },
    });
    render(<AdminEditProductPage />);
    expect(await screen.findByText('Your session has ended')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
        'href',
        expect.stringContaining('/account/sign-in?next='),
      ),
    );
    expect(screen.queryByLabelText('Product name')).not.toBeInTheDocument();
  });

  it('shows "Not permitted" on 403 (a customer session calling the admin API)', async () => {
    installFetchMock({
      'GET /api/hc/admin/catalog/products/p-casserole': {
        status: 403,
        body: { statusCode: 403, code: 'FORBIDDEN', message: 'x', correlationId: 'c' },
      },
      'GET /api/hc/admin/catalog/categories': { body: adminCategories },
      'GET /api/hc/admin/catalog/brands': { body: adminBrands },
    });
    render(<AdminEditProductPage />);
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });
});
