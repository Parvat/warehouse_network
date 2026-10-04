import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WALL_CLEARANCE_FT, BOX_STRIDE, cantileverHeights, cantileverPlanGeometry, layoutCantileverRuns, layoutMixed, layoutRack,
  mixedPlanGeometry, palletHeights, palletPlanGeometry, solve, warehouseScene,
  type EngineInput, type Orientation, type RackKind,
} from '../src/index.js';

/*
 * The 3D view is the plan stood up. These hold its parts to the counts the
 * layout reports — a pallet in every position, a tower for every one the
 * cantilever counts, an arm per side per level — and keep everything inside
 * the building.
 */

const WALL = WALL_CLEARANCE_FT;
const count = (a: number[]) => a.length / BOX_STRIDE;

/** A 96 in beam, two pallets a bay — the spec the sheet starts from. */
function specFor(_kind: RackKind) {
  const input: EngineInput = {
    building: { lengthFt: 240, widthFt: 120, clearHeightFt: 28, sprinklers: 'ceiling' },
    pallet: { depthIn: 48, widthIn: 40, loadHeightIn: 52, weightLb: 2200 },
    config: { frameHeight: { mode: 'fit' }, beam: { mode: 'fixed', lengthIn: 96 }, aisleWidthFt: 12.5, flueIn: 6, wallClearanceFt: 2.5 },
    stock: { skuCount: 0, palletsOutPerDay: 0, rotation: 'fifo' },
  };
  return solve(input).spec;
}

function inside(parts: Record<string, number[]>, BL: number, BW: number, label: string) {
  for (const [part, boxes] of Object.entries(parts)) {
    if (part === 'dock') continue; // doors stand in the wall line
    for (let i = 0; i < boxes.length; i += BOX_STRIDE) {
      const x = boxes[i]!, z = boxes[i + 2]!;
      assert.ok(Math.abs(x) <= BL / 2 + 1e-6 && Math.abs(z) <= BW / 2 + 1e-6,
        `${label}: a ${part} at (${x.toFixed(1)}, ${z.toFixed(1)}) is outside the building`);
    }
  }
}

for (const kind of ['selective', 'drivein'] as const) {
  test(`${kind}: a pallet in every position the layout counts`, () => {
    const spec = specFor(kind);
    for (const orientation of ['length', 'width'] as Orientation[]) {
      for (const [BL, BW] of [[240, 120], [600, 500]] as const) {
        const L = layoutRack(kind, {
          buildingLengthFt: BL, buildingWidthFt: BW, beamLengthIn: 96, palletsPerBay: spec.palletsPerBay,
          levels: spec.levels, frameDepthIn: spec.frameDepthIn, aisleWidthFt: 12.5, wallClearanceFt: WALL,
          orientation, palletWidthIn: 40,
        });
        const g = palletPlanGeometry(kind, L, { buildingLengthFt: BL, buildingWidthFt: BW, wallClearanceFt: WALL, orientation });
        const s = warehouseScene(g, {
          clearHeightFt: 28, pallet: palletHeights(kind, spec, { widthIn: 40, depthIn: 48, loadHeightIn: 52 }),
        });
        const label = `${kind} ${BL}x${BW} ${orientation}`;
        assert.equal(count(s.parts.pallet), L.positions, `${label}: pallets against positions`);
        assert.equal(s.parts.pallet.length / BOX_STRIDE, L.positions, `${label}: one box per pallet, skid and all`);
        if (kind === 'selective') {
          assert.ok(count(s.parts.beam) > 0, `${label}: beams`);
          assert.equal(count(s.parts.rail), 0, `${label}: no rails in a beam bay`);
        } else {
          assert.equal(count(s.parts.beam), 0, `${label}: no beam across a lane`);
          assert.ok(count(s.parts.rail) > 0, `${label}: rails down the lanes`);
        }
        assert.equal(count(s.parts.dock), 3);
        inside(s.parts, BL, BW, label);
      }
    }
  });
}

test('long: a tower per tower, an arm per side per level, stock on every level', () => {
  for (const orientation of ['length', 'width'] as Orientation[]) {
    const S = layoutCantileverRuns({
      buildingLengthFt: 240, buildingWidthFt: 120, clearHeightFt: 24, aisleWidthFt: 14,
      wallClearanceFt: WALL, orientation, productLengthFt: 20, armLengthIn: 48,
    });
    const g = cantileverPlanGeometry(S, { buildingLengthFt: 240, buildingWidthFt: 120, wallClearanceFt: WALL, orientation });
    const h = cantileverHeights(S);
    const s = warehouseScene(g, { clearHeightFt: 24, cantilever: h });
    const runs = g.cantilever!.rows.reduce((n, r) => n + r.runs, 0);
    const sideRuns = g.cantilever!.rows.reduce((n, r) => n + r.runs * r.armDirs.length, 0);
    assert.equal(count(s.parts.column), runs * S.towersPerRun, `${orientation}: towers`);
    assert.equal(count(s.parts.base), runs * S.towersPerRun, 'a base under every tower');
    assert.equal(count(s.parts.arm), sideRuns * S.towersPerRun * h.armTopFt.length, 'an arm per side per level');
    assert.equal(count(s.parts.steel) + count(s.parts.lumber), sideRuns * (h.armTopFt.length + 1),
      'stock on the base and on every arm, each side');
    inside(s.parts, 240, 120, `long ${orientation}`);
  }
});

test('both: the strip and the pallet zone together', () => {
  const spec = specFor('selective');
  const M = layoutMixed({
    buildingLengthFt: 240, buildingWidthFt: 120, clearHeightFt: 28, wallClearanceFt: WALL, orientation: 'length',
    cantilever: { linearFeetNeededFt: 500, productLengthFt: 20, armLengthIn: 48, armSpacingIn: 24 },
    pallet: { kind: 'selective', beamLengthIn: 96, palletsPerBay: spec.palletsPerBay, levels: spec.levels,
      frameDepthIn: spec.frameDepthIn, aisleWidthFt: 12.5, palletWidthIn: 40 },
  });
  const g = mixedPlanGeometry('selective', M, { buildingLengthFt: 240, buildingWidthFt: 120, wallClearanceFt: WALL, orientation: 'length' });
  const s = warehouseScene(g, {
    clearHeightFt: 28,
    pallet: palletHeights('selective', spec, { widthIn: 40, depthIn: 48, loadHeightIn: 52 }),
    cantilever: cantileverHeights(M.strip),
  });
  assert.equal(count(s.parts.pallet), M.pallets.positions, 'the pallet zone, every position');
  assert.ok(count(s.parts.column) > 0, 'and the strip');
  inside(s.parts, 240, 120, 'both');
});
