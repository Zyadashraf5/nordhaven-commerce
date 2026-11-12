'use client';

import { fire } from '../../lib/fire';
import { useState } from 'react';
import { api } from '../../lib/api/browser';
import type { AdminBrand, AdminCategory, AdminProductSummary } from '../../lib/api/admin-types';
import { AdminLoad, AdminNotice, readAllPages, useAdminAction, useAdminLoader } from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin categories & brands (Stage 5 admin boards), live (F06):
 * `GET/POST/PATCH/DELETE /admin/catalog/categories` (two levels at most) and
 * `/admin/catalog/brands`. Product counts come from the product list. The
 * backend refuses to delete a category with children or products, or a brand
 * that products still use; that refusal is shown as is. Product attributes
 * are per product (edited on each product) — there is no attribute registry.
 */

interface Data {
  categories: AdminCategory[];
  brands: AdminBrand[];
  products: AdminProductSummary[];
}

export function AdminCategoriesPage() {
  const { state, reload } = useAdminLoader<Data>(async () => {
    const [categories, brands, products] = await Promise.all([
      api.get<{ categories: AdminCategory[] }>('admin/catalog/categories'),
      api.get<{ brands: AdminBrand[] }>('admin/catalog/brands'),
      readAllPages<AdminProductSummary>('admin/catalog/products', 'items'),
    ]);
    return { categories: categories.categories, brands: brands.brands, products: products.items };
  }, []);
  const action = useAdminAction();

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Categories &amp; brands</h1>
        <p className={styles.sectionIntro}>
          The category tree (two levels) and brands. Specifications are set per product on the
          product page.
        </p>
        <AdminNotice notice={action.notice} />
        <AdminLoad state={state} onRetry={() => void reload()} what="categories and brands">
          {(data) => (
            <>
              <CategoryTable data={data} action={action} onSaved={() => void reload()} />
              <BrandTable data={data} action={action} onSaved={() => void reload()} />
            </>
          )}
        </AdminLoad>
      </section>
    </div>
  );
}

type Action = ReturnType<typeof useAdminAction>;

function CategoryTable({
  data,
  action,
  onSaved,
}: {
  data: Data;
  action: Action;
  onSaved: () => void;
}) {
  const { run, busy } = action;
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const count = (id: string) => data.products.filter((p) => p.category.id === id).length;
  const rows = data.categories.flatMap((root) => [
    { node: root, depth: 0 },
    ...root.children.map((child) => ({ node: child, depth: 1 })),
  ]);

  const act = async (label: string, call: () => Promise<unknown>, success: string) => {
    const done = await run(label, call, success);
    if (done !== null) onSaved();
    return done;
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Categories</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Slug</th>
              <th className={styles.textRight}>Products</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody data-rows>
            {rows.map(({ node, depth }) => (
              <tr key={node.id} className={styles.tableRow}>
                <td
                  className={styles.tableCell}
                  style={{ paddingInlineStart: depth === 1 ? 28 : undefined }}
                >
                  {renaming?.id === node.id ? (
                    <input
                      aria-label={`New name for ${node.name}`}
                      className={styles.textField}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: node.id, name: e.target.value })}
                    />
                  ) : (
                    <>
                      {depth === 1 ? '› ' : ''}
                      {node.name}
                    </>
                  )}
                </td>
                <td className={styles.tableCell}>
                  <span className="numerals">{node.slug}</span>
                </td>
                <td className={`${styles.tableCell} ${styles.textRight}`}>
                  <span className="numerals">{count(node.id)}</span>
                </td>
                <td className={styles.tableCell}>
                  {renaming?.id === node.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={busy !== null || renaming.name.trim() === ''}
                        onClick={fire(async () => {
                          const done = await act(
                            'cat-rename',
                            () =>
                              api.patch(`admin/catalog/categories/${node.id}`, {
                                name: renaming.name.trim(),
                              }),
                            'Category renamed.',
                          );
                          if (done !== null) setRenaming(null);
                        })}
                      >
                        Save
                      </button>{' '}
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={() => setRenaming(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : removing === node.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={busy !== null}
                        onClick={fire(async () => {
                          await act(
                            'cat-delete',
                            () => api.delete(`admin/catalog/categories/${node.id}`),
                            `Category “${node.name}” deleted.`,
                          );
                          setRemoving(null);
                        })}
                      >
                        Confirm delete
                      </button>{' '}
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={() => setRemoving(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.btnOutline}
                        disabled={busy !== null}
                        onClick={() => setRenaming({ id: node.id, name: node.name })}
                      >
                        Rename
                      </button>{' '}
                      <button
                        type="button"
                        className={styles.btnOutline}
                        disabled={busy !== null}
                        onClick={() => setRemoving(node.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className={styles.filterBar}
        noValidate
        onSubmit={fire(async (event) => {
          event.preventDefault();
          if (name.trim() === '') return;
          const done = await act(
            'cat-create',
            () =>
              api.post('admin/catalog/categories', {
                name: name.trim(),
                parentId: parentId === '' ? null : parentId,
              }),
            `Category “${name.trim()}” created.`,
          );
          if (done !== null) {
            setName('');
            setParentId('');
          }
        })}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-cat">
            New category
          </label>
          <input
            id="new-cat"
            className={styles.textField}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-cat-parent">
            Inside
          </label>
          <select
            id="new-cat-parent"
            className={styles.textField}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">Top level</option>
            {data.categories.map((root) => (
              <option key={root.id} value={root.id}>
                {root.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={busy !== null || name.trim() === ''}
        >
          {busy === 'cat-create' ? 'Creating…' : 'Add category'}
        </button>
      </form>
    </section>
  );
}

function BrandTable({
  data,
  action,
  onSaved,
}: {
  data: Data;
  action: Action;
  onSaved: () => void;
}) {
  const { run, busy } = action;
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const count = (id: string) => data.products.filter((p) => p.brand.id === id).length;
  const act = async (label: string, call: () => Promise<unknown>, success: string) => {
    const done = await run(label, call, success);
    if (done !== null) onSaved();
    return done;
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Brands</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Slug</th>
              <th className={styles.textRight}>Products</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody data-rows>
            {data.brands.map((brand) => (
              <tr key={brand.id} className={styles.tableRow}>
                <td className={styles.tableCell}>
                  {renaming?.id === brand.id ? (
                    <input
                      aria-label={`New name for ${brand.name}`}
                      className={styles.textField}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: brand.id, name: e.target.value })}
                    />
                  ) : (
                    brand.name
                  )}
                </td>
                <td className={styles.tableCell}>
                  <span className="numerals">{brand.slug}</span>
                </td>
                <td className={`${styles.tableCell} ${styles.textRight}`}>
                  <span className="numerals">{count(brand.id)}</span>
                </td>
                <td className={styles.tableCell}>
                  {renaming?.id === brand.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={busy !== null || renaming.name.trim() === ''}
                        onClick={fire(async () => {
                          const done = await act(
                            'brand-rename',
                            () =>
                              api.patch(`admin/catalog/brands/${brand.id}`, {
                                name: renaming.name.trim(),
                              }),
                            'Brand renamed.',
                          );
                          if (done !== null) setRenaming(null);
                        })}
                      >
                        Save
                      </button>{' '}
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={() => setRenaming(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : removing === brand.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={busy !== null}
                        onClick={fire(async () => {
                          await act(
                            'brand-delete',
                            () => api.delete(`admin/catalog/brands/${brand.id}`),
                            `Brand “${brand.name}” deleted.`,
                          );
                          setRemoving(null);
                        })}
                      >
                        Confirm delete
                      </button>{' '}
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={() => setRemoving(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.btnOutline}
                        disabled={busy !== null}
                        onClick={() => setRenaming({ id: brand.id, name: brand.name })}
                      >
                        Rename
                      </button>{' '}
                      <button
                        type="button"
                        className={styles.btnOutline}
                        disabled={busy !== null}
                        onClick={() => setRemoving(brand.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className={styles.filterBar}
        noValidate
        onSubmit={fire(async (event) => {
          event.preventDefault();
          if (name.trim() === '') return;
          const done = await act(
            'brand-create',
            () => api.post('admin/catalog/brands', { name: name.trim() }),
            `Brand “${name.trim()}” created.`,
          );
          if (done !== null) setName('');
        })}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-brand">
            New brand
          </label>
          <input
            id="new-brand"
            className={styles.textField}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={busy !== null || name.trim() === ''}
        >
          {busy === 'brand-create' ? 'Creating…' : 'Add brand'}
        </button>
      </form>
    </section>
  );
}
