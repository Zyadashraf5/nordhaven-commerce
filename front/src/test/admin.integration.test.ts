/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call --
 * This test reads raw API JSON on purpose (it checks the contract itself), so the
 * response bodies are untyped here; the app code uses the typed client. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The F06 seed scripts' admin client (password + TOTP; MFA is never bypassed).
import { call, loadEnvFile, signInAdmin } from '../../scripts/f06/admin-client.mjs';

/**
 * Real-API verification for F06 Batch 4 (opt-in; local backend + seeded data).
 *
 *   $env:F06_INTEGRATION = '1'; $env:F06_ENV_FILE = '../.env.f06.local'
 *   npx vitest run src/test/admin.integration.test.ts
 *
 * Security: anonymous and customer sessions are refused on admin endpoints,
 * through the backend and through the storefront BFF rules. Admin writes run on
 * disposable records created here and removed afterwards (the fixed bundle is
 * reused, because an assembled bundle can't be deleted); the bundle
 * assemble/disassemble pair consumes and returns the same component stock.
 */

type Result = { status: number; json: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const enabled = process.env.F06_INTEGRATION === '1';
const stamp = Date.now().toString(36);

function env(name: string): string {
  const file = process.env.F06_ENV_FILE;
  if (process.env[name]) return process.env[name];
  if (file === undefined) throw new Error('F06_ENV_FILE is not set');
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => new RegExp(`^#?\\s*${name}=`).test(l.trim()));
  if (line === undefined) throw new Error(`${name} missing`);
  return line.slice(line.indexOf('=') + 1).trim();
}

describe.skipIf(!enabled)('admin API and access control against the real backend', () => {
  let admin = '';
  let customer = '';
  const as = (token: string) => (method: string, path: string, body?: unknown) =>
    call(method, path, { token, body }) as Promise<Result>;
  const cleanup: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    loadEnvFile(['--env-file', process.env.F06_ENV_FILE ?? '']);
    admin = await signInAdmin();
    const login = (await call('POST', '/auth/login', {
      body: { email: env('F06_TEST_CUSTOMER_EMAIL'), password: env('F06_TEST_CUSTOMER_PASSWORD') },
    })) as Result;
    expect(login.status).toBe(200);
    customer = login.json.session.token as string;
  }, 90_000);

  afterAll(async () => {
    for (const undo of cleanup.reverse()) await undo();
  }, 60_000);

  it('refuses anonymous (401) and customer (403) callers on every admin area', async () => {
    const paths = [
      '/admin/overview',
      '/admin/orders',
      '/admin/customers',
      '/admin/catalog/products',
      '/admin/inventory',
      '/admin/payments',
      '/admin/users',
    ];
    for (const path of paths) {
      expect(((await call('GET', path)) as Result).status).toBe(401);
      expect((await as(customer)('GET', path)).status).toBe(403);
      expect((await as(admin)('GET', path)).status).toBe(200);
    }
    // A customer can't write either.
    expect(
      (await as(customer)('POST', '/admin/catalog/brands', { name: `Nope ${stamp}` })).status,
    ).toBe(403);
    expect(
      (
        await as(customer)('POST', '/admin/payments/refunds', {
          paymentAttemptId: '00000000-0000-4000-8000-000000000000',
          amountMinor: 1,
          reason: null,
        })
      ).status,
    ).toBe(403);
  });

  it('creates, renames and deletes a brand and a category', async () => {
    const a = as(admin);
    const brand = await a('POST', '/admin/catalog/brands', { name: `F06 IT Brand ${stamp}` });
    expect(brand.status).toBe(201);
    expect(
      (
        await a('PATCH', `/admin/catalog/brands/${brand.json.id}`, {
          name: `F06 IT Brand ${stamp} renamed`,
        })
      ).json.name,
    ).toContain('renamed');
    expect((await a('DELETE', `/admin/catalog/brands/${brand.json.id}`)).status).toBe(204);

    const category = await a('POST', '/admin/catalog/categories', {
      name: `F06 IT Category ${stamp}`,
      parentId: null,
    });
    expect(category.status).toBe(201);
    expect((await a('DELETE', `/admin/catalog/categories/${category.json.id}`)).status).toBe(204);
  });

  it('runs the product lifecycle: draft → variant → images/attributes → discount → publish → archive → delete', async () => {
    const a = as(admin);
    const categories = (await a('GET', '/admin/catalog/categories')).json.categories;
    const brands = (await a('GET', '/admin/catalog/brands')).json.brands;
    const product = await a('POST', '/admin/catalog/products', {
      name: `F06 IT Product ${stamp}`,
      description: 'Integration-test product; deleted by the test.',
      categoryId: categories[0].id,
      brandId: brands[0].id,
      basePriceMinor: 100050,
      baseCurrency: 'EGP',
    });
    expect(product.status).toBe(201);
    expect(product.json.status).toBe('DRAFT');
    const id = product.json.id as string;
    cleanup.push(() => a('DELETE', `/admin/catalog/products/${id}`));

    // Publishing without a sellable variant is refused.
    expect(
      (await a('PUT', `/admin/catalog/products/${id}/status`, { status: 'PUBLISHED' })).status,
    ).toBeGreaterThanOrEqual(400);

    const variant = await a('POST', `/admin/catalog/products/${id}/variants`, {
      sku: `f06-it-${stamp}`,
      color: 'Clear',
      size: null,
      material: null,
    });
    expect(variant.status).toBe(201);
    expect(variant.json.sku).toBe(`F06-IT-${stamp}`.toUpperCase());
    expect(
      (await a('PATCH', `/admin/catalog/variants/${variant.json.id}`, { size: 'One size' })).json
        .size,
    ).toBe('One size');

    expect(
      (
        await a('PUT', `/admin/catalog/products/${id}/images`, {
          images: [
            { url: 'http://localhost:3003/images/storage-jars.webp', altText: 'Test', position: 0 },
          ],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a('PUT', `/admin/catalog/products/${id}/attributes`, {
          attributes: [{ name: 'Material', value: 'Glass', position: 0 }],
        })
      ).status,
    ).toBe(200);
    const discounted = await a('PUT', `/admin/catalog/products/${id}/discount`, {
      basisPoints: 1000,
    });
    expect(discounted.json.effectivePriceMinor).toBe(90045);

    expect(
      (await a('PUT', `/admin/catalog/products/${id}/status`, { status: 'PUBLISHED' })).json.status,
    ).toBe('PUBLISHED');
    expect(
      (await fetch(`http://localhost:3000/api/v1/catalog/products/${product.json.slug}`)).status,
    ).toBe(200);
    expect(
      (await a('PUT', `/admin/catalog/products/${id}/status`, { status: 'ARCHIVED' })).json.status,
    ).toBe('ARCHIVED');
    expect(
      (await fetch(`http://localhost:3000/api/v1/catalog/products/${product.json.slug}`)).status,
    ).toBe(404);

    expect((await a('DELETE', `/admin/catalog/variants/${variant.json.id}`)).status).toBe(204);
  });

  it('sets on-hand stock with a reason, records the movement, and refuses going below reserved', async () => {
    const a = as(admin);
    const items = (await a('GET', '/admin/inventory?limit=50')).json.items as {
      id: string;
      variantId: string;
      onHand: number;
      reserved: number;
      sku: string;
    }[];
    const item = items.find((i) => i.sku === 'HC-ST-JAR-3-CLR') ?? items[0]!;
    const original = item.onHand;
    const set = await a('PUT', `/admin/inventory/variants/${item.variantId}`, {
      onHand: original + 1,
      reason: 'F06 integration test count',
    });
    expect(set.json.onHand).toBe(original + 1);
    const movements = (await a('GET', `/admin/inventory/${item.id}/movements?limit=5`)).json.items;
    expect(movements[0].reason).toBe('ADJUSTMENT');
    expect(movements[0].note).toBe('F06 integration test count');
    expect(
      (
        await a('PUT', `/admin/inventory/variants/${item.variantId}`, {
          onHand: original,
          reason: 'F06 integration test restore',
        })
      ).json.onHand,
    ).toBe(original);
    if (item.reserved > 0) {
      expect(
        (
          await a('PUT', `/admin/inventory/variants/${item.variantId}`, {
            onHand: item.reserved - 1,
            reason: 'below reserved',
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
    }
  });

  it('assembles and disassembles one set of the fixed integration bundle (component stock returns)', async () => {
    const a = as(admin);
    // An assembled bundle keeps its stock history, so the backend refuses to delete it
    // (INVENTORY_CONFLICT). The test therefore reuses one fixed bundle on an archived
    // product ("F06 integration-test set") and only creates it when it doesn't exist.
    const inventory = (await a('GET', '/admin/inventory?limit=50')).json.items as {
      variantId: string;
      sku: string;
      onHand: number;
    }[];
    const component = inventory.find((i) => i.sku === 'HC-TW-MUG-350-SAG')!;
    const bundles = (await a('GET', '/admin/bundles')).json.bundles as {
      id: string;
      name: string;
    }[];
    let bundleId = bundles.find((b) => b.name === 'F06 integration-test set')?.id;
    if (bundleId === undefined) {
      const categories = (await a('GET', '/admin/catalog/categories')).json.categories;
      const brands = (await a('GET', '/admin/catalog/brands')).json.brands;
      const product = await a('POST', '/admin/catalog/products', {
        name: 'F06 integration-test set (archived)',
        description: 'Holds the reusable integration-test bundle. Never published.',
        categoryId: categories[0].id,
        brandId: brands[0].id,
        basePriceMinor: 200000,
        baseCurrency: 'EGP',
      });
      await a('PUT', `/admin/catalog/products/${product.json.id}/status`, { status: 'ARCHIVED' });
      const created = await a('POST', '/admin/bundles', {
        productId: product.json.id,
        kind: 'FIXED',
        name: 'F06 integration-test set',
        components: [{ variantId: component.variantId, quantity: 2, position: 0 }],
      });
      expect(created.status).toBe(201);
      bundleId = created.json.id as string;
    }
    const before = (await a('GET', `/admin/inventory/variants/${component.variantId}`)).json
      .onHand as number;

    const assembled = await a('POST', `/admin/bundles/${bundleId}/assemble`, {
      quantity: 1,
      note: 'F06 integration test',
    });
    expect(assembled.status).toBe(200);
    expect(assembled.json.available).toBe(1);
    expect((await a('GET', `/admin/inventory/variants/${component.variantId}`)).json.onHand).toBe(
      before - 2,
    );
    const disassembled = await a('POST', `/admin/bundles/${bundleId}/disassemble`, {
      quantity: 1,
      note: 'F06 integration test',
    });
    expect(disassembled.json.available).toBe(0);
    expect((await a('GET', `/admin/inventory/variants/${component.variantId}`)).json.onHand).toBe(
      before,
    );
    // The assembled bundle can't be deleted: its stock history stays.
    expect((await a('DELETE', `/admin/bundles/${bundleId}`)).status).toBe(409);
  });

  it('reads orders, customers with order ids, payments, reconciliation and audit', async () => {
    const a = as(admin);
    const orders = (await a('GET', '/admin/orders')).json.orders as { id: string }[];
    const customers = (await a('GET', '/admin/customers?limit=50')).json.customers as {
      customerId: string;
      orderCount: number;
    }[];
    const withOrders = customers.find((c) => c.orderCount > 0);
    if (withOrders !== undefined) {
      const detail = (await a('GET', `/admin/customers/${withOrders.customerId}`)).json;
      expect(detail.orderIds.every((id: string) => orders.some((o) => o.id === id))).toBe(true);
    }
    expect((await a('GET', '/admin/payments')).status).toBe(200);
    expect((await a('GET', '/admin/payments/reconciliation')).json.checked).toBeGreaterThanOrEqual(
      0,
    );
    const audit = (await a('GET', '/admin/audit?limit=200')).json.events as { eventType: string }[];
    // The refused customer calls above were recorded.
    expect(audit.some((e) => e.eventType === 'ADMIN_ACCESS_DENIED')).toBe(true);
  });
});
