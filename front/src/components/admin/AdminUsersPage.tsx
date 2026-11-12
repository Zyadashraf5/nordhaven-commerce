'use client';

import { api } from '../../lib/api/browser';
import type {
  AdminCheckoutDestination,
  AdminShippingDestination,
  AdminShippingMethod,
  AdminTaxRule,
  AdminUser,
} from '../../lib/api/admin-types';
import { AdminLoad, adminDate, egpMinor, readAllPages, useAdminLoader } from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin settings (Stage 5 admin boards), live (F06):
 * - users & roles: `GET /admin/users` (the contract has no names, MFA flag or last-seen, and no
 *   role changes);
 * - checkout configuration, read-only: checkout destinations, shipping destinations and methods,
 *   tax rules. Changing them is a business decision (HC-DEC-004: production tax, shipping and
 *   payment rules are not approved), so this screen shows them and marks TEST configuration
 *   clearly instead of offering edits.
 */
export function AdminUsersPage() {
  const users = useAdminLoader(() => readAllPages<AdminUser>('admin/users', 'users'), []);
  const config = useAdminLoader(async () => {
    const [checkout, shippingDestinations, methods, rules] = await Promise.all([
      api.get<{ destinations: AdminCheckoutDestination[] }>('admin/checkout/destinations'),
      api.get<{ destinations: AdminShippingDestination[] }>('admin/shipping/destinations'),
      api.get<{ methods: AdminShippingMethod[] }>('admin/shipping/methods'),
      api.get<{ rules: AdminTaxRule[] }>('admin/tax/rules'),
    ]);
    return {
      checkout: checkout.destinations,
      shipping: shippingDestinations.destinations,
      methods: methods.methods,
      rules: rules.rules,
    };
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Users &amp; roles</h1>
        <p className={styles.sectionIntro}>
          Accounts and their role. Administrators sign in with a second factor. Roles can’t be
          changed here — the API has no role management.
        </p>
        <AdminLoad state={users.state} onRetry={() => void users.reload()} what="users">
          {({ items }) => (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody data-rows>
                  {items.map((u) => (
                    <tr key={u.id} className={styles.tableRow}>
                      <td className={styles.tableCell}>{u.email}</td>
                      <td className={styles.tableCell}>
                        {u.role === 'ADMIN' ? 'Administrator (MFA required)' : 'Customer'}
                      </td>
                      <td className={styles.tableCell}>{adminDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminLoad>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Checkout configuration</h2>
        <p className={styles.sectionIntro}>
          Read-only. Production tax rules, shipping rules and a payment provider are not approved
          yet (HC-DEC-004); anything marked TEST exists only so the test store can take test orders.
        </p>
        <AdminLoad
          state={config.state}
          onRetry={() => void config.reload()}
          what="checkout configuration"
        >
          {(c) => (
            <>
              <h3 className={styles.subsectionTitle}>Destinations</h3>
              {c.checkout.length === 0 ? (
                <p className={styles.fieldHelp}>None — checkout is closed for every country.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>Checkout</th>
                        <th>Shipping approved</th>
                        <th>Tax jurisdiction</th>
                        <th>Shipping destination</th>
                      </tr>
                    </thead>
                    <tbody data-rows>
                      {c.checkout.map((d) => {
                        const ship = c.shipping.find((s) => s.countryCode === d.countryCode);
                        return (
                          <tr key={d.countryCode} className={styles.tableRow}>
                            <td className={styles.tableCell}>
                              {d.label} ({d.countryCode})
                            </td>
                            <td className={styles.tableCell}>
                              {d.enabled ? 'Enabled' : 'Disabled'}
                            </td>
                            <td className={styles.tableCell}>
                              {d.shippingApproved ? 'Yes' : 'No'}
                            </td>
                            <td className={styles.tableCell}>{d.taxJurisdiction}</td>
                            <td className={styles.tableCell}>
                              {ship === undefined
                                ? '—'
                                : `${ship.enabled ? 'Enabled' : 'Disabled'} · ${ship.environment} · carrier ${ship.carrierCode ?? 'none'}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <h3 className={styles.subsectionTitle}>Shipping methods</h3>
              {c.methods.length === 0 ? (
                <p className={styles.fieldHelp}>None.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Destination</th>
                        <th className={styles.textRight}>Amount</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody data-rows>
                      {c.methods.map((m) => (
                        <tr key={m.id} className={styles.tableRow}>
                          <td className={styles.tableCell}>
                            {m.label} <span className="numerals">({m.code})</span>
                          </td>
                          <td className={styles.tableCell}>{m.destinationCountryCode ?? 'Any'}</td>
                          <td className={`${styles.tableCell} ${styles.textRight}`}>
                            {egpMinor(m.amountMinor, m.currency)}
                          </td>
                          <td className={styles.tableCell}>
                            {m.active ? 'Active' : 'Inactive'} · {m.environment}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className={styles.fieldHelp}>
                The platform collects no shipping charge and computes no rate; amounts are
                configuration only.
              </p>
              <h3 className={styles.subsectionTitle}>Tax rules</h3>
              {c.rules.length === 0 ? (
                <p className={styles.fieldHelp}>None.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Jurisdiction</th>
                        <th>Classification</th>
                        <th>Rate</th>
                        <th>Prices</th>
                        <th>From</th>
                        <th>Environment</th>
                      </tr>
                    </thead>
                    <tbody data-rows>
                      {c.rules.map((r) => (
                        <tr key={r.id} className={styles.tableRow}>
                          <td className={styles.tableCell}>{r.jurisdiction}</td>
                          <td className={styles.tableCell}>{r.classification}</td>
                          <td className={styles.tableCell}>{r.rateBasisPoints / 100}%</td>
                          <td className={styles.tableCell}>
                            {r.taxInclusive ? 'Include tax' : 'Exclude tax'}
                          </td>
                          <td className={styles.tableCell}>{adminDate(r.effectiveFrom)}</td>
                          <td className={styles.tableCell}>
                            {r.environment === 'TEST'
                              ? 'TEST (not approved for production)'
                              : 'Production'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </AdminLoad>
      </section>
    </div>
  );
}
