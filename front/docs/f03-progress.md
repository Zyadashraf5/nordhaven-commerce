# F03 progress checkpoint (recovery-safe)

Milestone: Stage 3 storefront screens in `front/`, per `ui/stage3` exports.
F01 (homepage) and F02 (PLP/PDP/bundles) are complete and must not regress.
No backend work (NestJS/Prisma/DB). Nothing committed or pushed. Never present
the demo as a connected backend.

## Inventory (done)

- 20 Stage 3 ZIPs found at `ui/stage3` (Cart 4, Wishlist 3, Auth 3, Account 4,
  Checkout 5, Confirmation 1). Extracted read-only to
  `C:\Users\zyad\AppData\Local\Temp\opencode\stage3-extract\`. Originals
  untouched. Tablet archives wrap the desktop HTML; both read. Vendor bundles
  (`react.js`, `react-dom.js`, `support.js`) never copied into the app.

## Package A — Cart & Wishlist (COMPLETE, verified live)

- `src/lib/cart.ts` — pure cart engine: resolveCartLine (fixed/dynamic set
  availability, stock ceilings, board message strings), summariseCart (totals
  exclude unavailable lines, discount from was-pair, blocked-title strings).
  Unit-tested in `src/lib/cart.test.ts` (10 tests).
- `src/data/cart-sample.ts` — demo items derived from the accepted catalog
  records + board sample stocks; covers all 6 casserole variants (picker
  landings), 6 simple items, both bundle kinds; wishlist records + picker
  defaults. Clearly labeled `Sample` where the records don't carry the value.
- `src/components/providers/CartWishlistProvider.tsx` — demo cart/wishlist
  store mounted in `StorefrontShell`: qty set/increase/decrease, remove, undo,
  move-to-wishlist / move-to-cart, price-change acknowledgment, shared toast
  (Undo / View cart / View wishlist), header counts. In-memory only, seeded
  with board-line demo data; no persistence, no backend.
- `src/components/shop/CartPage.tsx` + module + `src/app/cart/{page,error}.tsx`
  — cart route: 7 seeded lines (casserole ×2, plates ×2, board with price
  notice, fixed set, dynamic set, jars out-of-stock), blocked alert, summary
  card (reverse of board: "Estimated total"), disabled checkout when blocked,
  reserve note, empty state (board copy + approved F01 imagery), mobile sticky
  checkout bar, error card. Route-level loading file removed on purpose — see
  "streaming note".
- `src/components/layout/AccountSidebar.tsx` + module — account sidebar
  ("Hello, Mariam", section nav with demo unread pill, sign-out stub), shared
  with the wishlist and later account pages.
- `src/components/shop/WishlistPage.tsx` + module + `src/app/wishlist/{page,error}.tsx`
  — 9 demo records in board order with action modes: Move to cart /
  Choose options / View set / View details / Out of stock+reason; swatches
  from the record, discount + pre-order badges, toast with Undo, sidebar.
- `src/components/home/VariantSheet.tsx` — additive change ONLY: optional
  `onAdd` + `addLabel` props (default path unchanged → F01/F02 behavior
  preserved). Used by the wishlist picker ("Move to cart").
- `src/components/ui/Icon.tsx` — additive Stage 3 icons (house, orders,
  returns, reviews, bell, pin, lock, sign-out, trash).
- `src/components/layout/SiteHeader.tsx` — cart/wishlist now link to real
  routes with live demo counts (badges); account entry still opens the
  sign-in sheet. Header test updated to the new contract (+2 tests).

## Streaming note (important for recovery)

The cart/wishlist loading.tsx route files were DELETED: on Next 15.5 static
routes, a single streamed Suspense boundary never runs its swap script
($RC/$RB/$RV batch completes only when a second pair arrives — /products has
2 boundaries and works; single-boundary routes wedge on the skeleton).
Routes render fully server-side without the skeleton; the board loading and
error states remain covered by error.tsx + tests. If loading.tsx is
re-introduced here, expect the wedge.

## Gates at this checkpoint

- tsc --noEmit clean; eslint 0 problems; vitest 99 passed / 10 files;
  production build OK (/cart ○, /wishlist ○).
- Live checks (prod on 3002): cart seeded lines + SKUs + badges, blocked
  alert, totals (EGP 25,060 / −EGP 1,700 / EGP 23,360), sage cap 3 with
  hint, remove + undo, jars unavailable row, price notice + OK, checkout
  disabled, mobile sticky bar; wishlist 9 cards incl. all action modes,
  move-to-cart, picker (sage+24 move), remove/undo; header badges update.
- 1440 (iframe harness) and current-narrow width verified; no horizontal
  overflow. F01/F02 regression: `/` (h1 + 27 PLP cards), `/products`, PDP
  and bundle routes verified earlier this session; re-run at end of F03.

## UTF-8 incident (fixed)

A PowerShell byte-truncate double-encoded non-ASCII characters in
`cart-sample.ts` (Â·, Ã, —). Detected in the DOM and fixed via edit-tool
replaceAll. Verify with grep `Â|Ã|â€` before continuing — all clean now.

## Remaining for F03

- Package C: checkout + order confirmation — COMPLETE
  - `src/app/checkout/page.tsx` + `src/components/checkout/CheckoutPage.tsx` + module — 4-step flow (delivery address, shipping method, payment method, review & place order), `?lang=ar` Arabic RTL preview, demo honesty (no fake payment success, "Estimated total", no stock reservation).
  - `src/app/order-confirmation/page.tsx` — confirmation page showing boards' sample order as a clearly labelled preview.
  - `src/data/checkout-sample.ts` — sample items, totals, shipping/payment methods, order sample.
  - `src/components/checkout/CheckoutPage.test.tsx` — honesty tests (3 tests).
  - Cart "Continue to checkout" links to `/checkout` (pre-existing).
- End gates: lint/typecheck/vitest/build + F01/F02 regression + 1440/768/390 checks; final F03 acceptance report (this session).
- Intentional F02 carry-overs (not F03 scope): PDP mobile back link still missing; search-suggestions dropdown unimplemented.
