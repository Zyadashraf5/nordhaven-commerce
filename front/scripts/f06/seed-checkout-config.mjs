/**
 * F06 checkout test configuration.
 *
 * Makes the real checkout contracts usable on the LOCAL test backend: a TEST
 * checkout destination (EG), a TEST shipping destination and method, a TEST
 * tax rule, and test stock for the seeded catalogue (`checkout-config.json`).
 * Everything goes through the ADMIN API after password + TOTP sign-in.
 *
 * It only creates what is missing: an existing tax rule, shipping method or
 * stock row is left exactly as it is, so it is safe to run twice. Destinations
 * are idempotent upserts of the same values.
 *
 *   node scripts/f06/seed-checkout-config.mjs --confirm --env-file ../.env.f06.local
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, loadEnvFile, must, requireConfirm, signInAdmin } from './admin-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
requireConfirm(args, 'TEST checkout configuration and test stock');
loadEnvFile(args);

const config = JSON.parse(readFileSync(join(here, 'checkout-config.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(here, 'catalog-seed.json'), 'utf8'));
const token = await signInAdmin();
const admin = (method, path, body) => call(method, `/admin${path}`, { body, token });
const log = [];

/* Destinations (idempotent upserts). */
const { destination } = config;
const checkoutDestinations = must(
  await admin('GET', '/checkout/destinations'),
  'list checkout destinations',
);
if (!checkoutDestinations.destinations.some((d) => d.countryCode === destination.countryCode)) {
  must(
    await admin('PUT', `/checkout/destinations/${destination.countryCode}`, {
      enabled: true,
      label: destination.label,
      shippingApproved: true,
      taxJurisdiction: destination.taxJurisdiction,
    }),
    'checkout destination',
  );
  log.push(`checkout destination ${destination.countryCode} created`);
} else log.push(`checkout destination ${destination.countryCode} exists (unchanged)`);

const shippingDestinations = must(
  await admin('GET', '/shipping/destinations'),
  'list shipping destinations',
);
if (!shippingDestinations.destinations.some((d) => d.countryCode === destination.countryCode)) {
  must(
    await admin('PUT', `/shipping/destinations/${destination.countryCode}`, {
      enabled: true,
      label: destination.label,
      carrierCode: destination.carrierCode,
    }),
    'shipping destination',
  );
  log.push(`shipping destination ${destination.countryCode} created`);
} else log.push(`shipping destination ${destination.countryCode} exists (unchanged)`);

/* Shipping method. */
const { shippingMethod } = config;
const methods = must(await admin('GET', '/shipping/methods'), 'list shipping methods');
if (!methods.methods.some((m) => m.code === shippingMethod.code)) {
  must(
    await admin('PUT', `/shipping/methods/${shippingMethod.code}`, {
      active: true,
      amountMinor: shippingMethod.amountMinor,
      currency: shippingMethod.currency,
      destinationCountryCode: destination.countryCode,
      label: shippingMethod.label,
    }),
    'shipping method',
  );
  log.push(`shipping method ${shippingMethod.code} created`);
} else log.push(`shipping method ${shippingMethod.code} exists (unchanged)`);

/* Tax rule. */
const { taxRule } = config;
const rules = must(await admin('GET', '/tax/rules'), 'list tax rules');
const hasRule = rules.rules.some(
  (r) =>
    r.jurisdiction === taxRule.jurisdiction &&
    r.classification === taxRule.classification &&
    r.environment === 'TEST',
);
if (!hasRule) {
  must(await admin('POST', '/tax/rules', { ...taxRule, effectiveTo: null }), 'tax rule');
  log.push(`tax rule ${taxRule.jurisdiction}/${taxRule.classification} created`);
} else log.push(`tax rule ${taxRule.jurisdiction}/${taxRule.classification} exists (unchanged)`);

/* Test stock: only for variants that have no inventory row yet. */
let created = 0;
let kept = 0;
for (const product of catalog.products) {
  const detail = must(
    await call('GET', `/catalog/products/${product.slug}`),
    `product ${product.slug}`,
  );
  for (const variant of detail.variants) {
    const current = await admin('GET', `/inventory/variants/${variant.id}`);
    if (current.status === 200) {
      kept += 1;
      continue;
    }
    if (current.status !== 404) must(current, `inventory ${variant.sku}`);
    const onHand = config.stock.overrides[variant.sku] ?? config.stock.default;
    must(
      await admin('PUT', `/inventory/variants/${variant.id}`, {
        onHand,
        reason: 'F06 local test stock',
      }),
      `inventory ${variant.sku}`,
    );
    created += 1;
  }
}
log.push(`stock rows created: ${created}, existing rows left unchanged: ${kept}`);

console.log(log.join('\n'));
