import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toStorefrontProduct } from '../lib/catalog-mapper';
import { cartItemFromLine } from '../lib/commerce-mapper';
import type { ApiProductDetail } from '../lib/api/catalog-types';
import type { ApiCart, ApiCheckoutQuote, ApiOrder } from '../lib/api/commerce-types';

/**
 * Real-API verification for F06 Batch 3 (opt-in; needs the local backend, the
 * seeded catalogue and `seed-checkout-config.mjs`). It signs in as the F06
 * CLI test customer, so it creates real TEST orders in hc_f06_frontend_dev —
 * and cancels each one, which releases its stock hold.
 *
 *   $env:F06_INTEGRATION = '1'; $env:F06_ENV_FILE = '../.env.f06.local'
 *   npx vitest run src/test/commerce.integration.test.ts
 */

const enabled = process.env.F06_INTEGRATION === '1';
const API = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1`;

function credentials(): { email: string; password: string } {
  const env: Record<string, string> = {};
  const file = process.env.F06_ENV_FILE;
  if (file !== undefined) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^#?\s*(F06_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (match?.[1] !== undefined && match[2] !== undefined) env[match[1]] = match[2].trim();
    }
  }
  const email = process.env.F06_TEST_CUSTOMER_EMAIL ?? env.F06_TEST_CUSTOMER_EMAIL;
  const password = process.env.F06_TEST_CUSTOMER_PASSWORD ?? env.F06_TEST_CUSTOMER_PASSWORD;
  if (!email || !password) throw new Error('F06 test customer credentials are not configured');
  return { email, password };
}

let token = '';
async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : null,
  });
  const text = await response.text();
  return { status: response.status, json: (text ? JSON.parse(text) : undefined) as T };
}

async function emptyCart() {
  const cart = await call<ApiCart>('GET', '/cart');
  for (const line of cart.json.lines) await call('DELETE', `/cart/items/${line.id}`);
}

describe.skipIf(!enabled)('cart, checkout and orders against the real API', () => {
  let casserole: ApiProductDetail;
  const placed: string[] = [];

  beforeAll(async () => {
    const { email, password } = credentials();
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    token = ((await login.json()) as { session: { token: string } }).session.token;
    casserole = (await (
      await fetch(`${API}/catalog/products/enamelled-cast-iron-casserole`)
    ).json()) as ApiProductDetail;
    await emptyCart();
  });

  afterAll(async () => {
    for (const id of placed) await call('DELETE', `/orders/${id}`);
    await emptyCart();
  });

  it('adds the exact variant at the API price the storefront shows (no 4,850 sample price)', async () => {
    const variant = casserole.variants.find((v) => v.sku === 'HC-CI-CAS-24-TER')!;
    const added = await call<ApiCart>('POST', '/cart/items', {
      variantId: variant.id,
      quantity: 1,
    });
    expect(added.status).toBe(201);
    const line = added.json.lines.find((l) => l.sku === 'HC-CI-CAS-24-TER')!;
    expect(line.currentUnitPriceMinor).toBe(484500);
    const item = cartItemFromLine(line, toStorefrontProduct(casserole));
    expect(item.priceEgp).toBe(4845);
    expect(item.variant).toContain('Terracotta');
    expect(item.sku).toBe('HC-CI-CAS-24-TER');
  });

  it('quotes the cart with server tax and a fingerprint; blocks a quantity above stock', async () => {
    const quote = await call<ApiCheckoutQuote>('POST', '/checkout/quotes', {
      destinationCountryCode: 'EG',
    });
    expect(quote.status).toBe(201);
    expect(quote.json.ready).toBe(true);
    expect(quote.json.totalMinor).toBe(484500);
    expect(quote.json.fingerprint).toHaveLength(64);

    const sage = casserole.variants.find((v) => v.sku === 'HC-CI-CAS-28-SAG')!;
    const cart = await call<ApiCart>('POST', '/cart/items', { variantId: sage.id, quantity: 999 });
    const sageLine = cart.json.lines.find((l) => l.sku === 'HC-CI-CAS-28-SAG')!;
    const blocked = await call<ApiCheckoutQuote>('POST', '/checkout/quotes', {
      destinationCountryCode: 'EG',
    });
    expect(blocked.json.ready).toBe(false);
    expect(blocked.json.blockers).toContainEqual({
      code: 'INSUFFICIENT_STOCK',
      lineId: sageLine.id,
      sku: 'HC-CI-CAS-28-SAG',
    });
    await call('DELETE', `/cart/items/${sageLine.id}`);
  });

  it('refuses a stale quote without creating an order', async () => {
    const before = await call<{ orders: ApiOrder[] }>('GET', '/orders');
    const refused = await call<{ code: string }>(
      'POST',
      '/orders',
      { destinationCountryCode: 'EG', expectedFingerprint: '0'.repeat(64) },
      { 'idempotency-key': `f06-it-stale-${Date.now()}` },
    );
    expect(refused.status).toBe(409);
    expect(refused.json.code).toBe('ORDER_QUOTE_CHANGED');
    const after = await call<{ orders: ApiOrder[] }>('GET', '/orders');
    expect(after.json.orders.length).toBe(before.json.orders.length);
  });

  it('creates one order per Idempotency-Key, empties the ordered lines, and cancels it', async () => {
    const quote = await call<ApiCheckoutQuote>('POST', '/checkout/quotes', {
      destinationCountryCode: 'EG',
    });
    const key = `f06-it-${Date.now()}`;
    const body = { destinationCountryCode: 'EG', expectedFingerprint: quote.json.fingerprint };
    const first = await call<ApiOrder>('POST', '/orders', body, { 'idempotency-key': key });
    const second = await call<ApiOrder>('POST', '/orders', body, { 'idempotency-key': key });
    expect(first.status).toBe(201);
    placed.push(first.json.id);
    expect(second.json.id).toBe(first.json.id);
    expect(first.json.status).toBe('PENDING_PAYMENT');
    expect(first.json.totalMinor).toBe(quote.json.totalMinor);
    expect((await call<ApiCart>('GET', '/cart')).json.lines).toHaveLength(0);

    const attempt = await call<{ status: string; provider: string }>(
      'POST',
      '/payments/attempts',
      { orderId: first.json.id },
      { 'idempotency-key': `order-${first.json.id}-attempt-1` },
    );
    expect(attempt.status).toBe(201);
    expect(attempt.json.status).toBe('PENDING');
    expect((await call<ApiOrder>('GET', `/orders/${first.json.id}`)).json.status).toBe(
      'PENDING_PAYMENT',
    );

    const cancelled = await call<ApiOrder>('DELETE', `/orders/${first.json.id}`);
    expect(cancelled.json.status).toBe('CANCELLED');
  });

  it('keeps a wishlist of products, once each', async () => {
    const first = await call<{ items: { id: string; productId: string }[] }>(
      'POST',
      '/customers/me/wishlist',
      {
        productId: casserole.id,
      },
    );
    const again = await call<{ items: { id: string; productId: string }[] }>(
      'POST',
      '/customers/me/wishlist',
      {
        productId: casserole.id,
      },
    );
    expect(again.json.items.filter((item) => item.productId === casserole.id)).toHaveLength(1);
    const item = first.json.items.find((i) => i.productId === casserole.id)!;
    const removed = await call<{ items: unknown[] }>('DELETE', `/customers/me/wishlist/${item.id}`);
    expect(removed.status).toBe(200);
  });
});
