# F05 progress checkpoint (recovery-safe)

Milestone: Admin Dashboard frontend in `front/`, per Stage 5 design exports in `ui/stage5` (20 ZIPs).
F01–F04 are complete and preserved. No backend work (NestJS/Prisma/DB). Nothing committed or pushed.
Never present a demo action as a successful real backend operation. Real API integration happens in F06.

Repaired 2026-10-23: the previous session's output loop corrupted four admin components mid-write
(`AdminOrdersPage.tsx`, `AdminPricingPage.tsx`, `AdminOrderDetailPage.tsx`, `AdminEditProductPage.tsx`).
All four were repaired against the sibling-component conventions (`AdminPaymentsPage`, `AdminLayout`,
`OrderStatusBadge`) and the F05 checklist in this document. Pre-repair copies of the corrupted files
are retained at `C:\Users\zyad\AppData\Local\Temp\opencode\f05-repair-backup\`.

## Source of truth

- Stage 5 ZIPs live at `ui/stage5` (20 archives). The previous session's extraction folder
  (`ui/stage5-extract`) no longer exists; the interim extraction went to a temp directory that was
  cleaned. Board fidelity in this repair was therefore reconstructed from the F05 checklist below,
  the sibling page conventions and the shared `AdminLayout.module.css` tokens.
- Source of truth for contracts: `openapi/openapi.json` state enums (below, read-only).
- Compute only costs measurement work; it costs no customer identity. — n/a

## Stage 5 coverage matrix (20/20)

| #   | ZIP                                           | Mapped screen(s)                               | Route         | Status                                  |
| --- | --------------------------------------------- | ---------------------------------------------- | ------------- | --------------------------------------- |
| 1   | Admin Overview — desktop interactive          | `/admin`                                       | Stage 5 board | done                                    |
| 2   | Admin Overview — tablet 768                   | `/admin`                                       | Stage 5 board | done                                    |
| 3   | Admin Orders & Pre-orders — interactive       | `/admin/orders`                                | Stage 5 board | done                                    |
| 4   | Admin Orders — tablet 768                     | `/admin/orders`                                | Stage 5 board | done                                    |
| 5   | Admin Orders — Arabic RTL                     | `/admin/orders?lang=ar`                        | Stage 5 board | structure only (RTL pass in F06 polish) |
| 6   | Admin Order Detail & Fulfilment — interactive | `/admin/orders/[orderId]`                      | Stage 5 board | done                                    |
| 7   | Admin Order Detail — tablet 768               | `/admin/orders/[orderId]`                      | Stage 5 board | done                                    |
| 8   | Admin Mobile 390 — interactive                | `/admin` (all routes)                          | Stage 5 board | done (responsive shell)                 |
| 9   | Admin Products — interactive                  | `/admin/catalog/products`                      | Stage 5 board | done                                    |
| 10  | Admin Edit product — interactive              | `/admin/catalog/products/[productId]`          | Stage 5 board | done                                    |
| 11  | Admin Categories & attributes — interactive   | `/admin/catalog/categories`                    | Stage 5 board | done                                    |
| 12  | Admin Inventory — interactive                 | `/admin/inventory`                             | Stage 5 board | done                                    |
| 13  | Admin Bundles — interactive                   | `/admin/bundles`                               | Stage 5 board | done                                    |
| 14  | Admin Pricing & promotions — interactive      | `/admin/catalog/products/[productId]/discount` | Stage 5 board | done                                    |
| 15  | Admin Payments & refunds — interactive        | `/admin/payments`                              | Stage 5 board | done                                    |
| 16  | Admin Customers — interactive                 | `/admin/customers`                             | Stage 5 board | done                                    |
| 17  | Admin Shipping & returns — interactive        | `/admin/returns`                               | Stage 5 board | done                                    |
| 18  | Admin Reviews & notifications — interactive   | `/admin/reviews`, `/admin/notifications`       | Stage 5 board | done                                    |
| 19  | Admin Settings & audit log — interactive      | `/admin/audit`, `/admin/users`                 | Stage 5 board | done                                    |
| 20  | Admin System States Gallery                   | `/admin/states`                                | Stage 5 board | done                                    |

## Routes implemented

- `/admin` — operational overview dashboard
- `/admin/orders` — orders list with state tabs, search, bulk selection and pre-orders view
- `/admin/orders/[orderId]` — order detail + shipment tracking
- `/admin/pre-orders` — pre-orders list
- `/admin/returns` — returns list
- `/admin/reviews` — reviews list with moderation status
- `/admin/reviews/pending` — pending reviews
- `/admin/notifications` — notifications list
- `/admin/customers` — customers list
- `/admin/inventory` — inventory balances
- `/admin/bundles` — bundles list
- `/admin/payments` — payments & refunds overview
- `/admin/audit` — audit log
- `/admin/users` — admin users & MFA
- `/admin/states` — system states gallery
- `/admin/catalog/products` — products list
- `/admin/catalog/categories` — categories & attributes
- `/admin/catalog/products/[productId]` — product edit (Stage 5 board)
- `/admin/catalog/products/[productId]/discount` — pricing & promotions page (Stage 5 board)

## Components

Shared admin data, layout and shell:

- `front/src/data/admin-sample.ts` — shared demo data
- `front/src/components/admin/AdminLayout.tsx` + `AdminLayout.module.css` — admin shell
- `front/src/components/admin/AdminSidebar.tsx` — admin sidebar navigation

Page components (Stage 5 boards):

- `front/src/components/admin/AdminOverviewPage.tsx`
- `front/src/components/admin/AdminOrdersPage.tsx` (repaired)
- `front/src/components/admin/AdminOrderDetailPage.tsx` (repaired)
- `front/src/components/admin/AdminPreOrdersPage.tsx`
- `front/src/components/admin/AdminCatalogProductsPage.tsx`
- `front/src/components/admin/AdminEditProductPage.tsx` (repaired)
- `front/src/components/admin/AdminCategoriesPage.tsx`
- `front/src/components/admin/AdminInventoryPage.tsx`
- `front/src/components/admin/AdminBundlesPage.tsx`
- `front/src/components/admin/AdminPricingPage.tsx` (repaired)
- `front/src/components/admin/AdminPaymentsPage.tsx`
- `front/src/components/admin/AdminReturnsPage.tsx`
- `front/src/components/admin/AdminReviewsPage.tsx`
- `front/src/components/admin/AdminNotificationsPage.tsx`
- `front/src/components/admin/AdminCustomersPage.tsx`
- `front/src/components/admin/AdminAuditPage.tsx`
- `front/src/components/admin/AdminUsersPage.tsx`
- `front/src/components/admin/AdminStatesPage.tsx`

## The 2026-10-23 repair

What was broken (found by `pnpm --filter @nordhaven/front typecheck` before the repair):
~40 syntax errors in `AdminOrdersPage.tsx`, 12 in `AdminPricingPage.tsx`, 1 in
`AdminOrderDetailPage.tsx`, 7 in `AdminEditProductPage.tsx`; the F05 gate
`tsc --noEmit clean` was failing.

What was done:

- `AdminOrdersPage.tsx` — full clean rewrite: state tabs keyed to the order state enums, search by
  order number/customer, single-row + select-all checkboxes with a bulk bar whose action button is
  disabled and labelled "Order actions arrive with F06" (honesty rule: no fake order transitions),
  pre-orders view from `f05PreOrders`, empty state, defined CSS classes only.
- `AdminPricingPage.tsx` — full clean rewrite: Prices tab lists each distinct demo product once with
  its price and an explicit "—" discount column (no invented was-price/discount percentages);
  Promotions tab is an honest empty state per HC-CAT-009 (direct product discounts only), with a
  disabled "New promotion (F06)" button.
- `AdminOrderDetailPage.tsx` — repaired the truncated timeline row (`<div …>` closed with `</li>`).
- `AdminEditProductPage.tsx` — repaired the unbalanced specifications JSX, replaced mojibake strings
  with proper Unicode (`4.2 L (24 cm) – 6.7 L (28 cm)`, `Up to 250 °C…`, `4.6 kg … – 5.9 kg…`),
  removed an unused `f05Orders` import and a duplicated inline style key, and switched the image
  grid to the established `StorefrontImage` component (removes the `no-img-element` lint warning).
- `AdminSidebar.tsx` — "Pre-orders" now links to `/admin/pre-orders` (was `/admin/orders`).
- `AdminLayout.module.css` — added the shared classes the previous session referenced but never
  defined (`filterBar`, `filterChip`, `bulkBar`, `tableCell`, `productFormWrapper`, `imageGrid`,
  `imageTile`, `imageGridItem`, `dialogForm`, `formColumn`, `priceInputGroup`, `currencyLabel`,
  `specsGrid`, `specRow`, `btnPrimary`, `adminSectionLabel`), built on the existing Warm Editorial
  tokens.

Notes for the record:

- Every admin page component renders its own header/crumbs inside the `AdminLayout` content column;
  that is the sibling convention across all admin pages and was preserved as-is in the repair.
- Because the Stage 5 extraction folder was missing, column-level fidelity of the orders/pricing
  tables is derived from this checklist's own F05 description, not from a re-read board. The RTL
  Arabic variant (`?lang=ar`) is structure-only and logged above instead of claimed done.

## Backend state models (read-only contracts, openapi.json)

Order: PENDING_PAYMENT, PAID, PAID_PENDING_ALLOCATION, PAYMENT_FAILED, CANCELLED, EXPIRED, FULFILLED, REFUNDED
Pre-order: AWAITING_STOCK, STOCK_RESERVED, AWAITING_PAYMENT, CONVERTED, CANCELLED, EXPIRED
Return: REQUESTED, APPROVED, REJECTED, RECEIVED, REFUNDED, CANCELLED
Review: PENDING, APPROVED, REJECTED (verified-purchase eligibility)
Shipment: PREPARED, PACKED, HANDED_OVER, DELIVERED, CANCELLED
Notification: PENDING, DELIVERED, FAILED, SKIPPED
Payment attempt: PENDING, SUCCEEDED, FAILED, CANCELLED, REFUNDED

## Honesty rules (F05, unchanged and enforced in the repair)

- Admin is read-only orchestration (M13 FR-003): no live financial/production operation from the UI.
- No fake payment capture, refund, stock adjustment, order transition, or notification. The orders
  bulk bar and the promotions tab present explicitly disabled actions labelled "arrive with F06".
- PENDING/FAILED/UNKNOWN financial outcomes never shown as REFUNDED/SUCCEEDED.
- All data is isolated typed demo sample data; clearly labelled ("Preview with sample data").
- Admin actions require ADMIN role + MFA (enforced by the backend in F06; the shell states it).
- No real customer PII or credentials exposed in demo data.
- No invented derived numbers: no discount percentages, no order "age" column, no fake pagination.

## Verification evidence (2026-10-23, actually executed)

| Gate               | Command                                                 | Result                                         |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------- |
| TypeScript         | `pnpm --filter @nordhaven/front typecheck`              | PASS, exit 0, no errors                        |
| ESLint             | `pnpm --filter @nordhaven/front lint`                   | PASS, 0 problems, 0 warnings                   |
| Unit/component     | `pnpm --filter @nordhaven/front test`                   | PASS, 156 tests / 21 files (was 139/16 at F04) |
| Production build   | `pnpm --filter @nordhaven/front build`                  | PASS, 35 static pages, Next.js 15.5.28         |
| Smoke (admin)      | `next start -p 3003` + curl all admin routes            | all HTTP 200                                   |
| Smoke (regression) | same run: `/cart`, `/wishlist`, `/account`, `/products` | all HTTP 200                                   |

New component tests (colocated):

- `front/src/components/admin/AdminOrdersPage.test.tsx` — listing, search, state-tab filter,
  single + select-all bulk selection, pre-orders view.
- `front/src/components/admin/AdminPricingPage.test.tsx` — per-product dedupe, no invented
  discount data, edit links, honest promotions empty state.
- `front/src/components/admin/AdminOrderDetailPage.test.tsx` — known-order detail incl. shipment
  tracking, unknown-id not-found state (uses a mocked `useParams`).
- `front/src/components/admin/AdminEditProductPage.test.tsx` — prefilled fields, dirty-state Save
  gating, clean Unicode specification strings (regression for the mojibake corruption).
- `front/src/components/admin/AdminSidebar.test.tsx` — pre-orders route, section links, active state.

## Remaining work (out of F05)

- `/admin/orders?lang=ar` full Arabic RTL pass (structure-only today).
- First-cycle board-fidelity pass on the early Package A/B pages
  (`AdminOverviewPage`, `AdminPreOrdersPage`, `AdminCatalogProductsPage`) once the Stage 5 boards
  are re-extracted from `ui/stage5`; the earlier "needs visual update" marks stand for them.
- F06 — do not start without approval: connect the demo data to the live backend contracts
  (orders, pre-orders, returns, reviews, notifications, shipments, payments, catalog writes) and
  enforce ADMIN + MFA server-side.

STOP after F05 — do not start F06 without explicit Product Owner approval.
