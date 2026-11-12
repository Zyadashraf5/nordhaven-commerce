'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatMoney } from '../../data/money';
import { api } from '../../lib/api/browser';
import type {
  AdminBrand,
  AdminCategory,
  AdminInventoryItem,
  AdminProduct,
  AdminProductSummary,
} from '../../lib/api/admin-types';
import {
  AdminLoad,
  AdminNotice,
  parseMinor,
  readAllPages,
  useAdminAction,
  useAdminLoader,
} from './admin-data';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin catalog products list (Stage 5 admin boards), live (F06): every
 * product in every state from `GET /admin/catalog/products`, with stock summed
 * from `GET /admin/inventory`. "New product" creates a DRAFT through
 * `POST /admin/catalog/products` and opens it for variants, images and
 * publishing.
 */

interface Data {
  products: AdminProductSummary[];
  stock: Map<string, { onHand: number; available: number; skus: number }>;
  categories: AdminCategory[];
  brands: AdminBrand[];
  complete: boolean;
}

async function loadData(): Promise<Data> {
  const [products, inventory, categories, brands] = await Promise.all([
    readAllPages<AdminProductSummary>('admin/catalog/products', 'items'),
    readAllPages<AdminInventoryItem>('admin/inventory', 'items'),
    api.get<{ categories: AdminCategory[] }>('admin/catalog/categories'),
    api.get<{ brands: AdminBrand[] }>('admin/catalog/brands'),
  ]);
  const stock = new Map<string, { onHand: number; available: number; skus: number }>();
  for (const item of inventory.items) {
    if (item.productId === null) continue;
    const row = stock.get(item.productId) ?? { onHand: 0, available: 0, skus: 0 };
    row.onHand += item.onHand;
    row.available += item.available;
    row.skus += 1;
    stock.set(item.productId, row);
  }
  return {
    products: products.items,
    stock,
    categories: categories.categories,
    brands: brands.brands,
    complete: products.complete && inventory.complete,
  };
}

export const flatCategories = (tree: AdminCategory[]): { id: string; label: string }[] =>
  tree.flatMap((node) => [
    { id: node.id, label: node.name },
    ...node.children.map((child) => ({ id: child.id, label: `${node.name} › ${child.name}` })),
  ]);

const STATUS_LABEL = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' } as const;

export function AdminCatalogProductsPage() {
  const { state, reload } = useAdminLoader(loadData, []);
  const [creating, setCreating] = useState(false);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h1 className={styles.sectionTitle}>Products</h1>
        <p className={styles.sectionIntro}>
          Every product in every state, with stock from the inventory records. Open a product to
          edit its details, variants, images, attributes and status.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? 'Close' : 'New product'}
          </button>
        </div>

        <AdminLoad state={state} onRetry={() => void reload()} what="products">
          {(data) => (
            <>
              {creating ? (
                <NewProductForm categories={data.categories} brands={data.brands} />
              ) : null}
              {!data.complete ? (
                <p className={styles.fieldHelp}>Showing the first 1,000 records; more exist.</p>
              ) : null}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Status</th>
                      <th className={styles.textRight}>Price</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody data-rows>
                    {data.products.map((product) => {
                      const stock = data.stock.get(product.id);
                      return (
                        <tr key={product.id} className={styles.tableRow}>
                          <td className={styles.tableCell}>
                            <div style={{ fontWeight: 600 }}>{product.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
                              {product.brand.name} · {product.category.name}
                            </div>
                          </td>
                          <td className={styles.tableCell}>{STATUS_LABEL[product.status]}</td>
                          <td className={`${styles.tableCell} ${styles.textRight}`}>
                            <span className="numerals">
                              {formatMoney({
                                amountMinor: product.effectivePriceMinor,
                                currency: 'EGP',
                              })}
                            </span>
                            {product.discountBasisPoints > 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--hw-text-secondary)' }}>
                                −{product.discountBasisPoints / 100}% of{' '}
                                {formatMoney({
                                  amountMinor: product.basePriceMinor,
                                  currency: 'EGP',
                                })}
                              </div>
                            ) : null}
                          </td>
                          <td className={styles.tableCell}>
                            {stock === undefined
                              ? 'Not tracked'
                              : stock.available === 0
                                ? `Out of stock · ${stock.skus} SKU${stock.skus === 1 ? '' : 's'}`
                                : `${stock.available} available · ${stock.skus} SKU${stock.skus === 1 ? '' : 's'}`}
                          </td>
                          <td className={styles.tableCell}>
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
            </>
          )}
        </AdminLoad>
      </section>
    </div>
  );
}

function NewProductForm({
  categories,
  brands,
}: {
  categories: AdminCategory[];
  brands: AdminBrand[];
}) {
  const router = useRouter();
  const { run, busy, notice, setNotice } = useAdminAction();
  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    brandId: '',
    price: '',
  });
  const options = flatCategories(categories);

  const submit = async () => {
    const priceMinor = parseMinor(form.price);
    if (
      form.name.trim() === '' ||
      form.description.trim() === '' ||
      form.categoryId === '' ||
      form.brandId === '' ||
      priceMinor === null
    ) {
      setNotice({
        tone: 'error',
        text: 'Fill in the name, description, category, brand and a price like 1250 or 1250.50.',
      });
      return;
    }
    const created = await run('create', () =>
      api.post<AdminProduct>('admin/catalog/products', {
        name: form.name.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId,
        brandId: form.brandId,
        basePriceMinor: priceMinor,
        baseCurrency: 'EGP',
      }),
    );
    if (created !== null) router.push(`/admin/catalog/products/${created.id}`);
  };

  return (
    <form
      className={styles.dialogForm}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className={styles.subsectionTitle}>New product (created as a draft)</h2>
      <AdminNotice notice={notice} />
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="np-name">
          Product name
        </label>
        <input
          id="np-name"
          className={styles.textField}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="np-desc">
          Description
        </label>
        <textarea
          id="np-desc"
          className={styles.textField}
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="np-cat">
          Category
        </label>
        <select
          id="np-cat"
          className={styles.textField}
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
        >
          <option value="">Choose a category</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="np-brand">
          Brand
        </label>
        <select
          id="np-brand"
          className={styles.textField}
          value={form.brandId}
          onChange={(e) => setForm({ ...form, brandId: e.target.value })}
        >
          <option value="">Choose a brand</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.formColumn}>
        <label className={styles.fieldLabel} htmlFor="np-price">
          Base price
        </label>
        <div className={styles.priceInputGroup}>
          <span className={styles.currencyLabel}>EGP</span>
          <input
            id="np-price"
            className={styles.textField}
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={busy !== null}>
          {busy !== null ? 'Creating…' : 'Create draft'}
        </button>
      </div>
    </form>
  );
}
