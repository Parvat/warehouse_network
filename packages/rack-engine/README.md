# @trace/rack-engine

Pure TypeScript. No React, no DOM, no DB, no network.

```ts
import { solve } from '@trace/rack-engine';

const { spec, layout, flags, bom } = solve({
  building: { lengthFt: 240, widthFt: 120, clearHeightFt: 28, sprinklers: 'ceiling' },
  pallet:   { depthIn: 48, widthIn: 40, loadHeightIn: 52, weightLb: 2200 },
  config:   { frameHeight: { mode: 'fit' }, beam: { mode: 'best-fit' },
              aisleWidthFt: 12.5, flueIn: 6, wallClearanceFt: 2.5 },
  stock:    { skuCount: 600, palletsOutPerDay: 90, rotation: 'fifo' },
});
```

## Rules encoded here

These are the ones that are easy to get wrong and expensive when you do:

- **N bays take N+1 upright frames** — adjacent bays share the frame between them.
- **The floor level carries no beams and no decking.**
- **Pallets per bay comes from the beam**, not the other way round.
  `floor((beam - gap) / (palletWidth + gap))` — a 144 in beam takes three
  40 in pallets, a 96 in takes two, and 120 in is the wasteful middle ground.
- **Clearance is shared evenly** at each upright and between pallets, so N
  pallets need N+1 gaps. Pallets must never touch the uprights.
- **Flue space is fire code, not padding.** Zero flue is blocking.
- **Storage stops short of the sprinklers** — clear height is not usable height.

## Numbers to verify against your own jobs

`src/constants.ts` holds every assumption in one place. The ones most likely to
differ by market:

- `PALLET_OVERHANG_IN` (3) — drives frame depth
- `SPRINKLER_CLEARANCE_IN` — 36 in ceiling-only, 24 in with in-rack
- the 4 in clearance default in `palletsPerBay` — at 6 in, three 40 in pallets
  need a 168 in beam instead of 144 in, which changes every recommendation
- `UNIT_WEIGHTS` in `bom.ts` — freight sizing only, replace with catalogue data

## Test

```
pnpm test        # 12 tests, node:test
pnpm typecheck   # strict, noUncheckedIndexedAccess
```
