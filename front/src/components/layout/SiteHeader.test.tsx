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
import { SiteHeader } from './SiteHeader';
import { homepageSample } from '../../data/homepage-sample';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHeader() {
  return render(
    <StorefrontShell>
      <SiteHeader navigation={homepageSample.navigation} />
    </StorefrontShell>,
  );
}

describe('SiteHeader', () => {
  it('shows the brand, the search field and the account actions', async () => {
    installFetchMock({ 'GET /api/session': { body: signedOutSession } });
    renderHeader();
    expect(screen.getAllByLabelText('Nordhaven Commerce home').length).toBeGreaterThan(0);
    expect(
      screen.getAllByPlaceholderText('Search casseroles, plates, linen…').length,
    ).toBeGreaterThan(0);
    // Signed out there is no cart or wishlist: no sample counts.
    await waitFor(() =>
      expect(screen.getAllByLabelText(/^Cart, 0 items$/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByLabelText(/^Wishlist, 0 items$/).length).toBeGreaterThan(0);
  });

  it('offers the category scope of the search field', () => {
    renderHeader();
    const scope = screen.getAllByLabelText('Search in')[0] as HTMLSelectElement;
    expect(within(scope).getByRole('option', { name: 'Cookware' })).toBeInTheDocument();
    expect(within(scope).getByRole('option', { name: 'Textiles' })).toBeInTheDocument();
  });

  it('opens and closes the category menu', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: /All categories/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sets, ready to start with →')).toBeInTheDocument();
  });

  it('counts the signed-in customer’s real cart and wishlist', async () => {
    installFetchMock({
      'GET /api/session': { body: signedInSession },
      'GET /api/hc/cart': { body: cartOf(cartLine({ quantity: 2 })) },
      'GET /api/hc/customers/me/wishlist': {
        body: {
          items: [
            {
              id: 'w1',
              productId: 'p-casserole',
              productName: 'Enamelled Cast-Iron Casserole',
              productSlug: casseroleDetail.slug,
              currentPriceMinor: 484500,
              currentCurrency: 'EGP',
              purchasable: true,
              savedAt: '2026-10-24T08:00:00Z',
            },
          ],
        },
      },
      [`GET /api/hc/catalog/products/${casseroleDetail.slug}`]: { body: casseroleDetail },
    });
    renderHeader();
    await waitFor(() =>
      expect(screen.getAllByLabelText(/^Cart, 2 items$/).length).toBeGreaterThan(0),
    );
    const [cartLink] = screen.getAllByLabelText(/Cart, 2 items/);
    expect(cartLink).toHaveAttribute('href', '/cart');
    const [wishLink] = screen.getAllByLabelText(/Wishlist, 1 item$/);
    expect(wishLink).toHaveAttribute('href', '/wishlist');
  });

  it('keeps the account entry on the sign-in sheet', () => {
    renderHeader();
    fireEvent.click(screen.getAllByText('Sign in')[0] as HTMLElement);

    const sheet = screen.getByRole('dialog', { name: 'Sign in to your account' });
    expect(within(sheet).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Keep browsing' })).toBeInTheDocument();
  });
});
