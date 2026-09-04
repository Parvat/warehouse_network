# Running Trace

Requires Node 20+ and pnpm 9. **npm will not work** — the workspace uses
`workspace:*`, which is pnpm syntax.

```bash
pnpm install
pnpm --filter @trace/rack-engine test    # 26 tests
pnpm --filter @trace/requirement test    #  9 tests
pnpm --filter @trace/web dev             # http://localhost:3000
```

## Routes

| Route | Screen | Notes |
|---|---|---|
| `/` | A1 — two doors | Static |
| `/rack-finder` | A2 — the wizard | Static shell, client state |
| `/planner` | A3 — how many fit | Server-rendered; reads the handoff |

The finder hands over to the planner in the query string:

```
/planner?rack=drivein&aisle=12&pd=48&pw=40&plh=60&pwt=2000&from=finder&match=91
```

Every carried value is a starting point. The planner never locks the choice —
switching type in its picker is the point of the page.

## Where the logic lives

Nothing in `apps/web` decides anything. `packages/rack-engine` owns it:

- `racktypes.ts` — the six types, their copy, and the wizard scoring
- `racklayout.ts` — filling a building with one of them
- `spec.ts`, `bom.ts`, `flags.ts` — beam sizing, material counts, warnings

Components render what the engine returns. If a number looks wrong, the fix is
in the engine and needs a test.

## Two things that bit us

**Search params are read in `app/planner/page.tsx`, not in the client
component.** `useSearchParams` opts the whole page into client rendering, so the
server only ever returned the loading fallback.

**`next.config.mjs` maps `.js` imports back to TypeScript.** The engine uses
NodeNext-style `./spec.js` imports; webpack cannot resolve those to `.ts`
without `resolve.extensionAlias`.
