import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import { AccountAddresses } from './AccountAddresses';

/**
 * Addresses screen (F06): every change goes to /customers/me/addresses via the
 * storefront proxy and the list is read back from it. Failures are shown as
 * failures; nothing is reported saved unless the API accepted it.
 */

const home = {
  id: 'a1',
  recipientName: 'Nadia Tester',
  line1: '14 Example Street',
  line2: 'Apartment 6',
  city: 'Zamalek',
  region: 'Cairo',
  postalCode: '11211',
  countryCode: 'EG',
  phone: '+20 100 000 0000',
  isDefault: true,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
};
const office = {
  ...home,
  id: 'a2',
  recipientName: 'Nadia Office',
  line1: '22 Sample Road',
  line2: null,
  isDefault: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const cardItems = (): HTMLElement[] => {
  const list = document.querySelector('ul[data-address-list]');
  expect(list).not.toBeNull();
  return within(list as HTMLElement).getAllByRole('listitem');
};

describe('AccountAddresses (English)', () => {
  it('loads the saved addresses, default first, from the API', async () => {
    const calls = installFetchMock({
      'GET /api/hc/customers/me/addresses': { body: { addresses: [office, home] } },
    });
    render(<AccountAddresses />);
    await screen.findByText('Addresses');
    await waitFor(() => expect(cardItems()).toHaveLength(2));
    const cards = cardItems();
    expect(cards[0]?.textContent).toContain('Nadia Tester');
    expect(cards[0]?.textContent).toContain('Default');
    expect(cards[0]?.textContent).toContain('14 Example Street, Apartment 6');
    expect(cards[0]?.textContent).toContain('Zamalek, Cairo 11211');
    expect(cards[1]?.textContent).toContain('22 Sample Road');
    expect(calls[0]?.method).toBe('GET');
  });

  it('shows the empty state when the account has no address', async () => {
    installFetchMock({ 'GET /api/hc/customers/me/addresses': { body: { addresses: [] } } });
    render(<AccountAddresses />);
    expect(await screen.findByText('No saved addresses yet')).toBeInTheDocument();
  });

  it('shows an unavailable state with retry when the API fails', async () => {
    installFetchMock({
      'GET /api/hc/customers/me/addresses': {
        status: 503,
        body: { statusCode: 503, code: 'BACKEND_UNAVAILABLE', message: 'x', correlationId: 'c' },
      },
    });
    render(<AccountAddresses />);
    expect(await screen.findByText('We couldn’t load your addresses')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('No saved addresses yet')).not.toBeInTheDocument();
  });

  it('protects the default address with the board’s guard note', async () => {
    installFetchMock({
      'GET /api/hc/customers/me/addresses': { body: { addresses: [home, office] } },
    });
    render(<AccountAddresses />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Nadia Tester' }));
    expect(
      screen.getByText(/can’t be deleted yet\. Set another address as default first/),
    ).toBeInTheDocument();
  });

  it('deletes a non-default address through the API after confirmation', async () => {
    const calls = installFetchMock({
      'GET /api/hc/customers/me/addresses': [
        { body: { addresses: [home, office] } },
        { body: { addresses: [home] } },
      ],
      'DELETE /api/hc/customers/me/addresses/a2': { status: 204 },
    });
    render(<AccountAddresses />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Nadia Office' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete address' }),
    );
    expect(await screen.findByText('Nadia Office address deleted')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/a2'))).toBe(true);
    expect(calls.find((c) => c.method === 'DELETE')?.headers['x-hc-request']).toBe('storefront');
    await waitFor(() => expect(cardItems()).toHaveLength(1));
  });

  it('does not claim a delete that the API refused', async () => {
    installFetchMock({
      'GET /api/hc/customers/me/addresses': { body: { addresses: [home, office] } },
      'DELETE /api/hc/customers/me/addresses/a2': {
        status: 409,
        body: {
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Address is in use',
          correlationId: 'c',
        },
      },
    });
    render(<AccountAddresses />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Nadia Office' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete address' }),
    );
    expect(await screen.findByText('Address is in use')).toBeInTheDocument();
    expect(screen.queryByText('Nadia Office address deleted')).not.toBeInTheDocument();
    expect(cardItems()).toHaveLength(2);
  });

  it('sets another address as default through PUT …/default', async () => {
    const calls = installFetchMock({
      'GET /api/hc/customers/me/addresses': [
        { body: { addresses: [home, office] } },
        {
          body: {
            addresses: [
              { ...home, isDefault: false },
              { ...office, isDefault: true },
            ],
          },
        },
      ],
      'PUT /api/hc/customers/me/addresses/a2/default': { body: { ...office, isDefault: true } },
    });
    render(<AccountAddresses />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set as default' }));
    expect(await screen.findByText('Nadia Office is now your default address')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT' && c.url.endsWith('/a2/default'))).toBe(true);
  });

  it('validates the add form locally and sends nothing when it is incomplete', async () => {
    const calls = installFetchMock({
      'GET /api/hc/customers/me/addresses': { body: { addresses: [home] } },
    });
    render(<AccountAddresses />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add address' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save address' }));
    expect(within(dialog).getAllByText('Select a governorate').length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('creates an address with the API field mapping', async () => {
    const calls = installFetchMock({
      'GET /api/hc/customers/me/addresses': [
        { body: { addresses: [home] } },
        {
          body: {
            addresses: [
              home,
              {
                ...office,
                id: 'a3',
                recipientName: 'New Person',
                line1: '5 Nile Street',
                line2: null,
              },
            ],
          },
        },
      ],
      'POST /api/hc/customers/me/addresses': {
        status: 201,
        body: { ...office, id: 'a3', isDefault: false },
      },
    });
    render(<AccountAddresses />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add address' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Full name'), {
      target: { value: 'New Person' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Mobile number/), {
      target: { value: '101 111 2222' },
    });
    fireEvent.change(within(dialog).getByLabelText('Governorate'), { target: { value: 'Giza' } });
    fireEvent.change(within(dialog).getByLabelText('City / area'), { target: { value: 'Dokki' } });
    fireEvent.change(within(dialog).getByLabelText('Street address'), {
      target: { value: '5 Nile Street' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save address' }));
    expect(await screen.findByText('Address added')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      recipientName: 'New Person',
      line1: '5 Nile Street',
      line2: null,
      city: 'Dokki',
      region: 'Giza',
      postalCode: null,
      countryCode: 'EG',
      phone: '+20 101 111 2222',
    });
  });

  it('shows the API validation message in the dialog and keeps it open', async () => {
    installFetchMock({
      'GET /api/hc/customers/me/addresses': { body: { addresses: [home] } },
      'POST /api/hc/customers/me/addresses': {
        status: 400,
        body: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          correlationId: 'c',
        },
      },
    });
    render(<AccountAddresses />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add address' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Full name'), {
      target: { value: 'New Person' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Mobile number/), {
      target: { value: '101 111 2222' },
    });
    fireEvent.change(within(dialog).getByLabelText('Governorate'), { target: { value: 'Giza' } });
    fireEvent.change(within(dialog).getByLabelText('City / area'), { target: { value: 'Dokki' } });
    fireEvent.change(within(dialog).getByLabelText('Street address'), {
      target: { value: '5 Nile Street' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save address' }));
    expect(await within(dialog).findByText('Request validation failed')).toBeInTheDocument();
    expect(screen.queryByText('Address added')).not.toBeInTheDocument();
  });
});

describe('AccountAddresses (Arabic RTL)', () => {
  it('renders the Arabic layout over the same real data', async () => {
    installFetchMock({ 'GET /api/hc/customers/me/addresses': { body: { addresses: [home] } } });
    render(<AccountAddresses lang="ar" />);
    expect(await screen.findByText('العناوين')).toBeInTheDocument();
    expect(document.querySelector('section[dir="rtl"]')).not.toBeNull();
    await waitFor(() => expect(cardItems()).toHaveLength(1));
    expect(cardItems()[0]?.textContent).toContain('القاهرة');
  });
});
