import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminSidebar } from './AdminSidebar';

describe('AdminSidebar', () => {
  it('routes Pre-orders to its own page, not the orders list', () => {
    render(<AdminSidebar activeLabel="Pre-orders" />);
    expect(screen.getByRole('link', { name: 'Pre-orders' })).toHaveAttribute(
      'href',
      '/admin/pre-orders',
    );
  });

  it('exposes every admin section as a route link', () => {
    render(<AdminSidebar />);
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/admin/orders');
    expect(screen.getByRole('link', { name: 'Returns' })).toHaveAttribute('href', '/admin/returns');
    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/admin/customers',
    );
    expect(screen.getByRole('link', { name: 'Audit log' })).toHaveAttribute('href', '/admin/audit');
  });

  it('marks the active section', () => {
    render(<AdminSidebar activeLabel="Orders" />);
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });
});
