import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  layoutMixed, layoutRack, mixedPlanGeometry, palletPlanGeometry,
  type MixedInput, type Orientation, type RackKind, type RackLayout, type RackLayoutInput,
} from '../src/index.js';

/*
 * Packing rows across the floor: a single row hard against the far wall, the
 * near edge a wall row (racking alone) or the first module facing the shared
 * aisle (a mixed floor), back-to-back pairs between, and one more single when
 * the depth left over holds a single and its aisle. Never leave unused depth of
 * an aisle and a single or more.
 */

const WALL = 2.5, AISLE = 12.5, FD = 42 / 12;
const KINDS: readonly RackKind[] = ['selective', 'doubledeep', 'pushback'];
const ORIENTS: readonly Orientation[] = ['length', 'width'];

const single = (L: RackLayout) => L.deep * FD;
const pair = (L: RackLayout) => L.deep * FD * 2 + L.flueIn / 12;
/** The rows the old packing gave: wall rows and pairs only, nothing else. */
function oldRows(L: RackLayout, walls: 1 | 2): number {
  const A = L.acrossFt - L.acrossOffsetFt, s = single(L), P = pair(L);
  if (walls === 1) return A >= s ? 1 + 2 * Math.max(0, Math.floor((A - s) / (P + AISLE))) : 0;
  if (A < s) return 0;
  if (A < s * 2 + AISLE) return 1;
  return 2 + 2 * Math.max(0, Math.floor((A - 2 * s - 2 * AISLE + AISLE) / (P + AISLE)));
}

const rackInput = (BL: number, BW: number, orientation: Orientation): RackLayoutInput => ({
  buildingLengthFt: BL, buildingWidthFt: BW, beamLengthIn: 96, palletsPerBay: 2, levels: 4,
  frameDepthIn: 42, aisleWidthFt: AISLE, wallClearanceFt: WALL, orientation, palletWidthIn: 40,
});

for (const kind of KINDS) {
  test(`${kind}, racking alone: a wall row against both walls, nothing an aisle and a single deep left over`, () => {
    for (const [BL, BW] of [[240, 120], [600, 500]] as const) {
      for (const orientation of ORIENTS) {
        const label = `${kind} ${BL}x${BW} rows ${orientation}`;
        const L = layoutRack(kind, rackInput(BL, BW, orientation));
        const g = palletPlanGeometry(kind, L, { buildingLengthFt: BL, buildingWidthFt: BW, wallClearanceFt: WALL, orientation });
        const bands = [...g.pallets!.bands].sort((a, b) => a.cFt - b.cFt);
        const first = bands[0]!, last = bands[bands.length - 1]!;
        assert.ok(Math.abs(first.cFt - (WALL + L.acrossOffsetFt)) < 1e-6, `${label}: a row against the near wall`);
        assert.ok(Math.abs(last.cFt + last.depthFt - (g.acrossFt - WALL)) < 1e-6,
          `${label}: a row hard against the far wall, not ${(g.acrossFt - WALL - last.cFt - last.depthFt).toFixed(1)} ft off it`);
        assert.ok(L.spareFt < AISLE + single(L) - 1e-6,
          `${label}: ${L.spareFt.toFixed(1)} ft unused — an aisle and a single would fit`);
        assert.equal(L.wallRows, 2, `${label}: two wall rows`);
        assert.equal(L.rows, oldRows(L, 2) + L.singleRows, `${label}: the old rows, and the extra single where it fits`);
      }
    }
  });
}

const mixedInput = (orientation: Orientation, kind: RackKind = 'selective', aisle = AISLE): MixedInput => ({
  buildingLengthFt: 240, buildingWidthFt: 120, clearHeightFt: 28, wallClearanceFt: WALL, orientation,
  cantilever: { linearFeetNeededFt: 500, productLengthFt: 20, armLengthIn: 48, armSpacingIn: 24 },
  pallet: { kind, beamLengthIn: 96, palletsPerBay: 2, levels: 4, frameDepthIn: 42, aisleWidthFt: aisle, palletWidthIn: 40 },
});

test('mixed 240 x 120, the screenshot: the last pallet row is on the far wall, the rest spare', () => {
  const M = layoutMixed(mixedInput('length'));
  const g = mixedPlanGeometry('selective', M, { buildingLengthFt: 240, buildingWidthFt: 120, wallClearanceFt: WALL, orientation: 'length' });
  const bands = [...g.pallets!.bands].sort((a, b) => a.cFt - b.cFt);
  const last = bands[bands.length - 1]!;
  assert.ok(Math.abs(last.cFt + last.depthFt - (g.acrossFt - WALL)) < 1e-6,
    `the last pallet row ends ${(g.acrossFt - WALL - last.cFt - last.depthFt).toFixed(1)} ft from the far wall`);
  assert.ok(M.pallets.spareFt < AISLE + single(M.pallets) - 1e-6, `${M.pallets.spareFt.toFixed(1)} ft unused`);
  // 12 ft is left after the pairs: less than an aisle and a single (16 ft), so
  // a row there could not be reached — it is spare in front of the far row,
  // and the count is what it was.
  assert.equal(M.pallets.singleRows, 0);
  assert.equal(M.pallets.rows, oldRows(M.pallets, 1), `${M.pallets.rows} rows against ${oldRows(M.pallets, 1)} before`);
  // the first module faces the shared aisle directly, no aisle added
  assert.ok(Math.abs(bands[0]!.cFt - (g.sharedAisle!.cFt + g.sharedAisle!.depthFt)) < 1e-6,
    'the first pallet row starts at the shared aisle');
});

test('mixed floors, every aisle-picked type, rows each way: far wall row, no aisle-and-single of waste', () => {
  for (const kind of KINDS) {
    for (const orientation of ORIENTS) {
      const label = `mixed ${kind} rows ${orientation}`;
      const M = layoutMixed(mixedInput(orientation, kind));
      const g = mixedPlanGeometry(kind, M, { buildingLengthFt: 240, buildingWidthFt: 120, wallClearanceFt: WALL, orientation });
      const bands = [...g.pallets!.bands].sort((a, b) => a.cFt - b.cFt);
      const last = bands[bands.length - 1]!;
      assert.ok(Math.abs(last.cFt + last.depthFt - (g.acrossFt - WALL)) < 1e-6, `${label}: far wall row`);
      assert.ok(M.pallets.spareFt < AISLE + single(M.pallets) - 1e-6, `${label}: ${M.pallets.spareFt.toFixed(1)} ft unused`);
      assert.equal(M.pallets.rows, oldRows(M.pallets, 1) + M.pallets.singleRows, label);
    }
  }
});

test('slack is spare floor, never a wider aisle', () => {
  for (const kind of KINDS) {
    for (const orientation of ORIENTS) {
      const L = layoutRack(kind, rackInput(240, 120, orientation));
      for (const a of L.aislesFt) assert.ok(Math.abs(a.depth - AISLE) < 1e-9, `${kind} ${orientation}: every aisle at the truck's width`);
      const spare = L.spareAcrossFt.reduce((n, s) => n + s.depth, 0);
      assert.ok(Math.abs(spare - L.spareFt) < 1e-6, `${kind} ${orientation}: the spare floor is the spare`);
    }
  }
});

test('mixed 240 x 120: wherever the depth left over holds an aisle and a single, exactly one row more', () => {
  let found = 0;
  for (const aisle of [6.5, 10, 12, 12.5]) {
    for (const orientation of ORIENTS) {
      const label = `${aisle} ft aisle, rows ${orientation}`;
      const P = layoutMixed(mixedInput(orientation, 'selective', aisle)).pallets;
      const s = single(P), pr = pair(P), A = P.acrossFt - P.acrossOffsetFt;
      const pairs = Math.floor((A - s) / (pr + aisle));
      const left = A - s - pairs * (pr + aisle);
      const before = 1 + 2 * pairs;
      if (left >= s + aisle - 1e-9) {
        found++;
        assert.equal(P.singleRows, 1, `${label}: the extra single`);
        assert.equal(P.rows, before + 1, `${label}: ${P.rows} rows against ${before} without it`);
      } else {
        assert.equal(P.singleRows, 0, `${label}: no room for one`);
        assert.equal(P.rows, before, label);
      }
      assert.ok(P.spareFt < aisle + s - 1e-9, `${label}: ${P.spareFt.toFixed(1)} ft unused`);
    }
  }
  assert.ok(found > 0, 'at least one floor takes the extra single');
});
