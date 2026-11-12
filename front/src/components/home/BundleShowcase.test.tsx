import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StorefrontUiProvider } from '../providers/StorefrontUiProvider';
import { BundleShowcase } from './BundleShowcase';
import { homepageSample } from '../../data/homepage-sample';

function renderBundles() {
  return render(
    <StorefrontUiProvider>
      <BundleShowcase section={homepageSample.bundleSection} bundles={homepageSample.bundles} />
    </StorefrontUiProvider>,
  );
}

describe('BundleShowcase', () => {
  it('labels each bundle with the kind of set it is', () => {
    renderBundles();
    expect(screen.getByText('Ready-packed set')).toBeInTheDocument();
    expect(screen.getByText('Set of individual items')).toBeInTheDocument();
  });

  it('shows a fixed bundle as one packed set with its own stock', () => {
    renderBundles();
    const card = screen.getByRole('heading', { name: 'The First Kitchen Set' }).closest('article');
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByText('In stock as a packed set')).toBeInTheDocument();
    expect(scope.getByText('Has its own stock. Contents are fixed.')).toBeInTheDocument();
    expect(
      scope.getByText('Enamelled Cast-Iron Casserole, 24 cm · Terracotta'),
    ).toBeInTheDocument();
  });

  it('shows a dynamic bundle as the status of each of its components', () => {
    renderBundles();
    const card = screen.getByRole('heading', { name: 'Morning Coffee Set' }).closest('article');
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getAllByText('All 3 items in stock').length).toBeGreaterThan(0);
    expect(scope.getByText('Available only while every item is in stock.')).toBeInTheDocument();
    expect(scope.getAllByText('✓ In stock')).toHaveLength(3);
  });

  it('offers "View set" and never an add-to-cart action for a bundle', () => {
    renderBundles();
    expect(screen.getAllByRole('link', { name: 'View set' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull();
  });
});
