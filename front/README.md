# Nordhaven Commerce — storefront frontend

The customer-facing storefront, built as an independent Next.js application.
This repository currently contains **Milestone 1: the approved homepage only**.

The homepage is a faithful implementation of the approved Stage 1 boards of the
Claude design artifact that lives in `../ui/Nordhaven Commerce — Storefront Design.html`
("Homepage — desktop 1440", "Homepage — mobile 390", "Mini style guide v0.2" and
"Homepage implementation notes").

---

## Quick start

```bash
# from the repository root
pnpm install
pnpm --filter @nordhaven/front dev      # http://localhost:3001
```

Or from inside this folder:

```bash
pnpm install
pnpm dev            # http://localhost:3001
```

| Command          | What it does                                           |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | Development server on <http://localhost:3001>          |
| `pnpm build`     | Production build                                       |
| `pnpm start`     | Serves the production build on <http://localhost:3001> |
| `pnpm lint`      | ESLint (flat config, `--max-warnings 0`)               |
| `pnpm typecheck` | `tsc --noEmit`                                         |
| `pnpm test`      | Vitest + Testing Library component tests               |

The application is self-contained: it has its own `package.json`, its own
`public/` assets, its own environment example and its own lint, type-check,
test and build commands. It can be moved out of this repository and deployed on
its own without touching the backend.

---

## Stack

| Concern   | Choice                                                      |
| --------- | ----------------------------------------------------------- |
| Framework | Next.js 15.5 (App Router, React Server Components)          |
| Language  | TypeScript 5.9 in `strict` mode                             |
| Styling   | CSS Modules + CSS custom properties (no CSS framework)      |
| Data      | Typed sample data, with a typed API client ready to swap in |
| Tests     | Vitest + Testing Library (jsdom)                            |
| Lint      | ESLint 9 flat config (typescript-eslint, react-hooks, Next) |

No UI kit, no CSS framework and no state-management library: the approved
design is reproduced with plain CSS so the tokens in the mini style guide stay
the single source of truth.

---

## Structure

```
front/
├── public/
│   ├── fonts/            Figtree, Newsreader, Markazi Text, IBM Plex Sans Arabic (self-hosted)
│   └── images/           the product and lifestyle photography recovered from the design artifact
├── src/
│   ├── app/
│   │   ├── layout.tsx            document shell + storefront shell (UI provider, sign-in sheet)
│   │   ├── page.tsx              the homepage, assembled from the storefront data
│   │   ├── globals.css           base element styles
│   │   ├── dev/placeholder/      development-only placeholder route (404s in production)
│   │   └── page.module.css
│   ├── components/
│   │   ├── feedback/     sign-in sheet
│   │   ├── home/         hero, category tiles, product showcase, product card,
│   │   │                 variant sheet, bundles, collection band, trust points
│   │   ├── layout/       announcement bar, site header, site footer
│   │   ├── providers/    storefront UI provider and shell
│   │   └── ui/           icons, images
│   ├── data/             domain types, money formatting, the sample catalogue
│   ├── lib/              product rules, links, the API client and its endpoints
│   └── styles/           design tokens (colours, type scale, spacing, shape, motion)
└── ...
```

### Design tokens

`src/styles/tokens.css` holds every token of the approved "Mini style guide
v0.2" board — the colour tokens (ivory `#FAF8F4`, charcoal `#242826`,
terracotta `#A65F45`, the neutral/border tokens and the reserved status
colours), the type scale (Newsreader for display, Figtree for UI), the 4-px
spacing scale, the grid breakpoints, the radii, the single shadow level and the
160–240 ms motion range. Components consume the tokens, never raw values.

### Responsive behaviour

One DOM serves both approved boards. The wide layout (≥ 1024 px) follows the
1440 px board; the narrow layout (< 1024 px) follows the 390 px board, including
its shorter copy, its two-column product grid, its category chip scroller and
its stacked footer. Where the two boards use different copy, both variants are
rendered and one is hidden with a media query (`hw-wide` / `hw-narrow`), so the
server-rendered markup stays correct for every viewport.

---

## Data and the backend boundary

**The homepage does not call the backend yet.** It renders
`src/data/homepage-sample.ts`, which is transcribed from the approved design
boards. Prices are illustrative and quoted in EGP, exactly as the boards show.

`src/lib/storefront.ts` is the single seam between the page and its data
source. When the catalog is connected, only that file changes — the components
already consume the domain types in `src/data/types.ts`.

`src/lib/api/` already contains the integration layer:

- `config.ts` — base URL and API prefix, read from the environment.
- `client.ts` — a small typed `fetch` client (bearer token, query strings, errors).
- `endpoints.ts` — the catalog endpoints that already exist in the backend
  (`GET /api/v1/catalog/categories`, `GET /api/v1/catalog/products`).
- `types.ts` — the response shapes, transcribed from `openapi/openapi.json`.

### Product rules

`src/lib/product.ts` implements the card rules of the approved style guide:
one sellable SKU → _Add to cart_; two or more attributes → _Choose options_;
out of stock → a disabled action that names the reason; a pre-order item →
_View details_; a bundle → _View set_ only.

### The two bundle kinds

The two bundles model different inventory, and the cards show the difference:

- **The First Kitchen Set** is a _fixed_ bundle: a finished-goods SKU with its
  own stock, one status for the whole set, and a fixed list of contents.
- **The Morning Coffee Set** is a _dynamic_ bundle: a fixed list of components
  whose availability is derived from each component SKU. Every component shows
  its own status and the set is available only while all of them are in stock.

Adding a bundle to the cart is not offered: the cart contract has not confirmed
how bundle lines are stored and priced.

---

## Behaviour that is deliberately not faked

- Browsing is public. The cart, the wishlist and the account belong to a
  signed-in visitor, so a signed-out tap opens a **sign-in sheet** and returns
  to the same page — the behaviour the approved boards specify.
- Every link that would leave the homepage points at
  `/dev/placeholder`, an explicit development-only route that explains that the
  screen belongs to a later milestone. It returns a 404 in a production build.
- No shipping, tax, discount or delivery promise is shown that the backend has
  not confirmed.

---

## Images and fonts

The photography and the type are the ones that shipped inside the approved
design artifact. They are reused, not recreated:

- `public/images/*.webp` — 14 unique photographs recovered from the artifact
  (hero, category tiles, product packshots, bundle and collection imagery).
- `public/fonts/*.woff2` — the Figtree, Newsreader and Markazi Text subsets from
  the artifact, plus the IBM Plex Sans Arabic subsets the style board links, for
  the later Arabic/RTL milestone. All are SIL Open Font License 1.1.

**Known gap:** the artifact did not ship the two remaining casserole
photographs (the _Sage_ and _Cream_ colourways). Those two swatches fall back
to the terracotta packshot; the gap is recorded in the repository README.

---

## Environment

Copy `.env.example` to `.env.local`. All variables are optional in Milestone 1.

| Variable                   | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Public base URL of the NestJS API         |
| `API_BASE_URL`             | Server-only override of the same base URL |
