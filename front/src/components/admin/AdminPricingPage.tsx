'use client';

import { fire } from '../../lib/fire';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '../../components/ui/Icon';
import { formatMoney } from '../../data/money';
import { api } from '../../lib/api/browser';
import type { AdminProductSummary } from '../../lib/api/admin-types';
import { AdminLoad, AdminNotice, readAllPages, useAdminAction, useAdminLoader } from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin pricing & promotions (Stage 5 admin boards), live (F06). Each
 * product's base price, its direct discount and the effective price the store
 * charges. A discount is set with `PUT /admin/catalog/products/{id}/discount`
 * (whole percent → basis points; 0 removes it) and the backend recomputes the
 * effective price. Base prices are edited on the product. The approved launch
 * scope has direct product discounts only, so there is no promotion model.
 */
export function AdminPricingPage() {
  const { productId } = useParams();
  const focus = typeof productId === 'string' ? productId : '';
  const [tab, setTab] = useState<'prices' | 'promotions'>('prices');
  const { state, reload } = useAdminLoader(
    () => readAllPages<AdminProductSummary>('admin/catalog/products', 'items'),
    [],
  );
  const { run, busy, notice } = useAdminAction();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Pricing &amp; promotions</h1>
        <p className={styles.sectionIntro}>
          Base price, direct discount and the effective price customers pay. Base prices are edited
          on each product.
        </p>

        <div role="tablist" aria-label="Pricing views" className={styles.tabs}>
          {(
            [
              { id: 'prices', label: 'Prices' },
              { id: 'promotions', label: 'Promotions' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.adminTab} ${tab === t.id ? styles.adminTabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AdminNotice notice={notice} />

        {tab === 'prices' ? (
          <AdminLoad state={state} onRetry={() => void reload()} what="prices">
            {({ items }) => (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.tableCell}>Product</th>
                      <th className={styles.tableCell}>Base price</th>
                      <th className={styles.tableCell}>Discount</th>
                      <th className={styles.tableCell}>Effective price</th>
                      <th className={styles.tableCell}>Status</th>
                      <th className={styles.tableCell}>Actions</th>
                    </tr>
                  </thead>
                  <tbody data-rows>
                    {items.map((product) => {
                      const current = String(product.discountBasisPoints / 100);
                      const draft = drafts[product.id] ?? current;
                      const percent = Number(draft);
                      const valid =
                        /^\d{1,2}(\.\d{1,2})?$/.test(draft) && percent >= 0 && percent < 100;
                      return (
                        <tr
                          key={product.id}
                          className={styles.tableRow}
                          style={
                            product.id === focus
                              ? { backgroundColor: 'var(--hw-bg-well)' }
                              : undefined
                          }
                        >
                          <td className={styles.tableCell}>
                            <span style={{ fontWeight: 600 }}>{product.name}</span>
                          </td>
                          <td className={styles.tableCell}>
                            <span className={styles.numerals}>
                              {formatMoney({
                                amountMinor: product.basePriceMinor,
                                currency: 'EGP',
                              })}
                            </span>
                          </td>
                          <td className={styles.tableCell}>
                            <label
                              className={styles.fieldLabel}
                              htmlFor={`disc-${product.id}`}
                              style={{ display: 'block' }}
                            >
                              Discount % for {product.name}
                            </label>
                            <input
                              id={`disc-${product.id}`}
                              className={styles.textField}
                              inputMode="decimal"
                              style={{ width: 90 }}
                              value={draft}
                              onChange={(e) =>
                                setDrafts({ ...drafts, [product.id]: e.target.value })
                              }
                            />
                          </td>
                          <td className={styles.tableCell}>
                            <span className={styles.numerals}>
                              {formatMoney({
                                amountMinor: product.effectivePriceMinor,
                                currency: 'EGP',
                              })}
                            </span>
                          </td>
                          <td className={styles.tableCell}>
                            {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                          </td>
                          <td className={styles.tableCell}>
                            <button
                              type="button"
                              className={styles.btnPrimary}
                              style={{ height: 32, padding: '0 10px', fontSize: 13 }}
                              disabled={!valid || draft === current || busy !== null}
                              onClick={fire(async () => {
                                const basisPoints = Math.round(percent * 100);
                                const done = await run(
                                  product.id,
                                  () =>
                                    api.put(`admin/catalog/products/${product.id}/discount`, {
                                      basisPoints,
                                    }),
                                  basisPoints === 0
                                    ? `Discount removed from ${product.name}.`
                                    : `${product.name}: ${percent}% discount saved.`,
                                );
                                if (done !== null) {
                                  setDrafts((all) => {
                                    const next = { ...all };
                                    delete next[product.id];
                                    return next;
                                  });
                                  void reload();
                                }
                              })}
                            >
                              {busy === product.id ? 'Saving…' : 'Save'}
                            </button>{' '}
                            <Link
                              href={`/admin/catalog/products/${product.id}`}
                              className={styles.btnOutline}
                              style={{ height: 32, padding: '0 10px', fontSize: 13 }}
                            >
                              Edit
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AdminLoad>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <Icon name="coin" size={24} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h3 className={styles.emptyTitle}>No promotions are configured</h3>
            <p className={styles.emptyBody}>
              The approved launch scope supports direct product discounts only (Prices tab); the
              backend has no promotion model.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
