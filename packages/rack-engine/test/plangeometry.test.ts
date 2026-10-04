import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cantileverHeights, cantileverPlanGeometry, layoutCantileverRuns, layoutMixed, layoutRack,
  mixedPlanGeometry, palletPlanGeometry, rackType,
  type CantileverRunInput, type MixedInput, type Orientation, type PlanGeometry,
  type RackKind, type RackLayoutInput,
} from '../src/index.js';

/*
 * The plan figures and the 3D view stand on one placement of every band,
 * aisle, flue, column line and run. These tests hold that placement to the
 * layout it comes from — the same counts, the same bays and runs — and to the
 * walk the plan figures used to make across the floor themselves, before they
 * read it from here instead.
 */

const WALL = 2.5;
const SIZES: readonly [number, number][] = [[240, 120], [600, 500]];
const ORIENTS: readonly Orientation[] = ['length', 'width'];

const rack = (kind: RackKind, L: number, W: number, orientation: Orientation) => {
  const input: RackLayoutInput = {
    buildingLengthFt: L, buildingWidthFt: W, beamLengthIn: 96, palletsPerBay: 2, levels: 4,
    frameDepthIn: 42, aisleWidthFt: 12.5, wallClearanceFt: WALL, orientation, palletWidthIn: 40,
  };
  return layoutRack(kind, input);
};

/** Nothing overlaps anything else across the floor, and all of it is indoors. */
function assertNoOverlap(g: PlanGeometry, label: string) {
  const spans = [
    ...(g.pallets?.bands ?? []).map((b) => ({ ...b, what: 'band' })),
    ...(g.pallets?.flues ?? []).map((b) => ({ ...b, what: 'flue' })),
    ...(g.cantilever?.rows ?? []).map((b) => ({ ...b, what: 'cant row' })),
    ...(g.sharedAisle ? [{ ...g.sharedAisle, what: 'shared aisle' }] : []),
  ].sort((a, b) => a.cFt - b.cFt);
  for (let i = 1; i < spans.length; i++) {
    const p = spans[i - 1]!, q = spans[i]!;
    assert.ok(q.cFt >= p.cFt + p.depthFt - 1e-6,
      `${label}: ${q.what} at ${q.cFt.toFixed(2)} overlaps ${p.what} ending ${(p.cFt + p.depthFt).toFixed(2)}`);
  }
  for (const s of spans) {
    assert.ok(s.cFt >= g.wallClearanceFt - 1e-6 && s.cFt + s.depthFt <= g.acrossFt - g.wallClearanceFt + 1e-6,
      `${label}: ${s.what} at ${s.cFt} stands outside the walls`);
  }
}

/**
 * The across-the-floor walk the pallet plan used to make for itself: a wall
 * row, then pairs with a flue between, an aisle after each — or lane blocks,
 * an aisle between. Kept here as the independent reference.
 */
function oldPalletWalk(kind: RackKind, L: ReturnType<typeof rack>) {
  const R = rackType(kind);
  const fd = 42 / 12, flue = R.pick === 'lane' ? 0 : L.flueIn / 12, aisle = 12.5, deep = L.deep;
  const bands: { cFt: number; depthFt: number }[] = [];
  let c = WALL + L.acrossOffsetFt;
  if (R.pick === 'aisle') {
    const single = deep * fd, pair = deep * fd * 2 + flue;
    if (L.wallRows > 0) { bands.push({ cFt: c, depthFt: single }); c += single + aisle; }
    const pairs = (L.rows - L.wallRows) / 2;
    for (let i = 0; i < pairs; i++) {
      bands.push({ cFt: c, depthFt: deep * fd });
      bands.push({ cFt: c + deep * fd + flue, depthFt: deep * fd });
      c += pair + aisle;
    }
    if (L.wallRows > 1) bands.push({ cFt: c, depthFt: single });
  } else {
    const block = deep * fd;
    if (R.openEnds === 2) c += aisle;
    for (let b = 0; b < L.blocks; b++) { bands.push({ cFt: c, depthFt: block }); c += block + aisle; }
  }
  return bands;
}

for (const kind of ['selective', 'drivein'] as const) {
  test(`${kind}: the bands, bays and aisles are the ones the plan draws`, () => {
    for (const [BL, BW] of SIZES) {
      for (const orientation of ORIENTS) {
        const label = `${kind} ${BL}x${BW} rows ${orientation}`;
        const L = rack(kind, BL, BW, orientation);
        const g = palletPlanGeometry(kind, L, {
          buildingLengthFt: BL, buildingWidthFt: BW, wallClearanceFt: WALL, orientation,
        });
        const Z = g.pallets!;
        const lane = rackType(kind).pick === 'lane';
        // the counts the layout reports
        assert.equal(Z.bands.length, lane ? L.blocks : L.rows, `${label}: one band per ${lane ? 'block' : 'row'}`);
        assert.equal(Z.bayStartsFt.length, L.bays, `${label}: one bay start per bay`);
        assert.equal(Z.aisles.length, L.aislesFt.length, `${label}: every aisle`);
        assert.deepEqual(Z.bayStartsFt, L.bayStartsFt.map((b) => g.alongStartFt + b), `${label}: the layout's bays`);
        assert.deepEqual(g.crossAisles.map((a) => a.aFt), L.crossAisleAtFt.map((a) => g.alongStartFt + a));
        // the walk the plan used to make, band for band
        const walk = oldPalletWalk(kind, L);
        assert.equal(Z.bands.length, walk.length, `${label}: band count against the old walk`);
        Z.bands.forEach((b, i) => {
          assert.ok(Math.abs(b.cFt - walk[i]!.cFt) < 1e-6 && Math.abs(b.depthFt - walk[i]!.depthFt) < 1e-6,
            `${label}: band ${i} at ${b.cFt} (${b.depthFt}) against ${walk[i]!.cFt} (${walk[i]!.depthFt})`);
        });
        // lane blocks say which end is open; a drive-in has exactly one
        if (lane) for (const b of Z.bands) assert.equal(b.openEnds.length, 1, `${label}: one open end`);
        else for (const b of Z.bands) assert.equal(b.openEnds.length, 0);
        assertNoOverlap(g, label);
        // the frame: along and across are the building's two sides
        assert.equal(g.alongFt, orientation === 'length' ? BL : BW);
        assert.equal(g.acrossFt, orientation === 'length' ? BW : BL);
      }
    }
  });
}

const cantInput = (L: number, W: number, orientation: Orientation): CantileverRunInput => ({
  buildingLengthFt: L, buildingWidthFt: W, clearHeightFt: 24, aisleWidthFt: 14,
  wallClearanceFt: WALL, orientation, productLengthFt: 20, armLengthIn: 48,
});

test('long: rows, towers and runs are the ones the plan draws, and wall rows face the aisle', () => {
  for (const [BL, BW] of SIZES) {
    for (const orientation of ORIENTS) {
      const label = `long ${BL}x${BW} rows ${orientation}`;
      const S = layoutCantileverRuns(cantInput(BL, BW, orientation));
      const g = cantileverPlanGeometry(S, {
        buildingLengthFt: BL, buildingWidthFt: BW, wallClearanceFt: WALL, orientation,
      });
      const Z = g.cantilever!;
      const armFt = S.armLengthIn / 12;
      assert.equal(Z.rows.length, S.rows, `${label}: one row per layout row`);
      assert.deepEqual(Z.rows.map((r) => r.sides), [...S.rowSides], `${label}: the layout's sides`);
      assert.deepEqual(Z.runStartsFt, S.runStartsFt.map((x) => g.alongStartFt + x), `${label}: the layout's runs`);
      assert.equal(Z.towersPerRun, S.towersPerRun);
      Z.rows.forEach((r, i) => {
        assert.equal(r.runs, i === S.rows - 1 ? S.runsInLastRow : S.runsPerRow, `${label}: runs in row ${i}`);
        // the old walk: rows from the wall, an aisle between
        const walkC = WALL + S.bandsFt[i]!.start;
        assert.ok(Math.abs(r.cFt - walkC) < 1e-6, `${label}: row ${i} at ${r.cFt} against ${walkC}`);
        if (r.sides === 2) {
          assert.deepEqual(r.armDirs, [-1, 1], `${label}: an interior row is armed both ways`);
          assert.ok(Math.abs(r.colCFt - (r.cFt + r.depthFt / 2)) < 1e-6);
        } else {
          assert.equal(r.armDirs.length, 1, `${label}: a wall row is armed one way`);
          // the column on the wall side, the arms reaching away from it
          const nearWall = r.cFt - WALL < 1e-6;
          const farWall = Math.abs(r.cFt + r.depthFt - (g.acrossFt - WALL)) < 1e-6;
          if (nearWall) assert.deepEqual([r.colCFt, r.armDirs[0]], [r.cFt, 1], `${label}: near-wall row faces in`);
          if (farWall && i > 0) assert.deepEqual([r.colCFt, r.armDirs[0]], [r.cFt + r.depthFt, -1], `${label}: far-wall row faces in`);
        }
        assert.ok(Math.abs((r.armToCFt - r.armFromCFt) - armFt * r.sides) < 1e-6, `${label}: arm reach`);
      });
      assertNoOverlap(g, label);
    }
  }
});

test('both: strip, shared aisle and pallet zone as the plan draws them', () => {
  for (const kind of ['selective', 'drivein'] as const) {
    for (const [BL, BW] of SIZES) {
      for (const orientation of ORIENTS) {
        const label = `both ${kind} ${BL}x${BW} rows ${orientation}`;
        const input: MixedInput = {
          buildingLengthFt: BL, buildingWidthFt: BW, clearHeightFt: 28, wallClearanceFt: WALL, orientation,
          cantilever: { linearFeetNeededFt: 600, productLengthFt: 20, armLengthIn: 48, armSpacingIn: 24 },
          pallet: { kind, beamLengthIn: 96, palletsPerBay: 2, levels: 4, frameDepthIn: 42, aisleWidthFt: 12.5, palletWidthIn: 40 },
        };
        const M = layoutMixed(input);
        const g = mixedPlanGeometry(kind, M, {
          buildingLengthFt: BL, buildingWidthFt: BW, wallClearanceFt: WALL, orientation,
        });
        const C = g.cantilever!, P = g.pallets!, sh = g.sharedAisle!;
        // the old walk, in from the strip's wall: strip rows, the shared aisle,
        // the pallet zone's offset, then its bands
        assert.ok(Math.abs(sh.cFt - (WALL + M.stripDepthFt)) < 1e-6, `${label}: shared aisle after the strip`);
        assert.equal(sh.depthFt, M.sharedAisleFt);
        assert.equal(C.rows.length, M.strip.rows);
        const lastStrip = C.rows[C.rows.length - 1]!;
        assert.ok(lastStrip.cFt + lastStrip.depthFt <= sh.cFt + 1e-6, `${label}: the strip ends at the shared aisle`);
        assert.ok(P.bands.every((b) => b.cFt >= sh.cFt + sh.depthFt - 1e-6), `${label}: the pallets start past it`);
        const first = P.bands[0];
        if (first) {
          assert.ok(Math.abs(first.cFt - (WALL + M.stripTotalDepthFt + M.pallets.acrossOffsetFt)) < 1e-6,
            `${label}: first pallet band where the walk put it`);
        }
        assert.equal(P.bands.length, rackType(kind).pick === 'lane' ? M.pallets.blocks : M.pallets.rows);
        assert.deepEqual(P.bayStartsFt, M.pallets.bayStartsFt.map((b) => g.alongStartFt + b));
        // the strip's wall row faces the aisle, never the wall
        const wallRow = C.rows[0]!;
        assert.equal(wallRow.sides, 1);
        assert.deepEqual([wallRow.colCFt, wallRow.armDirs[0]], [wallRow.cFt, 1], `${label}: wall row faces in`);
        // both zones break at the same feet
        assert.deepEqual(M.strip.crossAisleAtFt, M.pallets.crossAisleAtFt);
        assertNoOverlap(g, label);
      }
    }
  }
});

test('cantilever heights: an arm per level, under the top of the tower', () => {
  const S = layoutCantileverRuns(cantInput(240, 120, 'length'));
  const h = cantileverHeights(S);
  assert.equal(h.armTopFt.length, S.levels, 'one arm height per arm level');
  for (let i = 1; i < h.armTopFt.length; i++) {
    assert.ok(Math.abs(h.armTopFt[i]! - h.armTopFt[i - 1]! - S.armPitchIn / 12) < 1e-9, 'at the arm pitch');
  }
  assert.ok(h.armTopFt.every((y) => y > h.baseHeightFt && y <= h.towerHeightFt + 1e-9));
});

