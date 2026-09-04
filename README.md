# Trace — warehouse intelligence + marketplace

A customer enters their building and their pallets. Trace sizes the racking,
draws the plan and elevation, checks the design against fire, load and
operational rules, and counts the material.

That last part is the point: **the layout is the bill of materials.** Every
quantity a supplier is asked to price traces back to a drawing the customer
approved.

## Quick start

```bash
pnpm install
pnpm --filter @trace/rack-engine test   # 12 tests
pnpm dev                                 # http://localhost:3000
```

Requires Node 20+ and pnpm 9+. No database or API keys needed to run the
estimator — the engine is pure and runs in the browser.

## What is here

```
apps/
  web/                    Next.js 15 — the estimator
    app/                  Layout, page, global styles
    components/           SizingSheet (state) · Plan · Elevation
    lib/defaults.ts       Opening configuration
packages/
  rack-engine/            THE MOAT — pure TS, no deps, 12 tests
  db/                     Drizzle schema (Postgres + PostGIS)
```

Read `ARCHITECTURE.md` before changing anything structural. The short version:
**all rack maths lives in `packages/rack-engine` and nowhere else.**

## What is not here yet

Auth, database wiring, PDF export, provider matching, the marketplace. The
build order is in `ARCHITECTURE.md` — phases 1–3 are deliberately
single-player, because a marketplace with no supply is worth nothing to the
first customer through the door.

## Before this goes near a real customer

Verify these against your own jobs. They are all in
`packages/rack-engine/src/constants.ts`:

- `PALLET_OVERHANG_IN` = 3 — drives frame depth
- `SPRINKLER_CLEARANCE_IN` — 36 in ceiling-only, 24 in with in-rack
- the 4 in clearance in `palletsPerBay` — at 6 in, three 40 in pallets need a
  168 in beam rather than 144 in, which changes every recommendation
- `UNIT_WEIGHTS` in `bom.ts` — freight sizing only, replace with catalogue data

An estimate a dealer cannot stand behind is worse than no estimate.
