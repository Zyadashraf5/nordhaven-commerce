# F07 — Premium motion & interaction system (handoff)

Status: **implemented, awaiting Product Owner visual review (2026-10-24).** Not accepted. Nothing here
marks F06 (Batches 2–4) accepted or the store production-ready. No commits, pushes or deployments were made.

## 1. Backup and rollback

- Backup taken before any F07 change:
  `D:\projects\nordhaven-commerce-backup-front-pre-f07-20261024-160538.zip` (front `src`, `public`, `docs`,
  `package.json`, root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`; verified 233 src
  entries, 37 public files, lockfile present).
- F07 can be rolled back independently of F06:
  1. Delete `front/src/motion/` (runtime, CSS, tests, vendored React Bits).
  2. `front/src/app/layout.tsx`: remove the `prepaint` / `motion.css` imports, the `<head><script>` and
     `suppressHydrationWarning` on `<html>`.
  3. `front/src/components/providers/StorefrontShell.tsx`: remove the `<MotionProvider>` wrapper.
  4. `ShopShell.tsx`, `app/page.tsx`, `AdminLayout.tsx`: change `<MotionMain …>` back to `<main id="main" …>`.
  5. Remove `<Pulse>` / `<Magnet>` wrappers and `useImageSwap` (SiteHeader, ListingCard, ProductCard,
     ProductDetailShell, HeroSection) — each wraps unchanged children.
  6. `data-reveal*`, `data-split`, `data-intro`, `data-parallax`, `data-shine`, `data-rows`, `data-lenis-prevent`
     and `hw-anim-*` classes are inert without the runtime and may stay or be removed.
  7. Remove the matchMedia stub appended to `front/vitest.setup.ts`.
  8. `front/package.json`: remove `gsap`, `@gsap/react`, `lenis`; re-install to update the lockfile.
     Or restore the files above from the backup zip.

## 2. Integrations (exact)

| Library       | Version                                                                                    | Use                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gsap`        | 3.15.0                                                                                     | Core tweens/timelines, `ScrollTrigger` (reveals, batch, scrub parallax), `SplitText` (headline rise, free since 3.13), `gsap.context` for cleanup, `gsap.ticker` as the single RAF loop, `quickTo` (Magnet).                                                                                                                                   |
| `@gsap/react` | 2.1.2                                                                                      | `useGSAP` registered once in `motion/gsap.ts` (available to components; the runtime itself uses `gsap.context` in effects).                                                                                                                                                                                                                    |
| `lenis`       | 1.3.26                                                                                     | Smooth wheel scrolling. 1.3.27 was skipped because it was released less than two weeks earlier.                                                                                                                                                                                                                                                |
| React Bits    | vendored source (MIT + Commons Clause, notice in `motion/reactbits/LICENSE-react-bits.md`) | **Magnet** (`reactbits/Magnet.tsx`, GSAP `quickTo` instead of CSS transitions); **SplitText**, **AnimatedContent**, **ShinyText** patterns adapted into `binder.ts` (`split`, `reveal`, `shine`). CountUp and BlurText were not used: they require the `motion` package, and a counting number would misrepresent prices/totals mid-animation. |

### Runtime files (`front/src/motion/`)

- `tokens.ts` — durations (xs .22 / sm .36 / md .7 / lg 1.05 s), eases (`power3.out`, `power2.out`), staggers
  (words .055, items .07, rows .018), distances (10/24/40 px), `revealStart: 'top 88%'`, parallax 6 %, admin
  (0.28 s, 8 px), `MAX_ANIMATED_ROWS = 20`.
- `gsap.ts` — registers plugins once; `lagSmoothing(0)`; `prefersReducedMotion()` (true when matchMedia is
  missing), `hasFinePointer()`.
- `MotionProvider.tsx` — mounted once in `StorefrontShell`.
  - **Lenis:** only on non-admin routes with a fine pointer and no reduced-motion preference.
    - `autoRaf: false`, driven by `gsap.ticker` (one RAF loop); `lenis.on('scroll')` calls `ScrollTrigger.update()`.
    - `allowNestedScroll`, `anchors: false` (native anchors/skip link), `syncTouch: false` (touch keeps native momentum).
    - A body-style MutationObserver stops Lenis while a sheet/menu locks scrolling.
  - **Binder:** runs per route inside a `gsap.context`, reverted on navigation.
    - First load waits for `load` + idle, so hydration finishes first.
    - Retries while Suspense content is still unhydrated, and a DOM observer binds API-loaded content.
- `binder.ts` — the declarative attribute engine (below). Skips nodes React has not hydrated (fiber check).
- `prepaint.ts` — inline script adding `html.hw-motion` before paint (omitted under reduced motion).
- `motion.css` — intro pre-paint state with 2.4 s CSS failsafe, split-line masks, shine sweep, parallax frame, Lenis
  base CSS, overlay keyframes (`hw-anim-sheet|backdrop|drop|drawer|toast`, using the independent `translate`
  property so existing transforms such as toast centring are untouched; drawer direction is RTL-aware), and a
  reduced-motion block that disables all of it.
- `MotionMain.tsx` — `<main id="main">` that fades in on client-side navigation only (never on first load).
- `feedback.ts` / `Pulse.tsx` — `Pulse` (count/heart pulse, price flash) animates only after the value changes and
  always renders the current value; `useImageSwap` (gallery crossfade).

### Attribute API

| Attribute                           | Effect                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `data-intro` / `data-intro="image"` | Part of the first-paint intro sequence (hero, page headlines).                                     |
| `data-split="words\|lines"`         | Static headline rises word by word, then reverts to the original text node. Only on static text.   |
| `data-reveal="up\|fade\|image"`     | Settles in when scrolled into view (below-fold only on first load).                                |
| `data-reveal-stagger`               | Children (or `[data-reveal-item]`) reveal staggered; items added later (filters, API) animate too. |
| `data-parallax="5"`                 | Image drifts ±5 % while crossing the viewport (desktop fine pointer only).                         |
| `data-shine`                        | One highlight sweep on badges.                                                                     |
| `data-rows`                         | Admin table body: first 20 visible rows fade in (0.28 s total budget).                             |
| `data-lenis-prevent`                | Overlay scrolls natively (sheets, mega menu).                                                      |

**Invariant: no invisible content.** Anything on screen at first bind is left exactly as the server rendered it.
Only below-fold content is pre-hidden, and only when a ScrollTrigger will reveal it. Intro content is guaranteed
visible by a CSS failsafe even if JS fails.

## 3. Pages and components enhanced / coverage matrix

Legend:

- **I** intro sequence
- **S** split headline
- **R** reveal on scroll
- **St** staggered list/grid
- **P** parallax
- **Sh** shine
- **F** feedback (pulse/flash/swap)
- **O** overlay animation
- **T** route fade on client navigation
- **Rw** admin rows

Every route also gets **T** and, where Lenis applies, smooth scroll.

| Route                                                                                                                                    | Motion                                                                                                                                   | Notes                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/`                                                                                                                                      | I (hero eyebrow/headline/body/actions/image), S, St (categories, products, bundles, trust), P (collection band), R, Magnet (primary CTA) | Product tab switch re-staggers the grid.                                         |
| `/products` (+ category/search/offers)                                                                                                   | I+S (title), St (grid incl. filter/"load more" results), Sh (discount badges), F (wishlist heart)                                        |                                                                                  |
| `/products/[slug]`                                                                                                                       | I+S (name), I image, F (thumbnail crossfade, price flash on variant change, sticky price flash), Sh (gallery badge), O (variant sheet)   | No per-colour photos in data, so colour changes correctly do not swap the image. |
| `/bundles/[slug]`                                                                                                                        | I+S (name)                                                                                                                               |                                                                                  |
| `/reviews/[slug]`                                                                                                                        | I+S, St (review list)                                                                                                                    |                                                                                  |
| `/cart`                                                                                                                                  | St (lines), R (summary), O (toast), F (header count)                                                                                     | Quantity changes never wait on animation.                                        |
| `/wishlist`                                                                                                                              | St (grid), O (toast), F (hearts)                                                                                                         |                                                                                  |
| `/checkout`                                                                                                                              | S (empty state), R fade (3 step sections)                                                                                                | Place-order is enabled the moment the quote returns; no animation gates it.      |
| `/order-confirmation`                                                                                                                    | S, St (next steps), R (cards)                                                                                                            |                                                                                  |
| `/account`                                                                                                                               | St (overview grid)                                                                                                                       | Greeting not split (dynamic name).                                               |
| `/account/sign-in` (+ register etc.)                                                                                                     | I+S (headlines)                                                                                                                          | Inputs focus normally.                                                           |
| `/account/profile`, `/security`                                                                                                          | I+S                                                                                                                                      |                                                                                  |
| `/account/addresses`                                                                                                                     | St (address grid)                                                                                                                        |                                                                                  |
| `/account/orders`, `/orders/[id]`                                                                                                        | I+S (list), St                                                                                                                           | Order detail title not split (dynamic).                                          |
| `/account/returns`, `/returns/[id]`, `/reviews`, `/notifications`, `/pre-orders`                                                         | I+S, St (lists)                                                                                                                          |                                                                                  |
| Header / global                                                                                                                          | F (cart & wishlist count pulse), O (mega menu drop, mobile drawer slide from inline start, backdrop), sign-in sheet O                    |                                                                                  |
| `/admin`                                                                                                                                 | St (stat grid), Rw                                                                                                                       | No Lenis, no parallax, no split; 0.28 s / 8 px.                                  |
| `/admin/*` (orders, catalog, inventory, bundles, customers, payments, pre-orders, returns, reviews, notifications, audit, states, users) | Rw on every table body, St (state grids), O (AdminNotice drop)                                                                           | Values are never animated or counted, and rows beyond 20 render instantly.       |
| `/dev/placeholder`, `/_not-found`                                                                                                        | T only                                                                                                                                   |                                                                                  |

## 4. Browser evidence (actual)

Production build (`next start`, port 3004) unless noted:

**Home**

- Lenis is active and the intro completes.
- Below-fold reveals fire on scroll; nothing on screen is ever hidden.
- CLS **0.004**, LCP **≈1.15 s**.

**Iframe probe, 21 routes: 0 console errors and 0 in-view hidden elements on every route**

- Storefront: `/products`, the PDP, offers, `/cart`, `/wishlist`.
- Account: `/account`, orders, addresses, security, returns, reviews, notifications, profile, pre-orders.
- Also: `/checkout`, product reviews, the bundle page, `/admin` (customer guard view).

**Bundle page (after the last edit)**

- The h1 is bound, at opacity 1, and the split has reverted.
- 0 hidden in-view elements.

**Navigation and interaction**

- Client navigation home → PDP: the route fades in and the binder re-binds without errors.
- PDP thumbnail crossfade observed (mid opacity 0.55, settles to 1).
- Sign-in sheet: slides up; Lenis is stopped while open and restarted on close.
- Keyboard:
  - real Tab presses move focus into main content and the page scrolls to follow it, with a visible focus outline
  - skip link → `#main` lands with main at the top
  - `scrollIntoView` works with Lenis on

**Mobile (375 px)**

- No Lenis and no parallax.
- No horizontal overflow.
- The drawer slides from the inline start.

**Arabic, RTL (`?lang=ar`), dev server**

- Checkout steps advance, and Place order is enabled immediately after the quote.
- A test mug was added via the API and removed afterwards, so the cart is empty again.

**Hydration**

- Dev server: no hydration warnings after the hydration-safe binder fix (it was reproduced first, then fixed).

**`/admin` as a customer**

- Guard panel shown and no Lenis.
- The 401/403 console entries in that tab are the guarded admin API responses, which is expected.

## 5. Performance & accessibility

**Performance**

- One RAF loop: GSAP's ticker drives Lenis.
- Below-fold reveals use `ScrollTrigger.batch` with `once: true`.
- Admin animates at most 20 rows.
- Every animation is transform or opacity only.
- Bundle cost: shared JS stays at 103 kB; storefront first-load JS rises by about 45–50 kB (home 189 kB, `/products` 194 kB, `/checkout` 193 kB).

**Accessibility**

- `prefers-reduced-motion: reduce`:
  - no pre-paint class, so nothing is hidden
  - no Lenis and no binder
  - CSS overlay keyframes disabled
  - `Pulse`, `Magnet` and the image swap do nothing
- SplitText restores the original text node, so screen readers and `textContent` are unchanged (verified in unit tests).
- Native anchors and skip link; focus is never trapped or delayed.

## 6. Tests (actual results, final run after the last edit)

- `tsc --noEmit`: **pass**.
- `eslint src scripts --max-warnings=0`: **pass**.
- `vitest run`: **29 files passed, 3 skipped; 221 tests passed, 21 skipped**. The F06 suites all still pass. That includes the 4 new motion tests:
  - reduced motion → nothing bound, no Lenis
  - the binder doesn't change text
  - unhydrated nodes are skipped
  - `Pulse` shows the current value
- `next build`: **compiled successfully**; all 45 routes built.

## 7. Remaining issues / not verified

1. **Signed-in admin screens not checked in a browser (BLOCKED).** Access to the admin password and TOTP secret was
   denied by the tool policy and was not worked around. Admin motion is verified by code review, the build and the guard view only.
   The PO should walk the admin pages signed in.
2. **Reduced motion not emulated in the browser.** Verified by code paths and unit tests only. The PO should toggle the OS
   setting ("Show animations" off on Windows, or DevTools ▸ Rendering ▸ prefers-reduced-motion).
3. Real touch devices were not tested; only mobile viewport emulation was used.
4. Bundle size is up about 45–50 kB on storefront routes.
5. Arabic copy is partial (an F06 state carried over, not an F07 issue).
6. In dev, the console still shows HMR/Fast Refresh noise; the production build is clean.

## 8. Local startup

```bash
corepack pnpm@12.13.0 --filter @nordhaven/front dev
```

Opens http://localhost:3001; the API (`api-f06` in `.claude/launch.json`) must run on port 3000 against `hc_f06_frontend_dev`.
For a production-like check:

```bash
corepack pnpm@12.13.0 --filter @nordhaven/front build
```

```bash
corepack pnpm@12.13.0 --filter @nordhaven/front exec next start --port 3003
```

## 9. Product Owner visual acceptance checklist

- [ ] Home: hero intro plays once on first load (headline rises word by word, image settles); no flash of hidden content.
- [ ] Home: scrolling feels smooth but not floaty; sections reveal just before they're reached; the collection image drifts subtly.
- [ ] Hero primary button leans slightly toward the cursor (desktop only).
- [ ] Listing: cards stagger in; filtering or loading more animates the new cards; discount badges shine once.
- [ ] Wishlist heart and header counts pulse on change; values are always correct immediately.
- [ ] PDP: thumbnails crossfade the main image; price flashes on variant change; variant sheet slides up.
- [ ] Cart/checkout: nothing waits on animation; Place order is available as soon as the quote appears; errors show immediately.
- [ ] Mobile: native scrolling, drawer slides from the correct side (EN left, AR right), no horizontal scroll.
- [ ] Arabic: layout mirrored, motion directions correct.
- [ ] Keyboard: Tab through a page — focus is visible and the page follows; skip link works.
- [ ] Reduced motion on: no animations and no smooth scroll, and everything is visible immediately.
- [ ] Admin (signed in): tables fade in quickly (≤0.3 s); no smooth scroll; numbers are never animated.
- [ ] Overall motion language feels cohesive and premium, not distracting. Approve or list changes.
