# Trace Platform — Architecture

Warehouse intelligence + marketplace. Separate product from the v16b CAD tool.

## The one rule

**`packages/rack-engine` is pure TypeScript.** No React, no DOM, no database,
no network. Given `EngineInput` it returns `EngineResult` — spec, layout,
flags, BOM.

Everything else in this stack is replaceable. This package is not. Because it
is pure, the identical code runs in three places:

1. **In the browser**, recalculating on every keystroke with no round-trip.
   This is why the estimator feels like it knows something.
2. **On the server**, when an estimate is saved or a PDF is rendered.
3. **Inside the CAD editor** later, so the drawing and the BOM can never drift.

If you ever find yourself writing rack maths anywhere else, stop.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 App Router + TypeScript | Estimator is the acquisition channel — needs SSR for SEO, and the engine must run client-side |
| DB | Postgres + PostGIS | Provider service-area matching is genuinely geospatial |
| ORM | Drizzle | Thin and SQL-shaped |
| Auth | Clerk | Organizations, invites and roles map onto provider companies out of the box |
| Files | Cloudflare R2 | Drawings, site photos, PDFs. S3-compatible, no egress fees |
| Jobs | Inngest | PDF generation, matching runs, notifications |
| PDFs | Playwright print-to-PDF | Sheets already render as HTML — print them, don't build a second renderer |
| Field | PWA (IndexedDB + sync queue) | Installers and inspectors need offline and camera. Native only if this fails |
| Hosting | Vercel + Neon | Fine for a long time |

### Why not Spring Boot

Twelve years of Java says use it. The engine has to run **client-side** — in a
Java backend you either write it twice or lose the instant feedback that is the
entire product. If the marketplace half later wants Spring, the engine still
stays TypeScript.

## Layout

```
apps/
  web/                  Next.js — marketing, estimator, dashboards
packages/
  rack-engine/          THE MOAT. Pure TS, fully tested.
    src/types.ts        EngineInput / EngineResult contracts
    src/constants.ts    Standard frames, beams, clearances — all tunable
    src/spec.ts         Pallets→beam, ceiling→levels, capacities
    src/layout.ts       Fills the building with bands, rows, bays
    src/flags.ts        Domain checks: blocking / check / opportunity
    src/bom.ts          Counts material from the layout
  db/                   Drizzle schema + migrations
  ui/                   Shared components (drawing sheet, placard, flags)
```

## Data model notes

- **Warehouse is the root entity**, not Project. A project is an episode in a
  warehouse's twenty-year life. Inspections, repairs, labels and expansions all
  hang off the warehouse, and that is where the recurring revenue lives.
- **`layout_versions` stores the whole engine run** — `input` and `result` as
  JSONB, plus `engine_version`. A saved estimate can always be replayed, and
  changing the engine never silently rewrites history.
- **Change orders are diffs between layout versions**, not free text. That is
  what makes change-order pricing automatic.
- **`quotes.cost_price` is dealer-only.** Never select it into a customer-facing
  query. Enforce at the data layer — the classic leak is a hidden field the
  client filters out.

## Roles: two, not nine

v1 models **dealer** and **dealer-invited provider**. The brief lists nine user
types; every one added before product-market fit multiplies auth, onboarding and
permissions surface. `organizations.capabilities` is an array — new provider
types are rows, not tables.

## Build order

1. Estimator (anonymous) → engine → drawings → BOM. **Done as a prototype.**
2. Accounts, save/resume an estimate, PDF export.
3. Dealer invites their own installer/engineer into a shared project.
4. Price books → real estimate ranges.
5. Open matching. Only now is it a marketplace.

Cold-start is the risk that kills this. Phases 1–3 are single-player and
seed the supply side with relationships that already exist.
