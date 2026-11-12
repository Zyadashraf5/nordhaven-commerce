import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import { signedOutSession } from '../../test/commerce-fixtures';
import { StorefrontShell } from '../providers/StorefrontShell';
import { ProductShowcase } from './ProductShowcase';
import { homepageSample } from '../../data/homepage-sample';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderShowcase() {
  return render(
    <StorefrontShell>
      <ProductShowcase products={homepageSample.products} />
    </StorefrontShell>,
  );
}

/**
 * The approved boards print slightly different copy on the wide and the narrow
 * layout, so both variants are in the document and one of them is hidden with a
 * media query. A helper keeps the assertions about the copy itself.
 */
function hasText(text: string): boolean {
  return screen.queryAllByText(text).length > 0;
}

describe('ProductShowcase', () => {
  it('shows the featured products by default', () => {
    renderShowcase();
    expect(screen.getByRole('heading', { name: 'Chosen for everyday use' })).toBeInTheDocument();
    expect(hasText('Enamelled Cast-Iron Casserole')).toBe(true);
    expect(hasText('Olive Wood Serving Board')).toBe(true);
    expect(hasText('Stoneware Mug, 350 ml')).toBe(true);
    expect(hasText('Stoneware Dinner Plates, Set of 4')).toBe(true);
    expect(hasText('Steel Hand Coffee Grinder')).toBe(false);
  });

  it('switches to the new-in list and hides the offer note', () => {
    renderShowcase();
    expect(
      hasText('Only products whose effective price is below their previous price appear here.'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'New in' }));

    expect(hasText('Steel Hand Coffee Grinder')).toBe(true);
    expect(hasText('Glass Coffee Server, 600 ml')).toBe(true);
    expect(hasText('Olive Wood Serving Board')).toBe(false);
  });

  it('explains what the on-offer list contains', () => {
    renderShowcase();
    fireEvent.click(screen.getByRole('tab', { name: 'On offer' }));
    expect(
      screen.getAllByText(
        'Only products whose effective price is below their previous price appear here.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('offers "Choose options" for a product that varies by two attributes', () => {
    renderShowcase();
    expect(screen.getByRole('button', { name: 'Choose options' })).toBeInTheDocument();
  });

  it('opens the variant sheet with the colour and size of the selected product', () => {
    renderShowcase();
    fireEvent.click(screen.getByRole('button', { name: 'Choose options' }));

    const dialog = screen.getByRole('dialog', { name: 'Choose options' });
    expect(within(dialog).getByRole('radio', { name: 'Terracotta' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: '24 cm · 4.2 L' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Add to cart/ })).toBeInTheDocument();
  });

  it('marks an unavailable colour as out of stock and disables the combination', () => {
    renderShowcase();
    fireEvent.click(screen.getByRole('button', { name: 'Choose options' }));

    const dialog = screen.getByRole('dialog', { name: 'Choose options' });
    const cream = within(dialog).getByRole('radio', { name: 'Cream, out of stock' });
    expect(cream).toBeInTheDocument();

    fireEvent.click(cream);
    expect(
      within(dialog).getByRole('button', { name: 'This combination is out of stock' }),
    ).toBeDisabled();
  });

  it('asks a signed-out visitor to sign in before adding to the cart', async () => {
    installFetchMock({ 'GET /api/session': { body: signedOutSession } });
    renderShowcase();
    // Once the session is known to be signed out, Add opens the sign-in sheet.
    await waitFor(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Add to cart' })[0] as HTMLElement);
      expect(
        screen.getByRole('dialog', { name: 'Sign in to add to your cart' }),
      ).toBeInTheDocument();
    });
    const sheet = screen.getByRole('dialog', { name: 'Sign in to add to your cart' });
    expect(within(sheet).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
