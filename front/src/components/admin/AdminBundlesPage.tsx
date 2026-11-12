'use client';

import { fire } from '../../lib/fire';
import { useEffect, useState } from 'react';
import { formatMoney } from '../../data/money';
import { api } from '../../lib/api/browser';
import type { AdminBundle, AdminProduct, AdminProductSummary } from '../../lib/api/admin-types';
import {
  AdminEmpty,
  AdminLoad,
  AdminNotice,
  readAllPages,
  useAdminAction,
  useAdminLoader,
} from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin bundles (Stage 5 admin boards), live (F06): `GET/POST/DELETE /admin/bundles`.
 * - FIXED ("ready-packed set"): an independently stocked finished good. Assembling consumes
 *   component stock and adds finished sets (`POST …/assemble`); disassembling reverses it and
 *   is refused for reserved stock.
 * - DYNAMIC ("set of individual items"): no stock of its own; availability is derived from
 *   its components, so there is nothing to assemble.
 * One bundle per product: the bundle's price is its product's price. The storefront can't
 * sell bundles yet (no public bundle catalogue) — see the F06 handoff.
 */

interface Data {
  bundles: AdminBundle[];
  products: AdminProductSummary[];
}

export function AdminBundlesPage() {
  const { state, reload } = useAdminLoader<Data>(async () => {
    const [bundles, products] = await Promise.all([
      api.get<{ bundles: AdminBundle[] }>('admin/bundles'),
      readAllPages<AdminProductSummary>('admin/catalog/products', 'items'),
    ]);
    return { bundles: bundles.bundles, products: products.items };
  }, []);
  const action = useAdminAction();
  const [creating, setCreating] = useState(false);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Bundles</h1>
        <p className={styles.sectionIntro}>
          Ready-packed sets hold their own stock (assemble them from components); sets of individual
          items are available while every component is.
        </p>
        <AdminNotice notice={action.notice} />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? 'Close' : 'New bundle'}
          </button>
        </div>
        <AdminLoad state={state} onRetry={() => void reload()} what="bundles">
          {(data) => (
            <>
              {creating ? (
                <NewBundle
                  data={data}
                  action={action}
                  onCreated={() => {
                    setCreating(false);
                    void reload();
                  }}
                />
              ) : null}
              {data.bundles.length === 0 ? (
                <AdminEmpty
                  icon="package"
                  title="No bundles yet"
                  body="Create a bundle from an existing product and its component SKUs."
                />
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Bundle</th>
                        <th>Kind</th>
                        <th className={styles.textRight}>Price</th>
                        <th className={styles.textRight}>Available</th>
                        <th>Components</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody data-rows>
                      {data.bundles.map((bundle) => (
                        <BundleRow
                          key={bundle.id}
                          bundle={bundle}
                          product={data.products.find((p) => p.id === bundle.productId)}
                          action={action}
                          onSaved={() => void reload()}
                        />
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

function BundleRow({
  bundle,
  product,
  action,
  onSaved,
}: {
  bundle: AdminBundle;
  product: AdminProductSummary | undefined;
  action: ReturnType<typeof useAdminAction>;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState('1');
  const [removing, setRemoving] = useState(false);
  const valid = /^[1-9]\d*$/.test(qty);
  const stockOp = async (op: 'assemble' | 'disassemble') => {
    const done = await action.run(
      op,
      () => api.post(`admin/bundles/${bundle.id}/${op}`, { quantity: Number(qty), note: null }),
      `${bundle.name}: ${op === 'assemble' ? 'assembled' : 'disassembled'} ${qty}.`,
    );
    if (done !== null) onSaved();
  };
  return (
    <tr className={styles.tableRow}>
      <td className={styles.tableCell}>
        <div style={{ fontWeight: 600 }}>{bundle.name}</div>
        <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
          {product?.name ?? 'Product not found'}
        </div>
      </td>
      <td className={styles.tableCell}>
        {bundle.kind === 'FIXED' ? 'Ready-packed set' : 'Set of individual items'}
      </td>
      <td className={`${styles.tableCell} ${styles.textRight}`}>
        <span className="numerals">
          {product !== undefined
            ? formatMoney({ amountMinor: product.effectivePriceMinor, currency: 'EGP' })
            : '—'}
        </span>
      </td>
      <td className={`${styles.tableCell} ${styles.textRight}`}>
        <span className="numerals">{bundle.available}</span>
      </td>
      <td className={styles.tableCell}>
        {bundle.components.map((c) => (
          <div key={c.id} className="numerals">
            {c.sku} × {c.quantity ?? `${c.minQuantity ?? 0}–${c.maxQuantity ?? '∞'}`}
          </div>
        ))}
      </td>
      <td className={styles.tableCell}>
        {bundle.kind === 'FIXED' ? (
          <div className={styles.filterBar}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={`bq-${bundle.id}`}>
                Sets
              </label>
              <input
                id={`bq-${bundle.id}`}
                className={styles.textField}
                inputMode="numeric"
                style={{ width: 70 }}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.btnOutline}
              disabled={!valid || action.busy !== null}
              onClick={() => void stockOp('assemble')}
            >
              Assemble
            </button>
            <button
              type="button"
              className={styles.btnOutline}
              disabled={!valid || action.busy !== null}
              onClick={() => void stockOp('disassemble')}
            >
              Disassemble
            </button>
          </div>
        ) : (
          <span className={styles.fieldHelp}>Stock comes from its components.</span>
        )}
        {removing ? (
          <>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={action.busy !== null}
              onClick={fire(async () => {
                const done = await action.run(
                  'delete',
                  () => api.delete(`admin/bundles/${bundle.id}`),
                  `Bundle “${bundle.name}” deleted.`,
                );
                setRemoving(false);
                if (done !== null) onSaved();
              })}
            >
              Confirm delete
            </button>{' '}
            <button type="button" className={styles.btnOutline} onClick={() => setRemoving(false)}>
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.btnOutline}
            disabled={action.busy !== null}
            onClick={() => setRemoving(true)}
          >
            Delete…
          </button>
        )}
      </td>
    </tr>
  );
}

function NewBundle({
  data,
  action,
  onCreated,
}: {
  data: Data;
  action: ReturnType<typeof useAdminAction>;
  onCreated: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [kind, setKind] = useState<'FIXED' | 'DYNAMIC'>('FIXED');
  const [name, setName] = useState('');
  const [components, setComponents] = useState<{ variantId: string; quantity: string }[]>([
    { variantId: '', quantity: '1' },
  ]);
  const [variants, setVariants] = useState<{ id: string; label: string }[] | null>(null);
  const used = new Set(data.bundles.map((b) => b.productId));

  useEffect(() => {
    let live = true;
    Promise.all(data.products.map((p) => api.get<AdminProduct>(`admin/catalog/products/${p.id}`)))
      .then((details) => {
        if (live)
          setVariants(
            details.flatMap((p) =>
              p.variants.map((v) => ({ id: v.id, label: `${v.sku} · ${p.name}` })),
            ),
          );
      })
      .catch(() => {
        if (live) setVariants([]);
      });
    return () => {
      live = false;
    };
  }, [data.products]);

  const valid =
    productId !== '' &&
    name.trim() !== '' &&
    components.length > 0 &&
    components.every((c) => c.variantId !== '' && /^[1-9]\d*$/.test(c.quantity));

  return (
    <form
      className={styles.dialogForm}
      noValidate
      onSubmit={fire(async (event) => {
        event.preventDefault();
        if (!valid) return;
        const done = await action.run(
          'create',
          () =>
            api.post('admin/bundles', {
              productId,
              kind,
              name: name.trim(),
              components: components.map((c, position) => ({
                variantId: c.variantId,
                quantity: Number(c.quantity),
                position,
              })),
            }),
          `Bundle “${name.trim()}” created.`,
        );
        if (done !== null) onCreated();
      })}
    >
      <h2 className={styles.subsectionTitle}>New bundle</h2>
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="nb-product">
          Product sold as the bundle
        </label>
        <select
          id="nb-product"
          className={styles.textField}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">Choose a product</option>
          {data.products
            .filter((p) => !used.has(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="nb-name">
          Bundle name
        </label>
        <input
          id="nb-name"
          className={styles.textField}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="nb-kind">
          Kind
        </label>
        <select
          id="nb-kind"
          className={styles.textField}
          value={kind}
          onChange={(e) => setKind(e.target.value as 'FIXED' | 'DYNAMIC')}
        >
          <option value="FIXED">Ready-packed set (own stock)</option>
          <option value="DYNAMIC">Set of individual items (component stock)</option>
        </select>
      </div>
      <h3 className={styles.fieldLabel}>Components</h3>
      {variants === null ? <p className={styles.fieldHelp}>Loading SKUs…</p> : null}
      {components.map((component, index) => (
        <div key={index} className={styles.filterBar}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`nb-sku-${index}`}>
              Component {index + 1}
            </label>
            <select
              id={`nb-sku-${index}`}
              className={styles.textField}
              value={component.variantId}
              onChange={(e) =>
                setComponents(
                  components.map((c, i) => (i === index ? { ...c, variantId: e.target.value } : c)),
                )
              }
            >
              <option value="">Choose a SKU</option>
              {(variants ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`nb-qty-${index}`}>
              Per set
            </label>
            <input
              id={`nb-qty-${index}`}
              className={styles.textField}
              inputMode="numeric"
              style={{ width: 70 }}
              value={component.quantity}
              onChange={(e) =>
                setComponents(
                  components.map((c, i) => (i === index ? { ...c, quantity: e.target.value } : c)),
                )
              }
            />
          </div>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => setComponents(components.filter((_, i) => i !== index))}
            disabled={components.length === 1}
          >
            Remove
          </button>
        </div>
      ))}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnOutline}
          onClick={() => setComponents([...components, { variantId: '', quantity: '1' }])}
        >
          Add component
        </button>
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={!valid || action.busy !== null}
        >
          {action.busy === 'create' ? 'Creating…' : 'Create bundle'}
        </button>
      </div>
    </form>
  );
}
