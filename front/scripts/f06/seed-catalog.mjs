/**
 * F06 test-catalog seed.
 *
 * Loads the approved test catalogue (`catalog-seed.json`, derived from the
 * design-board sample catalogue) into a LOCAL backend through the ADMIN API.
 * It signs in as an administrator (password + TOTP, so MFA is never bypassed),
 * then creates only what is missing, matched by slug. It never deletes or
 * updates existing rows, so it is safe to run twice and resets nothing.
 *
 *   node scripts/f06/seed-catalog.mjs --confirm [--env-file ../.env.f06.local]
 *
 * Credentials come from the environment, or from the env file (commented
 * `# F06_...=` lines are read too):
 *   F06_TEST_ADMIN_EMAIL, F06_TEST_ADMIN_PASSWORD, F06_TEST_ADMIN_TOTP_SECRET
 * API base: F06_API_BASE_URL (default http://localhost:3000).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, loadEnvFile, must, requireConfirm, signInAdmin } from './admin-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
requireConfirm(args, 'catalogue rows');
loadEnvFile(args);

const seed = JSON.parse(readFileSync(join(here, 'catalog-seed.json'), 'utf8'));
const token = await signInAdmin();
const admin = (method, path, body) => call(method, `/admin${path}`, { body, token });
const counts = { created: 0, existing: 0 };

// ---- brands and categories
const brandIds = new Map(
  must(await admin('GET', '/catalog/brands'), 'list brands').brands.map((b) => [b.slug, b.id]),
);
for (const brand of seed.brands) {
  if (brandIds.has(brand.slug)) {
    counts.existing++;
    continue;
  }
  const created = must(
    await admin('POST', '/catalog/brands', { name: brand.name, slug: brand.slug }),
    `brand ${brand.slug}`,
  );
  brandIds.set(brand.slug, created.id);
  counts.created++;
}

const categoryIds = new Map();
const walk = (nodes) =>
  nodes.forEach((n) => {
    categoryIds.set(n.slug, n.id);
    walk(n.children ?? []);
  });
walk(must(await admin('GET', '/catalog/categories'), 'list categories').categories);
for (const [position, category] of seed.categories.entries()) {
  if (categoryIds.has(category.slug)) {
    counts.existing++;
    continue;
  }
  const created = must(
    await admin('POST', '/catalog/categories', {
      name: category.name,
      slug: category.slug,
      position,
    }),
    `category ${category.slug}`,
  );
  categoryIds.set(category.slug, created.id);
  counts.created++;
}

// ---- products (matched by slug, across every status)
const existing = new Map();
let cursor;
do {
  const page = must(
    await admin(
      'GET',
      `/catalog/products?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
    'list products',
  );
  page.items.forEach((p) => existing.set(p.slug, p));
  cursor = page.nextCursor ?? undefined;
} while (cursor);

const IMAGE_BASE = (process.env.F06_IMAGE_BASE_URL ?? 'http://localhost:3003').replace(/\/+$/, '');

for (const product of seed.products) {
  const found = existing.get(product.slug);
  if (found && found.status !== 'DRAFT') {
    // --sync-discounts: bring the discount of a seeded product in line with the seed file.
    if (
      args.includes('--sync-discounts') &&
      found.discountBasisPoints !== product.discountBasisPoints
    ) {
      must(
        await admin('PUT', `/catalog/products/${found.id}/discount`, {
          basisPoints: product.discountBasisPoints,
        }),
        `discount ${product.slug}`,
      );
      console.log(
        `~ ${product.slug} discount ${found.discountBasisPoints} -> ${product.discountBasisPoints}`,
      );
    }
    counts.existing++;
    console.log(`= ${product.slug} (already present, left unchanged)`);
    continue;
  }
  // A DRAFT left by an interrupted run is completed (the replace-style PUTs are idempotent).
  let id = found?.id;
  const haveSkus = new Set();
  if (found) {
    const detail = must(
      await admin('GET', `/catalog/products/${found.id}`),
      `read ${product.slug}`,
    );
    detail.variants.forEach((v) => haveSkus.add(v.sku));
  } else {
    id = must(
      await admin('POST', '/catalog/products', {
        name: product.name,
        slug: product.slug,
        description: product.description,
        baseCurrency: seed.currency,
        basePriceMinor: product.basePriceMinor,
        brandId: brandIds.get(product.brand),
        categoryId: categoryIds.get(product.category),
      }),
      `product ${product.slug}`,
    ).id;
  }
  for (const variant of product.variants) {
    if (haveSkus.has(variant.sku)) continue;
    must(
      await admin('POST', `/catalog/products/${id}/variants`, variant),
      `variant ${variant.sku}`,
    );
  }
  // The API stores absolute http(s) URLs; the storefront serves these files from /images.
  const images = product.images.map((image) => ({ ...image, url: `${IMAGE_BASE}${image.url}` }));
  must(await admin('PUT', `/catalog/products/${id}/images`, { images }), `images ${product.slug}`);
  must(
    await admin('PUT', `/catalog/products/${id}/attributes`, { attributes: product.attributes }),
    `attributes ${product.slug}`,
  );
  if (product.discountBasisPoints > 0) {
    must(
      await admin('PUT', `/catalog/products/${id}/discount`, {
        basisPoints: product.discountBasisPoints,
      }),
      `discount ${product.slug}`,
    );
  }
  must(
    await admin('PUT', `/catalog/products/${id}/status`, { status: 'PUBLISHED' }),
    `publish ${product.slug}`,
  );
  counts.created++;
  console.log(`${found ? '~ completed' : '+'} ${product.slug}`);
}
console.log(`done: ${counts.created} created, ${counts.existing} already present`);
