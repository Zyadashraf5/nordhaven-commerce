# Contract Verification: Milestone 04 - Product Catalog

**Feature**: [spec.md](../spec.md) | **Contract**: [catalog-api.md](./catalog-api.md) | **Date**: 2026-10-20

This document records how the Product Catalog contract is verified, so a reviewer can see that the
committed OpenAPI document, the running code, and the tests cannot drift from each other.

## Verification layers

| Layer | Mechanism | What it proves |
| --- | --- | --- |
| Operation inventory | `OPERATIONS` in `apps/api/src/platform/openapi/openapi.ts` | Every route, method, operation identifier, and status set is reviewed; an unexpected route or a missing one aborts the contract build. |
| Document drift | `pnpm openapi:check` compares a fresh generation with the committed `openapi/openapi.json` under canonical ordering | The committed document is exactly the code's document. |
| Document validity | `@apidevtools/swagger-parser` validates the generated document | The OpenAPI document is structurally valid. |
| Excluded domains | `scripts/openapi-check.mjs` `assertNoExcludedDomainNames` | No unapproved domain term (`bundle`, `cart`, `checkout`, `order`, `payment`, `preorder`, `shipping`, `review`, `wishlist`, `notification`, `authentication`, `administrator`) leaks into the inventory. `product` and `catalog` are removed for this milestone because it is the approved Product Catalog. |
| Authorization metadata | `scripts/openapi-check.mjs` `assertAuthorizationMetadata` | Exactly the reviewed anonymous operations declare `security: []`; every other operation names the session scheme. |
| Runtime response shapes | `test/e2e/catalog.e2e.spec.ts` validates every observed body against the committed `openapi/openapi.json` through `openapi-response-validator` | No response can carry an undocumented or missing field, because object schemas are closed with `additionalProperties: false`. |
| Repository hygiene | `scripts/check-repository-hygiene.mjs` | The `catalog` module directory is approved; every still-unapproved commerce module directory is rejected. |

## Anonymous operation allow-list (reviewed)

```
GET  /api/v1/catalog/categories
GET  /api/v1/catalog/brands
GET  /api/v1/catalog/products
GET  /api/v1/catalog/products/{slug}
```

Every `/api/v1/admin/catalog/**` operation is protected and additionally requires the `ADMIN` role,
which the end-to-end suite proves by denial.

## Excluded-domain changes approved by this milestone

- `scripts/openapi-check.mjs`: `product` removed from the excluded-term list.
- `scripts/check-repository-hygiene.mjs`: `catalog` and `product` removed from `excludedModules`.
- Every other excluded term remains rejected, and the repository-hygiene unit test asserts a
  still-excluded module directory is still refused.

## Seeded-failure rejection

After a clean gate pass, one deliberate contract failure is introduced (a drift between the committed
document and the generated document, and a stray root `.env` for the hygiene gate), the gate is shown
to fail, the deliberate failure is removed, and the gate is re-run green. The residue is verified
absent afterwards.
