# F01–F05 visual audit and UI/UX polish (2026-10-23)

Scope: the whole `front/` app (storefront, customer account, admin). No backend, data, API or F06
work. Nothing committed. Backup taken before any edit:
`D:\projects\nordhaven-commerce-backup-front-20261023-180128.zip` (front/ without `node_modules`
and `.next`).

## How it was inspected (real, not inferred)

- Rendered in the Claude desktop built-in browser against `next dev` (port 3001) and, for the
  final passes, `next build` + `next start` (port 3003).
- Screenshots taken at 375, 768, 1024 and 1440 px for the pages listed below.
- Automated in-browser sweep (same-origin iframes at fixed widths) over 44 routes × 4 widths =
  176 page loads on the production build: page-level horizontal overflow, `h1` count, visible
  `main` landmarks, unlabeled form controls, unnamed buttons/links, broken images and image
  aspect-ratio distortion. A final 26-route × 4-width re-sweep ran on the last build.
- Keyboard: Tab order from page top (skip link, header search, focus rings) on `/cart`.
- RTL: `/checkout?lang=ar`, `/account/addresses?lang=ar`, `/account/orders/[id]?lang=ar`.

Board comparison was done in a second pass; see "Design-board comparison" below.

## Defects found and fixed

### Admin (F05)

| #   | Defect (observed)                                                                                                                                  | Fix                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A1  | Every admin page rendered a second "Admin" header, breadcrumb and demo note inside the shell (doubled chrome, nested `<main>`)                     | Removed the in-page copies from all 18 page components; `AdminLayout` owns them; pages use `.page`                           |
| A2  | React "unique key" error from `AdminLayout` breadcrumbs                                                                                            | Keyed `Fragment`                                                                                                             |
| A3  | Right-aligned numeric columns were never right-aligned (`.table th` / `.tableCell` beat `.textRight`)                                              | Specificity fix, logical `text-align: end` (mirrors in RTL)                                                                  |
| A4  | Admin pages overflowed the viewport by up to 494 px at 375 and 80 px at 768                                                                        | Stacked column flex no longer sizes to the widest table; filter chips flex; section padding at < 600 px                      |
| A5  | 13 CSS-module classes used by admin order detail / edit product / inventory were never defined (unstyled)                                          | Defined `statRow`, `summaryGrid`, `fieldHelp`, `lineItem*`, `headRow`, `demoAlert`, `subsectionTitle`, disabled `btnOutline` |
| A6  | Order detail: no `h1`; shipment block hard-coded "DELIVERED" + one tracking number for every order; `<li>` inside `<div>`                          | `h1` "Order {number}"; shipment read from `f05Shipments` by order id, honest empty state otherwise; `<ol>`                   |
| A7  | Order detail "Cancel order" disabled with no disabled styling                                                                                      | Disabled style + label "Cancel order (arrives with F06)" (still disabled)                                                    |
| A8  | **AdminCatalogProductsPage**: duplicated SKU rows (key collision) and an invented "In stock" for every row                                         | Distinct SKUs; stock read from the inventory sample, "Not tracked" when the sample has none                                  |
| A9  | **AdminPreOrdersPage**: header/cell alignment mismatch; "Total" shown for awaiting-stock pre-orders (no payable amount); tabs lacked pressed state | Aligned columns; "Item price"; `aria-pressed`, `type="button"`, group label                                                  |
| A10 | **AdminOverviewPage**: money cards linked back to `/admin`; plain `<a>`; Overview icon rendered as an empty square; no current breadcrumb          | Link to `/admin/payments`; `next/link`; repaired `chart` icon path; "Overview" crumb                                         |
| A11 | Sidebar "Pricing" pointed to the products list (same as Catalog)                                                                                   | Points to the pricing screen; that route marks "Pricing" active                                                              |
| A12 | Edit product: name/SKU fields carried an always-on "invalid" class                                                                                 | Removed (no validation state exists)                                                                                         |
| A13 | Admin tables wrapped order numbers, dates and amounts mid-value at 768                                                                             | Values stay on one line; table scrolls                                                                                       |

### Storefront and account (F01–F04)

| #   | Defect (observed)                                                                                                                                    | Fix                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| S1  | Header at 1024–1279: account/cart wrapped to a second row, "New in" clipped                                                                          | Tighter gaps / search basis in that range                         |
| S2  | Header search had no visible keyboard focus                                                                                                          | Focus ring on the search pill (`:focus-within`)                   |
| S3  | No skip link                                                                                                                                         | "Skip to content" on both shells                                  |
| S4  | Global `numerals` class used in 18 files but never defined                                                                                           | Defined globally                                                  |
| S5  | Nested `<main>` landmarks in 17 storefront/account components                                                                                        | Inner ones are `div`; the shell's `main#main` is the landmark     |
| S6  | PDP mobile: gallery 252 px wide instead of full width                                                                                                | Stretch gallery/details in the stacked layout                     |
| S7  | PDP and cart sticky bars: headings ghosted through the 97% background                                                                                | Backdrop blur (board colour kept)                                 |
| S8  | Cart mobile: product image rendered 84 × 900                                                                                                         | `height: auto` so the 4:5 ratio applies                           |
| S9  | Cart mobile: line-actions divider ran 16 px past the card                                                                                            | Stretch + end-only bleed                                          |
| S10 | Wishlist: card images 357 × 900; account nav squeezed to 264 px at 768                                                                               | 4:5 ratio; full-width nav when stacked                            |
| S11 | Checkout heading "8 items · 8 items"                                                                                                                 | Single count                                                      |
| S12 | Checkout summary rows at 390: name one word per line, quantity overlapping it                                                                        | Grid: image / name / price with "was" price under                 |
| S13 | Account Orders: tabs drawn as browser-default bordered buttons; "All orders 0"; tabs overflowed the page by 275 px at 375; search input not labelled | Underline tabs, real count, horizontal tab scroller, `label`/`id` |
| S14 | Back links ("Back to my account/orders") used a forward chevron after the text (7 places)                                                            | Back chevron before the text                                      |
| S15 | Account nav at 375: Notifications bell icon shrank to 0 px; at 768 the nav was a 280 px strip                                                        | Icons `flex: none`; full-width when stacked                       |
| S16 | PDP thumbnail buttons had no accessible name                                                                                                         | "Image n of m"                                                    |
| S17 | Home hero figure overflowed by 6 px at 1024                                                                                                          | Capped to its grid track                                          |

### Arabic RTL

| #   | Defect (observed)                                                                                           | Fix                                                          |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| R1  | `/checkout?lang=ar`: English fragments re-ordered by the RTL paragraph ("of 4 1", "items 8", "cm · Oat 27") | `<bdi>` isolation                                            |
| R2  | Arrows/chevrons kept LTR direction inside RTL                                                               | `Icon` marks directional icons; mirrored under `[dir='rtl']` |
| R3  | Admin table alignment used physical left/right                                                              | Logical start/end; timeline uses logical insets              |

## Verification (actually executed, final build)

| Gate                                                                                     | Result                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`                                                                           | pass, 0 errors                                                                                                                                                                    |
| `eslint . --max-warnings 0`                                                              | pass, 0 problems                                                                                                                                                                  |
| `vitest run`                                                                             | 21 files, 156 tests pass                                                                                                                                                          |
| `next build`                                                                             | pass, 35 static pages                                                                                                                                                             |
| Browser sweep, full (44 routes × 375/768/1024/1440)                                      | before fixes: overflow on 17 route/width pairs (up to 494 px), 22 admin loads without an `h1`; after: 0 overflow except one cart case fixed below                                 |
| Browser sweep, final (26 routes × 4 widths)                                              | 0 page overflow, exactly one `h1` and one visible `main` per page, no distorted card images; only `/cart` at 360 px content width overflowed 3 px (fixed: cart text actions wrap) |
| Narrow re-check (360 and 375 px; cart, wishlist, checkout, account orders, admin orders) | 0 px overflow on all 10                                                                                                                                                           |

Test change: `AdminOrderDetailPage.test.tsx` asserted the duplicated breadcrumb text (two copies
of "Order not found"); it now asserts the page `h1` instead.

## Design-board comparison (second pass, 2026-10-23)

How: the `ui/` exports were extracted into a scratch folder (Stage 3/4 ZIPs unzipped, Stage 1/2
HTML and the existing `ui/stage5-extracted` copied) and served together with the production build
through a same-origin local proxy, so one script could read both DOMs. For each board and its
route, every visible text node was matched by text and its computed font family, size, weight,
colour, letter-spacing, case and position compared; confirmed differences were then checked with
side-by-side screenshots at the board's width. Boards compared: Stage 1 home (1440, 390); Stage 2
PLP, PDP, fixed and dynamic set (1440, 390); Stage 3 cart, checkout, account, wishlist, sign-in,
order confirmation; Stage 4 orders, pre-orders, returns, reviews, notifications, tracking, order
detail Arabic RTL; Stage 5 admin overview, orders and admin mobile.

The board exports render buttons with the browser default font (Arial, black); those diff rows are
board artefacts, not app defects, and were ignored.

### Fixed to match the boards

| Area                       | Board                                                                                                                                                                                                                              | Was                                                                                                                                                                                                                        | Now                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Mobile header, inner pages | compact: menu + search icon, account + cart, nothing below                                                                                                                                                                         | full home header (search field, chip row)                                                                                                                                                                                  | `SiteHeader` `mobileVariant`: `full` (home), `search` (listing), `compact` (other store pages) |
| Checkout chrome            | own header (back, wordmark, "Secure checkout"); no announcement bar                                                                                                                                                                | full store header                                                                                                                                                                                                          | `CheckoutHeader`, `ShopShell chrome="checkout"`                                                |
| Checkout layout            | "Checkout", "Step n of 4" + 4-segment bar, current step card, other steps as collapsed rows, narrow summary on the end side; mobile summary toggle with total and sticky "Total so far" bar; "Continue to shipping/payment/review" | long summary first, "1 of 4 · …", plain "Continue"                                                                                                                                                                         | restructured                                                                                   |
| Checkout address step      | default address pre-selected; "Default" pill on the default address                                                                                                                                                                | nothing selected (Continue disabled though the intro says the default is selected); pill on the selected card; English cards and review step showed the Arabic governorate; Arabic preview translated only the governorate | fixed; radios keyboard-operable                                                                |
| Listing, mobile            | "‹ Home", title, intro, pills, then Filters/Sort, then count                                                                                                                                                                       | Filters/Sort forced to the top (`order: -1`)                                                                                                                                                                               | board order + back link                                                                        |
| Product page               | Home / category / product; mobile "‹ category" link                                                                                                                                                                                | extra unrelated "All products" level; no mobile link                                                                                                                                                                       | fixed                                                                                          |
| Ready-packed set           | 36 px "Set details", bulleted "How it works", small thumbnails                                                                                                                                                                     | 26 px heading, bullets removed, thumbnails ~900 px tall on mobile                                                                                                                                                          | fixed                                                                                          |
| Secondary text colour      | `#3E423F`                                                                                                                                                                                                                          | `color: var(--hw-text-body)` (a font-size token) in 20 rules → fell back to charcoal                                                                                                                                       | `--hw-text-secondary`                                                                          |
| Home, mobile               | heading and tabs left, full-width tabs                                                                                                                                                                                             | pushed right, "On offer" wrapped                                                                                                                                                                                           | fixed                                                                                          |
| Cart, mobile               | title left (34 px) with count right; text-only actions                                                                                                                                                                             | right-aligned 40 px title; icon actions wrapping                                                                                                                                                                           | fixed                                                                                          |
| Wishlist cards             | name 500, brand 12/600, price 18, partial availability green, pre-order badge info blue                                                                                                                                            | 600, 10.5/700, 16, amber, charcoal                                                                                                                                                                                         | fixed                                                                                          |
| Account, mobile            | inner pages: "‹ My account" then the page; overview: cards then a one-column menu list                                                                                                                                             | breadcrumb + greeting + 2-column nav repeated on every page                                                                                                                                                                | fixed (AccountLayout, AccountSidebar, wishlist)                                                |
| Account orders             | order cards (number, date, status, thumbnails, first item, count · total); pills All / In progress / Delivered / Cancelled & failed                                                                                                | thin rows with a no-op radio; one tab per raw state                                                                                                                                                                        | fixed                                                                                          |
| Order confirmation         | check mark, "Thank you, Mariam", order-number card, "What happens next", actions, then details                                                                                                                                     | different order; buttons unstyled (non-existent global classes); invalid margin; duplicated footer line                                                                                                                    | rebuilt, with a sample-data note                                                               |
| Stage 4 headings           | 30 px (26 px mobile)                                                                                                                                                                                                               | 30–40 px                                                                                                                                                                                                                   | fixed                                                                                          |
| Arabic previews            | IBM Plex Sans Arabic text, Markazi Text headings                                                                                                                                                                                   | Figtree / Newsreader                                                                                                                                                                                                       | global `[lang='ar']` faces                                                                     |
| Admin shell                | charcoal full-height sidebar, grouped sections, light top bar, no store chrome; mobile dark bar + drawer                                                                                                                           | storefront header/footer around light cards                                                                                                                                                                                | new `AdminLayout`; admin routes no longer use `ShopShell`                                      |
| Admin pages                | title and tabs on the canvas, underlined tabs, tables in white cards with an uppercase header band                                                                                                                                 | everything in one white card, filled terracotta pills                                                                                                                                                                      | shared admin styles; overview titled "Overview"                                                |

Test changed: `CheckoutPage.test.tsx` uses the board's button names ("Continue to shipping" …).

Verification after the board pass (final production build): `tsc` 0 errors; ESLint 0 problems;
Vitest 21 files / 156 tests pass; `next build` 35 static pages; browser sweep of 44 routes ×
360/768/1024/1440 (176 loads): 0 page overflow, exactly one `h1` and one visible `main` per page,
no error pages. Admin drawer verified to open and close (Escape) at 390.

### Board elements intentionally not reproduced

- Checkout "Your items are held for 14:56": checkout reserves no stock before F06.
- Admin top-bar search, bell, Help and date-range buttons: no behaviour exists yet; the signed-in
  identity and MFA state are shown instead.
- Admin overview chart, KPI deltas, "Needs attention" queue, inventory-alert panel; admin orders
  filter selects, "Shipping settings" and pagination: no data or behaviour to back them, and the
  honesty rules forbid inventing figures.
- Board sample content (10–16 orders, a "Family" address, five casserole photos): the app keeps its
  own sample data.
- Product-type breadcrumb level ("Casseroles & Dutch ovens"): no product-type data or route.
- Sidebar "Shipping": no shipping screen.

## Final polish pass (2026-10-23)

| Item                                                                                                                                                                                          | Fix                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout review step listed a different hard-coded sample order (5 items, EGP 18,590) next to the cart summary (8 items, EGP 23,360), and labelled it "Total paid" before anything was placed | the review step now shows the cart's available lines, the chosen delivery, "Tax — calculated when you place the order" and "Estimated total before tax" (items + delivery) |
| `/checkout?lang=ar` was English apart from the address step                                                                                                                                   | header, title, stepper, step rows, summary toggle and card, sticky bar, buttons and review step in Arabic; Arabic comma in address lines                                   |
| `/admin/orders?lang=ar` was English/LTR                                                                                                                                                       | RTL shell (sidebar on the right), Arabic sidebar, breadcrumb, page copy, tabs, filters, table headers and order/pre-order status badges; dates isolated with `<bdi>`       |
| Mobile account greeting                                                                                                                                                                       | "Hello, Mariam" on the narrow layout, "Welcome back, Mariam" on the wide one (per the two boards)                                                                          |
| Mobile cart line                                                                                                                                                                              | stock and saving on one row (board)                                                                                                                                        |
| Cart unavailable alert colour                                                                                                                                                                 | new token `--hw-status-error-strong` (#7E2A21) from the board, used for the alert and "No longer available"                                                                |
| PLP chips wrapping at 1440                                                                                                                                                                    | not a defect: the PLP desktop board wraps "Sets & bundles" to a second row too                                                                                             |

Arabic copy source: strings present on the RTL boards ("Checkout review — mobile Arabic RTL",
"Admin — Orders, Arabic RTL") were used verbatim. Strings those boards do not show were translated
in this pass and are marked `// *` in `CheckoutPage.tsx`, `AdminLayout.tsx`, `AdminSidebar.tsx`,
`AdminOrdersPage.tsx` and `OrderStatusBadge.tsx`; **they need translator review**.

Verification (final build): `tsc` 0 errors; ESLint 0 problems; Vitest 21 files / 156 tests pass;
`next build` 35 static pages; browser sweep of 45 routes (including both Arabic admin and checkout
previews) × 360/768/1024/1440 = 180 loads: 0 page overflow, one `h1` and one visible `main` per
page, no error pages. Checked visually: `/admin/orders?lang=ar` at 1440 against its board,
`/checkout?lang=ar`, `/cart` and `/account` at 375.

## Remaining UI/UX issues (not fixed)

1. Admin page bodies follow the boards' structure only partly (see "not reproduced").
2. In the Arabic previews, sample data stays English: product names, customer names, dates
   ("21 Apr 2026"), shipping and payment method names, and the bodies of the checkout shipping and
   payment steps. Only `/admin/orders` has an Arabic admin preview; other admin pages are English.
3. Admin order detail shows the same sample delivery address for every order (sample data).
4. On `/products` and PDPs, Next's hidden streaming placeholder from `loading.tsx` keeps a second,
   hidden `main#main` in the DOM (not exposed to assistive tech).
