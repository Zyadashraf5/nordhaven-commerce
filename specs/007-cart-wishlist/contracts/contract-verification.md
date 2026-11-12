# Contract Verification: Milestone 07 - Cart and Wishlist

**Contract**: [`cart-wishlist-api.md`](./cart-wishlist-api.md)
**Committed document**: `openapi/openapi.json`, version 0.7.0

## Verification layers

### 1. The generated document is asserted against a reviewed inventory

`apps/api/src/platform/openapi/openapi.ts` holds the reviewed operation inventory. The document is
checked at startup wiring: an unexpected route, a renamed operation identifier, or a changed set of
documented statuses aborts instead of publishing an unreviewed surface. Milestone 07 adds exactly
seven operations - the four cart routes and the three wishlist routes - with the statuses the
controllers actually return.

`scripts/openapi-check.mjs` holds a second, independent inventory of every route and compares it
against the generated document, so a route that is in neither list fails the gate.

### 2. The authorization metadata is asserted

Every operation must declare its security requirement. The anonymous allow-list is unchanged, so the
cart and the wishlist are protected; a missing `security` block is treated as protected, so
forgetting to declare protection fails the gate.

### 3. The excluded-domain scan is narrowed, not weakened

`scripts/openapi-check.mjs` scans the paths, operation identifiers, tags, and schema names for the
still-unapproved commerce domains. `cart` and `wishlist` are **removed** from that list, because
those capabilities are now approved and their names legitimately appear in the contract. Every
remaining term - `authentication`, `administrator`, `checkout`, `order`, `payment`, `preorder`,
`shipping`, `review`, and `notification` - is still rejected, and the scan is unchanged for them.

The same narrowing is applied to the module-directory scan in
`scripts/check-repository-hygiene.mjs`, and the unit suite proves that the newly approved `cart`
module is accepted while a still-excluded module directory is rejected.

### 4. Every observed response is validated against the committed document

`test/e2e/cart-wishlist.e2e.spec.ts` validates every cart and wishlist response body it observes
- `200`, `201`, `400`, `401`, `403`, and `404` - with `openapi-response-validator` against
`openapi/openapi.json`, with `additionalProperties: false`, so an undocumented extra field fails the
suite. The file reads the committed document from disk, so the artifact that is published is the
artifact that is asserted.

### 5. The drift check

`pnpm openapi:check` regenerates the document and compares it with the committed one. A difference
fails the gate with `OpenAPI drift detected`. Milestone 07 regenerates and reviews
`openapi/openapi.json` and the gate passes.

## Seeded-failure rejection

The composite gate is proven to reject a real defect, not only to pass on a good tree. A deliberate
defect is injected into a Milestone 07 source file, `pnpm verify` is run, the seed is removed, and
the gate is run again.

- **Seed**: the cart's last-known price is no longer refreshed when the customer changes a line's
  quantity, so the stored price silently disagrees with the customer's latest decision.
- **Rejection evidence**: the integration suite fails on the affected case, and the failure names
  the stale last-known price.
- **Restoration**: the seed is reverted and the full gate runs green again, proving the seed left
  no residue.

## Verification evidence

Recorded in `docs/progress/milestone-07.md`.
