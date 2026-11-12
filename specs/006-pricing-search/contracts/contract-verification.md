# Contract Verification: Milestone 06 - Pricing and Search

**Contract**: [`pricing-search-api.md`](./pricing-search-api.md)
**Committed document**: `openapi/openapi.json`, version 0.6.0

## Verification layers

### 1. The generated document is asserted against a reviewed inventory

`apps/api/src/platform/openapi/openapi.ts` holds the reviewed operation inventory. The document is
checked at startup wiring: an unexpected route, a renamed operation identifier, or a changed set of
documented statuses aborts instead of publishing an unreviewed surface. Milestone 06 adds exactly one
operation, `PUT /api/v1/admin/catalog/products/{productId}/discount`, with the statuses the
controller actually returns.

`scripts/openapi-check.mjs` holds a second, independent inventory of every route and compares it
against the generated document, so a route that is not in either list fails the gate.

### 2. The authorization metadata is asserted

Every operation must declare its security requirement. The anonymous allow-list is unchanged, so the
extended listing remains anonymous and the new discount route is protected. A missing `security`
block is treated as protected, so forgetting to declare protection fails the gate.

### 3. The excluded-domain scan is unchanged

`scripts/openapi-check.mjs` scans the paths, operation identifiers, tags, and schema names for the
still-unapproved commerce domains: `authentication`, `administrator`, `cart`, `checkout`, `order`,
`payment`, `preorder`, `shipping`, `review`, `wishlist`, and `notification`. Milestone 06 introduces
no such term. The scan is unchanged by this milestone, so it continues to fail the gate if a
future change introduces one.

### 4. Every observed response is validated against the committed document

`test/e2e/catalog.e2e.spec.ts` validates every catalog response body it observes - `200`, `201`,
`400`, `401`, `403`, `404`, and `409` - with `openapi-response-validator` against
`openapi/openapi.json`, with `additionalProperties: false`, so an undocumented extra field fails the
suite. The file reads the committed document from disk, so the artifact that is published is the
artifact that is asserted.

Milestone 06 extends that coverage to the new surfaces: the discount route's `200`, `400`, `401`,
`403`, and `404` responses, the filtered listing's `200` and `400` responses, and the product
projection's two new fields.

### 5. The drift check

`pnpm openapi:check` regenerates the document and compares it with the committed one. A difference
fails the gate with `OpenAPI drift detected`. Milestone 06 regenerates and reviews
`openapi/openapi.json` and the gate passes.

## Anonymous operation allow-list (reviewed, unchanged)

```
GET /api/v1/health/live
GET /api/v1/health/ready
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/login/mfa
POST /api/v1/auth/login/mfa/enrollment
POST /api/v1/auth/login/mfa/enrollment/confirmation
POST /api/v1/auth/password-reset/requests
POST /api/v1/auth/password-reset/confirmations
GET /api/v1/catalog/categories
GET /api/v1/catalog/brands
GET /api/v1/catalog/products
GET /api/v1/catalog/products/{slug}
```

The extended listing is the same operation with optional parameters, so the allow-list is unchanged.
The discount route is administrative and is not on it.

## Excluded-domain changes approved by this milestone

**None.** Milestone 06 introduces no new commerce domain. The excluded-term list in
`scripts/openapi-check.mjs` and `scripts/check-repository-hygiene.mjs` is unchanged, and the
repository hygiene unit suite still proves that a still-excluded module directory is rejected.

## Seeded-failure rejection

The composite gate is proven to reject a real defect, not only to pass on a good tree. A deliberate
defect is injected into a Milestone 06 source file, `pnpm verify` is run, the seed is removed, and
the gate is run again.

- **Seed**: the stored effective price is computed with the wrong rounding rule, so the database
  constraint refuses the write.
- **Rejection evidence**: the integration suite fails on the affected product, and the failure names
  the constraint.
- **Restoration**: the seed is reverted and the full gate runs green again, proving the seed left
  no residue.

## Verification evidence

Recorded in `docs/progress/milestone-06.md`.
