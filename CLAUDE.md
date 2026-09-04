# Trace Platform — rules for working in this repo

Read `TRACE_PROJECT_BRIEF.md` for what we are building and why.
Read `ARCHITECTURE.md` before changing anything structural.

## The rules that matter

1. **All rack arithmetic lives in `packages/rack-engine`.** No exceptions.
   If a `.tsx` file computes a beam length, that is a bug. The engine is pure —
   no React, no DOM, no database, no network, no dependencies — because the same
   code must run in the browser as the customer types, on the server for saved
   estimates and PDFs, and later inside the CAD editor.

2. **Rack type selection and layout live in the engine too.** `racktypes.ts`
   holds the six types and the wizard scoring; `racklayout.ts` fills a building
   with one of them. The A2 wizard and the A3 planner both render from these —
   neither decides anything itself. Two rules learned the hard way:
   ranking uses the *raw* score, because clamping first flattens genuinely
   different options onto the ceiling; and an aisle-picked row holds `deep`
   times its face count, which lane blocks fold into `rows` instead.

3. **Long products are their own family, and a mixed floor is a third case.**
   `longgoods.ts` holds the systems and `cantileverruns.ts` lays cantilever out
   as sectioned runs — it is not pallet racking with different numbers, and its
   capacity is linear feet of arm, never pallet positions. `mixedlayout.ts` puts
   a strip of it down one wall and lets the pallet solver fill the rest, calling
   both solvers rather than forking either. Read `docs/mixed-layout.md` before
   touching that division: the width split, the shared-aisle safety rule, why
   the two capacities are never added, and which zone edges count as walls.

4. **Never weaken a test to make code pass.** The tests in
   `packages/rack-engine/test` and `packages/requirement/test` encode domain
   rules that are expensive to get wrong (N+1 frames, floor level carries no
   beams, pallets-per-bay comes from the beam). If a change breaks one, the
   change is wrong until proven otherwise.

5. **Anonymous by default.** Everything *about* the market works with no
   account: requirement capture, sizing, ranges, who serves this area,
   capabilities, ratings. Sign-in is required only to *act*: save, export,
   contact a provider, request a quote.

6. **Dealer cost and margin never reach a customer payload.** Two endpoints,
   two shapes. Enforced by Postgres row-level security, not by filtering in the
   client. A hidden field the UI drops is the classic leak.

7. **Presentation state is not domain state.** Panel widths, view modes, chart
   toggles: component state + localStorage. Never the database.

8. **Two roles only in v1** — dealer and dealer-invited provider.
   `organizations.capabilities` is an array; new provider types are rows, not
   tables.

9. **Every user-facing warning names the number, the consequence, and the
   action.** Follow the existing flag template in `packages/rack-engine/src/flags.ts`:
   *"At 6,600 lb per pair you are into heavy beam sections — check availability
   and lead time before committing."* Never a bare "warning".

10. **Verify a package export exists before importing it.** A wrong name renders
   `undefined` and fails at runtime, not at build.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess` on. Do not loosen tsconfig to
  silence an error — fix the nullability.
- Inches for rack dimensions, feet for building dimensions. Any field ending
  `Ft` is feet; everything else in the engine is inches.
- Server Components by default; `'use client'` only where interaction demands it.
- Money as integer cents, never floats.
- Dates as ISO strings at the boundary.

## Before you say a task is done

- `pnpm -r test` passes
- `pnpm -r typecheck` passes
- You ran the app and looked at the screen, rather than reasoning that it should work
