'use client';

import { fire } from '../../lib/fire';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Icon } from '../../components/ui/Icon';
import { formatMoney } from '../../data/money';
import { api } from '../../lib/api/browser';
import { normaliseImageUrl } from '../../lib/catalog-mapper';
import type {
  AdminBrand,
  AdminCategory,
  AdminProduct,
  AdminVariant,
  ProductStatus,
} from '../../lib/api/admin-types';
import { AdminLoad, AdminNotice, parseMinor, useAdminAction, useAdminLoader } from './admin-data';
import { flatCategories } from './AdminCatalogProductsPage';
import styles from '../admin/AdminLayout.module.css';

/**
 * Admin edit product (Stage 5 admin boards), live (F06). Each panel saves its
 * own part through its own contract, so a failure in one never silently
 * changes another:
 * - details      PATCH /admin/catalog/products/{id}
 * - status       PUT   …/{id}/status (publishing needs a sellable variant)
 * - images       PUT   …/{id}/images     (whole collection)
 * - attributes   PUT   …/{id}/attributes (whole collection)
 * - variants     POST  …/{id}/variants, PATCH/DELETE /admin/catalog/variants/{id}
 * - delete       DELETE …/{id} (refused while orders reference its SKUs)
 * Price discounts live on the Pricing screen; stock on the Inventory screen.
 */

interface Data {
  product: AdminProduct;
  categories: AdminCategory[];
  brands: AdminBrand[];
}

const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function AdminEditProductPage() {
  const { productId } = useParams();
  const id = typeof productId === 'string' ? productId : '';
  const { state, reload } = useAdminLoader<Data>(async () => {
    const [product, categories, brands] = await Promise.all([
      api.get<AdminProduct>(`admin/catalog/products/${encodeURIComponent(id)}`),
      api.get<{ categories: AdminCategory[] }>('admin/catalog/categories'),
      api.get<{ brands: AdminBrand[] }>('admin/catalog/brands'),
    ]);
    return { product, categories: categories.categories, brands: brands.brands };
  }, [id]);

  return (
    <div className={styles.page}>
      <AdminLoad state={state} onRetry={() => void reload()} what="this product">
        {(data) => <Editor data={data} onSaved={() => void reload()} />}
      </AdminLoad>
    </div>
  );
}

function Editor({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const { product } = data;
  const router = useRouter();
  const action = useAdminAction();
  const { run, busy } = action;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async <R,>(label: string, call: () => Promise<R>, success: string) => {
    const result = await run(label, call, success);
    if (result !== null) onSaved();
    return result;
  };

  return (
    <section className={styles.section}>
      <div className={styles.statRow}>
        <h1 className={styles.sectionTitle}>{product.name}</h1>
        <span className={styles.statLabel}>
          {STATUSES.find((s) => s.value === product.status)?.label}
        </span>
        <span className={`numerals ${styles.statRowTotal}`}>
          {formatMoney({ amountMinor: product.effectivePriceMinor, currency: 'EGP' })}
        </span>
      </div>
      <p className={styles.sectionIntro}>
        <Link href={`/products/${product.slug}`}>/products/{product.slug}</Link> ·{' '}
        {product.variants.length} variant{product.variants.length === 1 ? '' : 's'} · discounts on{' '}
        <Link href={`/admin/catalog/products/${product.id}/discount`}>Pricing</Link> · stock on{' '}
        <Link href="/admin/inventory">Inventory</Link>
      </p>
      <AdminNotice notice={action.notice} />

      <div className={styles.productFormWrapper}>
        <ImagesPanel product={product} busy={busy} save={save} />
        <DetailsPanel data={data} busy={busy} save={save} />
      </div>

      <StatusPanel product={product} busy={busy} save={save} />
      <VariantsPanel product={product} busy={busy} save={save} />
      <AttributesPanel product={product} busy={busy} save={save} />

      <section className={styles.section}>
        <h2 className={styles.subsectionTitle}>Delete product</h2>
        <p className={styles.fieldHelp}>
          Removes the product and its variants. The store refuses this while an order, cart or stock
          record still refers to one of its SKUs — archive it instead.
        </p>
        {confirmDelete ? (
          <div className={styles.actions}>
            <span className={styles.fieldHelp}>Delete “{product.name}” permanently?</span>
            <button
              type="button"
              className={styles.btnOutline}
              onClick={() => setConfirmDelete(false)}
              disabled={busy !== null}
            >
              Keep it
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy !== null}
              onClick={fire(async () => {
                const done = await run('delete', () =>
                  api.delete(`admin/catalog/products/${product.id}`),
                );
                setConfirmDelete(false);
                if (done !== null) router.push('/admin/catalog/products');
              })}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete product'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => setConfirmDelete(true)}
            disabled={busy !== null}
          >
            Delete product…
          </button>
        )}
      </section>
    </section>
  );
}

type Save = <R>(label: string, call: () => Promise<R>, success: string) => Promise<R | null>;

function DetailsPanel({ data, busy, save }: { data: Data; busy: string | null; save: Save }) {
  const { product } = data;
  const initial = {
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryId: product.category.id,
    brandId: product.brand.id,
    price: String(product.basePriceMinor / 100),
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(initial), [product.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const submit = async () => {
    const priceMinor = parseMinor(form.price);
    if (form.name.trim() === '' || form.description.trim() === '' || priceMinor === null) {
      setError('Name, description and a price like 1250 or 1250.50 are required.');
      return;
    }
    setError(null);
    await save(
      'details',
      () =>
        api.patch(`admin/catalog/products/${product.id}`, {
          name: form.name.trim(),
          slug: form.slug.trim(),
          description: form.description.trim(),
          categoryId: form.categoryId,
          brandId: form.brandId,
          basePriceMinor: priceMinor,
          baseCurrency: 'EGP',
        }),
      'Product details saved.',
    );
  };

  return (
    <section className={styles.section} style={{ flex: 1, minWidth: 260 }}>
      <h2 className={styles.subsectionTitle}>Details</h2>
      <form
        className={styles.dialogForm}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error !== null ? (
          <p className={styles.fieldHelp} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.formColumn}>
          <label className={styles.fieldLabel} htmlFor="prod-name">
            Product name
          </label>
          <input
            id="prod-name"
            className={styles.textField}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className={styles.formColumn}>
          <label className={styles.fieldLabel} htmlFor="prod-slug">
            URL slug
          </label>
          <input
            id="prod-slug"
            className={styles.textField}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </div>
        <div className={styles.formColumn}>
          <label className={styles.fieldLabel} htmlFor="prod-desc">
            Description
          </label>
          <textarea
            id="prod-desc"
            className={styles.textField}
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className={styles.formColumn}>
          <label className={styles.fieldLabel} htmlFor="prod-cat">
            Category
          </label>
          <select
            id="prod-cat"
            className={styles.textField}
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            {flatCategories(data.categories).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formColumn}>
          <label className={styles.fieldLabel} htmlFor="prod-brand">
            Brand
          </label>
          <select
            id="prod-brand"
            className={styles.textField}
            value={form.brandId}
            onChange={(e) => setForm({ ...form, brandId: e.target.value })}
          >
            {data.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formColumn}>
          <label className={styles.fieldLabel} htmlFor="prod-price">
            Base price (before discount)
          </label>
          <div className={styles.priceInputGroup}>
            <span className={styles.currencyLabel}>EGP</span>
            <input
              id="prod-price"
              className={styles.textField}
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => setForm(initial)}
            disabled={!dirty || busy !== null}
          >
            Discard
          </button>
          <button type="submit" className={styles.btnPrimary} disabled={!dirty || busy !== null}>
            {busy === 'details' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}

function StatusPanel({
  product,
  busy,
  save,
}: {
  product: AdminProduct;
  busy: string | null;
  save: Save;
}) {
  const [status, setStatus] = useState<ProductStatus>(product.status);
  useEffect(() => setStatus(product.status), [product.status]);
  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Status</h2>
      <p className={styles.fieldHelp}>
        Published products are visible in the store. Publishing is refused until the product has a
        sellable variant.
      </p>
      <div className={styles.actions}>
        <label className={styles.fieldLabel} htmlFor="prod-status">
          Status
        </label>
        <select
          id="prod-status"
          className={styles.textField}
          value={status}
          onChange={(e) => setStatus(e.target.value as ProductStatus)}
        >
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={status === product.status || busy !== null}
          onClick={() =>
            void save(
              'status',
              () => api.put(`admin/catalog/products/${product.id}/status`, { status }),
              `Status set to ${status.toLowerCase()}.`,
            )
          }
        >
          {busy === 'status' ? 'Applying…' : 'Apply status'}
        </button>
      </div>
    </section>
  );
}

function ImagesPanel({
  product,
  busy,
  save,
}: {
  product: AdminProduct;
  busy: string | null;
  save: Save;
}) {
  const initial = [...product.images]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({ url: image.url, altText: image.altText ?? '' }));
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [product.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const valid = rows.every((row) => /^https?:\/\/\S+$/.test(row.url.trim()));

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Images</h2>
      <p className={styles.fieldHelp}>
        Absolute image URLs, in display order. Saving replaces the whole set.
      </p>
      <div className={styles.imageGrid}>
        {rows.map((row, index) => (
          <div key={index} className={styles.formColumn} style={{ minWidth: 220 }}>
            {/^https?:\/\//.test(row.url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={normaliseImageUrl(row.url)}
                alt={row.altText}
                style={{ width: 120, height: 150, objectFit: 'cover', borderRadius: 8 }}
              />
            ) : null}
            <label className={styles.fieldLabel} htmlFor={`img-url-${index}`}>
              Image {index + 1} URL
            </label>
            <input
              id={`img-url-${index}`}
              className={styles.textField}
              value={row.url}
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, url: e.target.value } : r)))
              }
            />
            <label className={styles.fieldLabel} htmlFor={`img-alt-${index}`}>
              Alt text
            </label>
            <input
              id={`img-alt-${index}`}
              className={styles.textField}
              value={row.altText}
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, altText: e.target.value } : r)))
              }
            />
            <button
              type="button"
              className={styles.btnOutline}
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              Remove image
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.btnOutline}
          style={{ marginTop: 8 }}
          onClick={() => setRows([...rows, { url: '', altText: '' }])}
        >
          <Icon name="plus" size={16} strokeWidth={2} aria-hidden="true" />
          Add image
        </button>
      </div>
      {!valid ? (
        <p className={styles.fieldHelp} role="alert">
          Every image needs an absolute http(s) URL.
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!dirty || !valid || busy !== null}
          onClick={() =>
            void save(
              'images',
              () =>
                api.put(`admin/catalog/products/${product.id}/images`, {
                  images: rows.map((row, position) => ({
                    url: row.url.trim(),
                    altText: row.altText.trim() === '' ? null : row.altText.trim(),
                    position,
                  })),
                }),
              'Images saved.',
            )
          }
        >
          {busy === 'images' ? 'Saving…' : 'Save images'}
        </button>
      </div>
    </section>
  );
}

function AttributesPanel({
  product,
  busy,
  save,
}: {
  product: AdminProduct;
  busy: string | null;
  save: Save;
}) {
  const initial = [...product.attributes]
    .sort((a, b) => a.position - b.position)
    .map((a) => ({ name: a.name, value: a.value }));
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [product.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const names = rows.map((row) => row.name.trim().toLowerCase());
  const valid =
    rows.every((row) => row.name.trim() !== '' && row.value.trim() !== '') &&
    new Set(names).size === names.length;

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Specifications</h2>
      <p className={styles.fieldHelp}>
        Shown on the product page. They apply to the whole product, not one variant — the API has no
        per-variant attributes.
      </p>
      <div className={styles.specsGrid}>
        {rows.map((row, index) => (
          <div key={index} className={styles.specRow}>
            <input
              aria-label={`Specification ${index + 1} name`}
              className={styles.textField}
              value={row.name}
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))
              }
            />
            <input
              aria-label={`Specification ${index + 1} value`}
              className={styles.textField}
              value={row.value}
              onChange={(e) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
              }
            />
            <button
              type="button"
              className={styles.btnOutline}
              aria-label={`Remove specification ${index + 1}`}
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.btnOutline}
          style={{ marginTop: 8 }}
          onClick={() => setRows([...rows, { name: '', value: '' }])}
        >
          <Icon name="plus" size={14} strokeWidth={2} aria-hidden="true" />
          Add specification
        </button>
      </div>
      {!valid ? (
        <p className={styles.fieldHelp} role="alert">
          Each specification needs a unique name and a value.
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!dirty || !valid || busy !== null}
          onClick={() =>
            void save(
              'attributes',
              () =>
                api.put(`admin/catalog/products/${product.id}/attributes`, {
                  attributes: rows.map((row, position) => ({
                    name: row.name.trim(),
                    value: row.value.trim(),
                    position,
                  })),
                }),
              'Specifications saved.',
            )
          }
        >
          {busy === 'attributes' ? 'Saving…' : 'Save specifications'}
        </button>
      </div>
    </section>
  );
}

const blankVariant = { sku: '', color: '', size: '', material: '' };
const orNull = (text: string) => (text.trim() === '' ? null : text.trim());

function VariantsPanel({
  product,
  busy,
  save,
}: {
  product: AdminProduct;
  busy: string | null;
  save: Save;
}) {
  const [adding, setAdding] = useState(blankVariant);
  const [editing, setEditing] = useState<{
    id: string;
    sku: string;
    color: string;
    size: string;
    material: string;
  } | null>(null);
  const [removing, setRemoving] = useState<AdminVariant | null>(null);
  const variants = [...product.variants].sort((a, b) => a.position - b.position);

  return (
    <section className={styles.section}>
      <h2 className={styles.subsectionTitle}>Variants &amp; SKUs</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Colour</th>
              <th>Size</th>
              <th>Material</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody data-rows>
            {variants.map((variant) =>
              editing?.id === variant.id ? (
                <tr key={variant.id} className={styles.tableRow}>
                  {(['sku', 'color', 'size', 'material'] as const).map((field) => (
                    <td key={field} className={styles.tableCell}>
                      <input
                        aria-label={`Variant ${field}`}
                        className={styles.textField}
                        value={editing[field]}
                        onChange={(e) => setEditing({ ...editing, [field]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td className={styles.tableCell}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={busy !== null || editing.sku.trim() === ''}
                      onClick={fire(async () => {
                        const done = await save(
                          'variant',
                          () =>
                            api.patch(`admin/catalog/variants/${variant.id}`, {
                              sku: editing.sku.trim(),
                              color: orNull(editing.color),
                              size: orNull(editing.size),
                              material: orNull(editing.material),
                            }),
                          `Variant ${editing.sku.trim().toUpperCase()} saved.`,
                        );
                        if (done !== null) setEditing(null);
                      })}
                    >
                      Save
                    </button>{' '}
                    <button
                      type="button"
                      className={styles.btnOutline}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={variant.id} className={styles.tableRow}>
                  <td className={styles.tableCell}>
                    <span className="numerals">{variant.sku}</span>
                  </td>
                  <td className={styles.tableCell}>{variant.color ?? '—'}</td>
                  <td className={styles.tableCell}>{variant.size ?? '—'}</td>
                  <td className={styles.tableCell}>{variant.material ?? '—'}</td>
                  <td className={styles.tableCell}>
                    <button
                      type="button"
                      className={styles.btnOutline}
                      disabled={busy !== null}
                      onClick={() =>
                        setEditing({
                          id: variant.id,
                          sku: variant.sku,
                          color: variant.color ?? '',
                          size: variant.size ?? '',
                          material: variant.material ?? '',
                        })
                      }
                    >
                      Edit
                    </button>{' '}
                    {removing?.id === variant.id ? (
                      <>
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          disabled={busy !== null}
                          onClick={fire(async () => {
                            await save(
                              'variant-delete',
                              () => api.delete(`admin/catalog/variants/${variant.id}`),
                              `Variant ${variant.sku} deleted.`,
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
                      <button
                        type="button"
                        className={styles.btnOutline}
                        disabled={busy !== null}
                        onClick={() => setRemoving(variant)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <form
        className={styles.filterBar}
        noValidate
        onSubmit={fire(async (event) => {
          event.preventDefault();
          if (adding.sku.trim() === '') return;
          const done = await save(
            'variant-add',
            () =>
              api.post(`admin/catalog/products/${product.id}/variants`, {
                sku: adding.sku.trim(),
                color: orNull(adding.color),
                size: orNull(adding.size),
                material: orNull(adding.material),
                position: variants.length,
              }),
            `Variant ${adding.sku.trim().toUpperCase()} added.`,
          );
          if (done !== null) setAdding(blankVariant);
        })}
      >
        {(['sku', 'color', 'size', 'material'] as const).map((field) => (
          <div key={field} className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`nv-${field}`}>
              {field === 'sku'
                ? 'New SKU'
                : field === 'color'
                  ? 'Colour'
                  : field === 'size'
                    ? 'Size'
                    : 'Material'}
            </label>
            <input
              id={`nv-${field}`}
              className={styles.textField}
              value={adding[field]}
              onChange={(e) => setAdding({ ...adding, [field]: e.target.value })}
            />
          </div>
        ))}
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={busy !== null || adding.sku.trim() === ''}
        >
          {busy === 'variant-add' ? 'Adding…' : 'Add variant'}
        </button>
      </form>
    </section>
  );
}
