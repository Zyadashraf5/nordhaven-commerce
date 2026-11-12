import { api } from '../../lib/api/browser';
import type { AdminCustomerDetail, AdminCustomerRow } from '../../lib/api/admin-types';
import { readAllPages } from './admin-data';

/**
 * The admin order contract carries no customer field. The customer contract
 * lists each customer's order ids (newest 500), so the owner of an order is
 * found by reading the customers who have orders. Fine at test-store size;
 * a direct `customerId` on the admin order would remove these extra reads
 * (documented as a contract gap in the F06 handoff).
 */
export async function loadOrderOwners(): Promise<
  Map<string, { customerId: string; email: string | null }>
> {
  const { items } = await readAllPages<AdminCustomerRow>('admin/customers', 'customers');
  const withOrders = items.filter((customer) => customer.orderCount > 0);
  const details = await Promise.all(
    withOrders.map((customer) =>
      api.get<AdminCustomerDetail>(`admin/customers/${customer.customerId}`),
    ),
  );
  const owners = new Map<string, { customerId: string; email: string | null }>();
  for (const detail of details) {
    for (const orderId of detail.orderIds)
      owners.set(orderId, { customerId: detail.customerId, email: detail.email });
  }
  return owners;
}
