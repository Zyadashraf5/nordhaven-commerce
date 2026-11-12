# F04 progress checkpoint (recovery-safe)

Milestone: Stage 4 storefront screens in `front/`, per `ui/stage4` exports (19 ZIPs).
F01–F03 are complete and preserved. No backend work (NestJS/Prisma/DB). Nothing committed or pushed.
Never present a demo as a connected backend. Real API integration happens in F06.

## Source of truth

- Stage 4 ZIPs at `ui/stage4` (19 archives), extracted read-only to
  `C:\Users\zyad\AppData\Local\Temp\opencode\stage4-extract\<name>\`. Originals untouched.
- Board text extracted to `C:\Users\zyad\AppData\Local\Temp\opencode\stage4-text.txt`.
- Backend contracts (read-only): `openapi\openapi.json` — order/pre-order/return/review/notification/shipment/payment state enums.

## Implementation status — COMPLETE

All 19 references mapped to screens and implemented:

| #   | ZIP                                           | Mapped screen(s)                      | Route                                   | Status |
| --- | --------------------------------------------- | ------------------------------------- | --------------------------------------- | ------ |
| 1   | Notifications - desktop 1440                  | Notifications center                  | /account/notifications                  | done   |
| 2   | Notifications - mobile 390                    | Notifications center (narrow)         | /account/notifications                  | done   |
| 3   | Notifications - tablet 768                    | Notifications center (tablet)         | /account/notifications                  | done   |
| 4   | Order detail - mobile Arabic RTL              | Order detail RTL variant              | /account/orders/[id]?lang=ar            | done   |
| 5   | Order statuses - every customer-facing state  | Status pills + timeline               | shared components                       | done   |
| 6   | Orders - desktop 1440                         | Orders list                           | /account/orders                         | done   |
| 7   | Orders - mobile 390                           | Orders list (narrow)                  | /account/orders                         | done   |
| 8   | Orders - tablet 768                           | Orders list (tablet)                  | /account/orders                         | done   |
| 9   | Pre-orders - desktop 1440                     | Pre-orders list                       | /account/pre-orders                     | done   |
| 10  | Pre-orders - mobile 390                       | Pre-orders list (narrow)              | /account/pre-orders                     | done   |
| 11  | Pre-orders - product state and status gallery | Pre-order status cards                | shared components                       | done   |
| 12  | Returns - tablet 768                          | Returns (tablet)                      | /account/returns                        | done   |
| 13  | Returns & refunds - desktop 1440              | Returns list + request + detail       | /account/returns, /account/returns/[id] | done   |
| 14  | Returns & refunds - mobile 390                | Returns (narrow)                      | /account/returns                        | done   |
| 15  | Reviews - desktop 1440                        | Product reviews + My reviews          | /reviews/[slug], /account/reviews       | done   |
| 16  | Reviews - mobile 390                          | Product reviews + My reviews (narrow) | /reviews/[slug], /account/reviews       | done   |
| 17  | Reviews - tablet 768                          | Product reviews + My reviews (tablet) | /reviews/[slug], /account/reviews       | done   |
| 18  | Shipment tracking - desktop 1440              | Shipment tracking                     | /account/orders/[id]                    | done   |
| 19  | Shipment tracking - mobile 390                | Shipment tracking (narrow)            | /account/orders/[id]                    | done   |

## Routes implemented

- /account/orders — orders list with status tabs, search, empty/loading/error states
- /account/orders/[orderId] — order detail + shipment tracking + cancel, `?lang=ar` Arabic RTL
- /account/pre-orders — pre-orders list, pay/cancel flows, ready-to-pay window
- /account/returns — returns list + start-return stepped form + return detail
- /account/returns/[returnId] — return detail, refund status
- /account/reviews — my reviews (ready to review + your reviews, moderation)
- /reviews/[slug] — product reviews on PDP, rating, write-a-review form
- /account/notifications — notifications center, read/unread, preferences

## New files

- front/src/data/f04-sample.ts — shared demo data (orders, pre-orders, returns, reviews, notifications, shipments, ready-to-review), contract-shaped
- front/src/components/f04/f04.module.css — shared Warm Editorial styles
- front/src/components/f04/OrderStatusBadge.tsx — status pills (order/pre-order/return/review/shipment/notification)
- front/src/components/f04/OrderTimeline.tsx — progress timeline
- front/src/components/f04/OrdersPage.tsx
- front/src/components/f04/OrderDetailPage.tsx
- front/src/components/f04/PreOrdersPage.tsx
- front/src/components/f04/ReturnsPage.tsx
- front/src/components/f04/MyReviewsPage.tsx
- front/src/components/f04/ProductReviewsPage.tsx
- front/src/components/f04/NotificationsPage.tsx
- front/src/app/account/orders/page.tsx
- front/src/app/account/orders/[orderId]/page.tsx
- front/src/app/account/pre-orders/page.tsx
- front/src/app/account/returns/page.tsx
- front/src/app/account/returns/[returnId]/page.tsx
- front/src/app/account/reviews/page.tsx
- front/src/app/reviews/[slug]/page.tsx
- front/src/app/account/notifications/page.tsx

## Modified files

- front/src/components/layout/AccountSidebar.tsx — Orders/Pre-orders/Returns/Reviews/Notifications now link to real F04 routes (was placeholderHref)
- front/docs/f03-progress.md — updated remaining-work notes

## Backend state models (read-only contracts, openapi.json)

- Order: PENDING_PAYMENT, PAID, PAID_PENDING_ALLOCATION, PAYMENT_FAILED, CANCELLED, EXPIRED, FULFILLED, REFUNDED
- Pre-order: AWAITING_STOCK, STOCK_RESERVED, AWAITING_PAYMENT, CONVERTED, CANCELLED, EXPIRED
- Return: REQUESTED, APPROVED, REJECTED, RECEIVED, REFUNDED, CANCELLED
- Review: PENDING, APPROVED, REJECTED (verified-purchase eligibility)
- Shipment: PREPARED, PACKED, HANDED_OVER, DELIVERED, CANCELLED
- Notification: PENDING, DELIVERED, FAILED, SKIPPED

## Honesty rules applied

- No fake payment/refund/shipment/notification success. PENDING/FAILED never shown as REFUNDED.
- Pre-orders collect no payment until stock reserved; "pay" states the demo boundary.
- All data clearly labelled "Preview with sample data".
- Cart summary reads "Estimated total"; nothing reserved.

## Gates (all passing)

- tsc --noEmit: clean
- eslint --max-warnings 0: 0 problems
- vitest: 139 passed / 16 files
- next build: success (26 routes incl. all F04)
- Smoke: all new routes HTTP 200 on prod 3002; Arabic RTL order detail renders dir=rtl + Arabic copy

## Known limitations / F06 dependencies

- All F04 data is isolated demo sample data; no live API calls.
- No real payment, refund, shipment carrier, or email/SMS delivery.
- Return eligibility and refundable amounts owned by backend (F06).
- Review persistence/moderation owned by backend (F06).
- Pre-order atomic reservation owned by backend (F06).
- Order cancellation is UI-only in this build (no backend call).

## F01–F03 preservation

- Cart, wishlist, auth, account (overview/addresses/profile/security), checkout, confirmation all unchanged and verified HTTP 200.
- No backend, Prisma, DB, or migration changes.
- Nothing committed or pushed.

## Continuation instructions for F05

- F05 = Admin pages. Do not create fictional admin pages in F04; none exist here.
- Next: connect F04 demo data to live backend contracts in F06 (orders, pre-orders, returns, reviews, notifications, shipments, payments).
