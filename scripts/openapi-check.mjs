import SwaggerParser from '@apidevtools/swagger-parser';
import responseValidatorPackage from 'openapi-response-validator';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import request from 'supertest';

const require = createRequire(import.meta.url);
const OpenAPIResponseValidator = responseValidatorPackage.default ?? responseValidatorPackage;

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortDeep(value[key])]),
    );
  }
  return value;
}

function responseObject(document, response) {
  if ('$ref' in response) {
    const name = response.$ref.split('/').at(-1);
    const resolved = document.components?.responses?.[name];
    if (resolved === undefined) throw new Error(`Missing response component: ${name}`);
    return resolved;
  }
  return response;
}

function validateBody(document, response, statusCode, body) {
  const resolved = responseObject(document, response);
  const schema = resolved.content?.['application/json']?.schema;
  if (schema === undefined) throw new Error(`Missing JSON schema for observed ${statusCode}`);
  const validator = new OpenAPIResponseValidator({
    responses: { [statusCode]: { schema } },
    components: document.components,
  });
  const validationError = validator.validateResponse(String(statusCode), body);
  if (validationError !== undefined) {
    throw new Error(
      `Observed ${statusCode} response violates OpenAPI: ${JSON.stringify(validationError)}`,
    );
  }
}

function assertOperationalHeaders(response) {
  if (response.headers['cache-control'] !== 'no-store') {
    throw new Error('Observed response is missing Cache-Control: no-store');
  }
  const correlationId = response.headers['x-correlation-id'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof correlationId !== 'string' || !uuid.test(correlationId)) {
    throw new Error('Observed response has an invalid correlation header');
  }
  if ('correlationId' in response.body && correlationId !== response.body.correlationId) {
    throw new Error('Observed correlation header does not match the error response body');
  }
}

function assertNoExcludedDomainNames(document) {
  const names = [
    ...Object.keys(document.paths),
    ...Object.values(document.paths).flatMap((item) =>
      Object.values(item).flatMap((operation) =>
        operation !== null && typeof operation === 'object'
          ? [operation.operationId, ...(operation.tags ?? [])]
          : [],
      ),
    ),
    ...Object.keys(document.components?.schemas ?? {}),
  ]
    .filter((value) => typeof value === 'string')
    .join('|')
    .toLowerCase();
  const excluded = [
    // `customer` for Milestone 03, `catalog` and `product` for Milestone 04, `inventory` and
    // `bundle` for Milestone 05, and `cart` and `wishlist` for Milestone 07 were removed exactly as
    // those capabilities were approved; `checkout` was removed for Milestone 08, and `order`,
    // `preorder`, and `payment` for Milestones 09 and 10. `shipping` was removed for Milestone 11,
    // when the Shipping and Fulfillment capability was approved, and `review` and `notification`
    // for Milestone 12, when the Reviews and Notifications capabilities were approved. Every
    // remaining term is a still-unapproved domain or a deliberately reserved term.
    'authentication',
    'administrator',
  ];
  const found = excluded.filter((term) => names.includes(term));
  if (found.length > 0)
    throw new Error(`Excluded domain names in OpenAPI inventory: ${found.join(', ')}`);
}

/**
 * Asserts that every operation declares the reviewed authentication metadata.
 *
 * Health probes and the identity flows a caller cannot authenticate to are the only anonymous
 * operations; everything else requires the bearer session scheme. A missing `security` block is
 * treated as protected, so forgetting to declare protection fails the gate.
 */
function assertAuthorizationMetadata(document) {
  const publicOperations = new Set([
    'GET /api/v1/health/live',
    'GET /api/v1/health/ready',
    'POST /api/v1/auth/register',
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/login/mfa',
    'POST /api/v1/auth/login/mfa/enrollment',
    'POST /api/v1/auth/login/mfa/enrollment/confirmation',
    'POST /api/v1/auth/password-reset/requests',
    'POST /api/v1/auth/password-reset/confirmations',
    'GET /api/v1/catalog/categories',
    'GET /api/v1/catalog/brands',
    'GET /api/v1/catalog/products',
    'GET /api/v1/catalog/products/{slug}',
    // A shipping option is storefront information, so it is reachable without a credential, exactly
    // as the catalog's browsing routes are.
    'GET /api/v1/shipping/options',
    // A published product review is storefront information, so it is reachable without a
    // credential, exactly as the catalog's browsing routes are.
    'GET /api/v1/products/reviews',
    // A payment provider is not an authenticated customer, so the provider event intake is the one
    // public payment route. Its signature verification is what makes the route safe, and the
    // platform's own public routes are the only other exceptions.
    'POST /api/v1/payments/webhooks/{provider}',
  ]);
  const scheme = document.components?.securitySchemes?.session;
  if (scheme?.type !== 'http' || scheme.scheme !== 'bearer') {
    throw new Error('Expected the bearer `session` security scheme in components.securitySchemes');
  }
  for (const [route, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const key = `${method.toUpperCase()} ${route}`;
      const security = operation.security ?? [{ session: [] }];
      const expectsSession = !publicOperations.has(key);
      const declaresSession = security.some(
        (requirement) =>
          requirement !== null && typeof requirement === 'object' && 'session' in requirement,
      );
      if (declaresSession !== expectsSession) {
        throw new Error(`Authorization metadata mismatch for ${key}: ${JSON.stringify(security)}`);
      }
    }
  }
}

const temporary = path.resolve('openapi/openapi.tmp.json');
const generated = spawnSync(process.execPath, ['scripts/openapi-generate.mjs', temporary], {
  stdio: 'inherit',
});
if (generated.status !== 0) process.exit(generated.status ?? 1);
try {
  await SwaggerParser.validate(temporary);
  const actual = await readFile(temporary, 'utf8');
  const expected = await readFile(path.resolve('openapi/openapi.json'), 'utf8');
  const document = JSON.parse(actual);
  const operations = Object.entries(document.paths).flatMap(([route, item]) =>
    Object.keys(item)
      .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
      .map((method) => `${method.toUpperCase()} ${route}`),
  );
  const allowed = [
    'GET /api/v1/admin/users',
    'GET /api/v1/auth/principal',
    'GET /api/v1/auth/sessions',
    'GET /api/v1/customers/me/addresses',
    'GET /api/v1/customers/me/addresses/{addressId}',
    'GET /api/v1/customers/me/profile',
    'GET /api/v1/health/live',
    'GET /api/v1/health/ready',
    'DELETE /api/v1/auth/sessions',
    'DELETE /api/v1/auth/sessions/current',
    'DELETE /api/v1/auth/sessions/{sessionId}',
    'DELETE /api/v1/customers/me/addresses/{addressId}',
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/login/mfa',
    'POST /api/v1/auth/login/mfa/enrollment',
    'POST /api/v1/auth/login/mfa/enrollment/confirmation',
    'POST /api/v1/auth/password',
    'POST /api/v1/auth/password-reset/confirmations',
    'POST /api/v1/auth/password-reset/requests',
    'POST /api/v1/auth/register',
    'POST /api/v1/customers/me/addresses',
    'PATCH /api/v1/customers/me/addresses/{addressId}',
    'PATCH /api/v1/customers/me/profile',
    'PUT /api/v1/customers/me/addresses/{addressId}/default',
    'GET /api/v1/catalog/categories',
    'GET /api/v1/catalog/brands',
    'GET /api/v1/catalog/products',
    'GET /api/v1/catalog/products/{slug}',
    'GET /api/v1/shipping/options',
    'GET /api/v1/cart',
    'POST /api/v1/cart/items',
    'POST /api/v1/cart/bundle-items',
    'PATCH /api/v1/cart/items/{itemId}',
    'DELETE /api/v1/cart/items/{itemId}',
    'POST /api/v1/checkout/quotes',
    'GET /api/v1/admin/tax/rules',
    'POST /api/v1/admin/tax/rules',
    'DELETE /api/v1/admin/tax/rules/{ruleId}',
    'PUT /api/v1/admin/tax/products/{productId}/classification',
    'DELETE /api/v1/admin/tax/products/{productId}/classification',
    'GET /api/v1/admin/checkout/destinations',
    'PUT /api/v1/admin/checkout/destinations/{countryCode}',
    'GET /api/v1/orders',
    'POST /api/v1/orders',
    'GET /api/v1/orders/{orderId}',
    'DELETE /api/v1/orders/{orderId}',
    'GET /api/v1/orders/pre-orders',
    'POST /api/v1/orders/pre-orders',
    'POST /api/v1/orders/pre-orders/{preOrderId}/convert',
    'GET /api/v1/orders/pre-orders/{preOrderId}',
    'DELETE /api/v1/orders/pre-orders/{preOrderId}',
    'GET /api/v1/admin/orders',
    'GET /api/v1/admin/orders/pre-orders',
    'GET /api/v1/admin/orders/{orderId}',
    'GET /api/v1/payments',
    'POST /api/v1/payments/attempts',
    'GET /api/v1/payments/attempts/{paymentAttemptId}/refunds',
    'POST /api/v1/payments/webhooks/{provider}',
    'GET /api/v1/admin/payments',
    'GET /api/v1/admin/payments/events',
    'POST /api/v1/admin/payments/refunds',
    'GET /api/v1/admin/payments/attempts/{paymentAttemptId}/refunds',
    'GET /api/v1/admin/payments/reconciliation',
    'GET /api/v1/customers/me/wishlist',
    'POST /api/v1/customers/me/wishlist',
    'DELETE /api/v1/customers/me/wishlist/{itemId}',
    'POST /api/v1/admin/catalog/categories',
    'GET /api/v1/admin/catalog/categories',
    'PATCH /api/v1/admin/catalog/categories/{categoryId}',
    'DELETE /api/v1/admin/catalog/categories/{categoryId}',
    'POST /api/v1/admin/catalog/brands',
    'GET /api/v1/admin/catalog/brands',
    'PATCH /api/v1/admin/catalog/brands/{brandId}',
    'DELETE /api/v1/admin/catalog/brands/{brandId}',
    'POST /api/v1/admin/catalog/products',
    'GET /api/v1/admin/catalog/products',
    'GET /api/v1/admin/catalog/products/{productId}',
    'PATCH /api/v1/admin/catalog/products/{productId}',
    'DELETE /api/v1/admin/catalog/products/{productId}',
    'PUT /api/v1/admin/catalog/products/{productId}/images',
    'PUT /api/v1/admin/catalog/products/{productId}/attributes',
    'PUT /api/v1/admin/catalog/products/{productId}/status',
    'POST /api/v1/admin/catalog/products/{productId}/variants',
    'PUT /api/v1/admin/catalog/products/{productId}/discount',
    'PATCH /api/v1/admin/catalog/variants/{variantId}',
    'DELETE /api/v1/admin/catalog/variants/{variantId}',
    'GET /api/v1/admin/inventory',
    'GET /api/v1/admin/inventory/variants/{variantId}',
    'PUT /api/v1/admin/inventory/variants/{variantId}',
    'GET /api/v1/admin/inventory/{inventoryId}',
    'GET /api/v1/admin/inventory/{inventoryId}/movements',
    'POST /api/v1/admin/bundles',
    'GET /api/v1/admin/bundles',
    'GET /api/v1/admin/bundles/{bundleId}',
    'PATCH /api/v1/admin/bundles/{bundleId}',
    'DELETE /api/v1/admin/bundles/{bundleId}',
    'POST /api/v1/admin/bundles/{bundleId}/assemble',
    'POST /api/v1/admin/bundles/{bundleId}/disassemble',
    'POST /api/v1/admin/reservations',
    'GET /api/v1/admin/reservations',
    'GET /api/v1/admin/reservations/{reservationId}',
    'PATCH /api/v1/admin/reservations/{reservationId}',
    'POST /api/v1/admin/reservations/{reservationId}/confirmation',
    'POST /api/v1/admin/reservations/{reservationId}/release',
    'GET /api/v1/shipments',
    'GET /api/v1/shipments/{shipmentId}',
    'GET /api/v1/shipments/{shipmentId}/events',
    'GET /api/v1/returns',
    'POST /api/v1/returns',
    'GET /api/v1/returns/{returnId}',
    'DELETE /api/v1/returns/{returnId}',
    'GET /api/v1/returns/{returnId}/events',
    'GET /api/v1/admin/shipping/destinations',
    'PUT /api/v1/admin/shipping/destinations/{countryCode}',
    'GET /api/v1/admin/shipping/methods',
    'PUT /api/v1/admin/shipping/methods/{code}',
    'GET /api/v1/admin/shipments',
    'POST /api/v1/admin/shipments',
    'GET /api/v1/admin/shipments/{shipmentId}',
    'PATCH /api/v1/admin/shipments/{shipmentId}',
    'PUT /api/v1/admin/shipments/{shipmentId}/tracking',
    'GET /api/v1/admin/shipments/{shipmentId}/events',
    'GET /api/v1/admin/returns',
    'GET /api/v1/admin/returns/{returnId}',
    'POST /api/v1/admin/returns/{returnId}/decision',
    'POST /api/v1/admin/returns/{returnId}/receipt',
    'GET /api/v1/admin/returns/{returnId}/events',
    'GET /api/v1/products/reviews',
    'GET /api/v1/reviews',
    'POST /api/v1/reviews',
    'GET /api/v1/reviews/{reviewId}',
    'PATCH /api/v1/reviews/{reviewId}',
    'GET /api/v1/reviews/{reviewId}/events',
    'GET /api/v1/admin/reviews',
    'GET /api/v1/admin/reviews/pending',
    'GET /api/v1/admin/reviews/{reviewId}',
    'POST /api/v1/admin/reviews/{reviewId}/decision',
    'GET /api/v1/admin/reviews/{reviewId}/events',
    'GET /api/v1/notifications',
    'GET /api/v1/notifications/{notificationId}',
    'GET /api/v1/admin/notifications',
    'POST /api/v1/admin/notifications/{notificationId}/retry',
    'GET /api/v1/admin/overview',
    'GET /api/v1/admin/customers',
    'GET /api/v1/admin/customers/{customerId}',
    'GET /api/v1/admin/audit',
  ].sort();
  if (operations.sort().join('|') !== allowed.join('|'))
    throw new Error(`Unexpected operation inventory: ${operations.join(', ')}`);
  assertAuthorizationMetadata(document);
  assertNoExcludedDomainNames(document);
  const canonicalActual = `${JSON.stringify(sortDeep(document), null, 2)}\n`;
  const canonicalExpected = `${JSON.stringify(sortDeep(JSON.parse(expected)), null, 2)}\n`;
  if (canonicalActual !== canonicalExpected)
    throw new Error('OpenAPI drift detected; run pnpm openapi:generate and review the result.');

  const { createApplication } = require('../apps/api/dist/bootstrap/create-application.js');
  const { DatabaseService } = require('../apps/api/dist/platform/database/database.service.js');
  const {
    ApplicationAvailabilityService,
  } = require('../apps/api/dist/platform/availability/application-availability.service.js');
  const configuration = {
    nodeEnv: 'test',
    port: 3000,
    databaseUrl: 'postgresql://test:test@localhost:5432/nordhaven_unit_e2e',
    logLevel: 'silent',
    databaseStartupTimeoutMs: 5000,
    databaseProbeTimeoutMs: 1000,
    shutdownTimeoutMs: 8000,
    authEncryptionKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    authSessionAbsoluteTtlSeconds: 3600,
    authSessionIdleTtlSeconds: 1800,
    authMaxFailedAttempts: 10,
    authLockoutSeconds: 900,
    authPasswordResetTtlSeconds: 1800,
    authMfaIssuer: 'Nordhaven Commerce',
    authNotificationTransport: 'memory',
  };
  const { app } = await createApplication({ configuration, initializeDatabase: false });
  try {
    const server = app.getHttpServer();
    const database = app.get(DatabaseService);

    const live = await request(server).get('/api/v1/health/live').expect(200);
    validateBody(
      document,
      document.paths['/api/v1/health/live'].get.responses['200'],
      200,
      live.body,
    );
    assertOperationalHeaders(live);

    database.probe = async () => undefined;
    const ready = await request(server).get('/api/v1/health/ready').expect(200);
    validateBody(
      document,
      document.paths['/api/v1/health/ready'].get.responses['200'],
      200,
      ready.body,
    );
    assertOperationalHeaders(ready);

    database.probe = async () => {
      throw new Error('openapi-canary-secret');
    };
    const unavailable = await request(server).get('/api/v1/health/ready').expect(503);
    validateBody(
      document,
      document.paths['/api/v1/health/ready'].get.responses['503'],
      503,
      unavailable.body,
    );
    assertOperationalHeaders(unavailable);
    if (JSON.stringify(unavailable.body).includes('openapi-canary-secret')) {
      throw new Error('Observed 503 response exposed the injected canary secret');
    }

    for (const route of ['/api/v1/__contract-test-missing', '/api/v2/health/live']) {
      const missing = await request(server).get(route).expect(404);
      validateBody(document, document.components.responses.NotFound, 404, missing.body);
      if (missing.headers['x-correlation-id'] !== missing.body.correlationId) {
        throw new Error(`Observed 404 correlation mismatch for ${route}`);
      }
    }

    // Availability outranks authentication: an instance that is not ready answers 503, never 401.
    const unavailableBusiness = await request(server).get('/api/v1/auth/principal').expect(503);
    validateBody(
      document,
      document.paths['/api/v1/auth/principal'].get.responses['503'],
      503,
      unavailableBusiness.body,
    );
    assertOperationalHeaders(unavailableBusiness);

    app.get(ApplicationAvailabilityService).markReady();

    // A protected route without a credential answers the documented 401 envelope.
    const unauthorized = await request(server).get('/api/v1/auth/principal').expect(401);
    validateBody(
      document,
      document.paths['/api/v1/auth/principal'].get.responses['401'],
      401,
      unauthorized.body,
    );
    assertOperationalHeaders(unauthorized);
    if (unauthorized.body.code !== 'UNAUTHENTICATED') {
      throw new Error(`Expected UNAUTHENTICATED, observed ${unauthorized.body.code}`);
    }

    // A malformed body answers the documented 400 envelope before any storage work.
    const invalid = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: 'rate-probe@example.com', password: 'x' })
      .expect(400);
    validateBody(
      document,
      document.paths['/api/v1/auth/register'].post.responses['400'],
      400,
      invalid.body,
    );
    assertOperationalHeaders(invalid);

    // The declared register policy is 5 requests per window for one client and one account.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(server)
        .post('/api/v1/auth/register')
        .send({ email: 'rate-probe@example.com', password: 'x' })
        .expect(400);
    }
    const limited = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: 'rate-probe@example.com', password: 'x' })
      .expect(429);
    validateBody(
      document,
      document.paths['/api/v1/auth/register'].post.responses['429'],
      429,
      limited.body,
    );
    assertOperationalHeaders(limited);
    if (limited.body.code !== 'RATE_LIMITED') {
      throw new Error(`Expected RATE_LIMITED, observed ${limited.body.code}`);
    }
    if (!Number.isFinite(Number(limited.headers['retry-after']))) {
      throw new Error('Observed 429 response is missing a numeric Retry-After header');
    }
  } finally {
    await app.close();
  }
  process.stdout.write('OpenAPI validation and drift check passed.\n');
} finally {
  await rm(temporary, { force: true });
}
