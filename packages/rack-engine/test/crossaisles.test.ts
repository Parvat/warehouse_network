import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CROSS_AISLE_WIDTH_FT, MIXED_AISLE_PASSES, crossAislePlan, crossAislesFor, layoutCantileverRuns,
  layoutMixed, mixedAislePlan,
  layoutRack, type MixedInput, type RackLayoutInput,
} from '../src/index.js';

/*
 * Cross aisles: one per 120 ft of run started, placed on a bay boundary, with
 * the bays shared out so the segments are as equal as whole bays make them.
 *
 * A bay here is a 96 in beam and its 3 in upright: 8.25 ft.
 */
const BAY_FT = 8.25;
const W = CROSS_AISLE_WIDTH_FT;

/** True where x is a whole number of bays from the start of the run. */
const onBay = (x: number, startFt = 0) => {
  const k = (x - startFt) / BAY_FT;
  return Math.abs(k - Math.round(k)) < 1e-6;
};

test('the count: ceil(run / 120) − 1', () => {
  assert.equal(crossAislesFor(100), 0, '100 ft needs none');
  assert.equal(crossAislesFor(120), 0, '120 ft is one whole segment');
  assert.equal(crossAislesFor(240), 1, '240 ft gets one');
  assert.equal(crossAislesFor(300), 2, '300 ft gets two');
});

test('100 ft: no cross aisle', () => {
  const p = crossAislePlan({ usableAlongFt: 100, moduleFt: BAY_FT });
  assert.equal(p.atFt.length, 0);
  assert.equal(p.segments.length, 1);
});

test('240 ft: one cross aisle, at a bay boundary, in the middle', () => {
  const p = crossAislePlan({ usableAlongFt: 240, moduleFt: BAY_FT });
  assert.equal(p.atFt.length, 1);
  const at = p.atFt[0]!;
  assert.ok(onBay(at), `the aisle at ${at} ft starts at the end of a bay`);

  // 27 bays fit beside one aisle: 14 and 13, which is as even as whole bays go.
  const [a, b] = p.segments.map((s) => Math.round(s.lengthFt / BAY_FT));
  assert.deepEqual([a, b], [14, 13]);
  assert.ok(Math.abs((at + W / 2) - 240 / 2) <= BAY_FT,
    `centred to within a bay: aisle centre ${at + W / 2} ft on a 240 ft run`);
  assert.ok(onBay(p.segments[1]!.startFt, at + W), 'and the racking resumes on the far side');
});

test('300 ft: two cross aisles, equal segments, each on a bay boundary', () => {
  const p = crossAislePlan({ usableAlongFt: 300, moduleFt: BAY_FT });
  assert.equal(p.atFt.length, 2);
  // 33 bays beside two aisles: 11, 11, 11.
  const lengths = p.segments.map((s) => s.lengthFt);
  assert.deepEqual(lengths, [11 * BAY_FT, 11 * BAY_FT, 11 * BAY_FT]);
  for (const [i, at] of p.atFt.entries()) {
    const seg = p.segments[i]!;
    assert.equal(at, +(seg.startFt + seg.lengthFt).toFixed(3), 'the aisle starts where the racking stops');
  }
  for (const s of p.segments) assert.ok(s.lengthFt <= 120, `a ${s.lengthFt} ft segment`);
});

test('segments never differ by more than one bay, and never pass 120 ft', () => {
  for (let L = 60; L <= 900; L += 7) {
    const p = crossAislePlan({ usableAlongFt: L, moduleFt: BAY_FT });
    const bays = p.segments.map((s) => Math.round(s.lengthFt / BAY_FT));
    assert.ok(Math.max(...bays) - Math.min(...bays) <= 1, `${L} ft: ${bays.join(' / ')}`);
    for (const s of p.segments) assert.ok(s.lengthFt <= 120 + 1e-9, `${L} ft: ${s.lengthFt} ft`);
    for (const at of p.atFt) assert.ok(onBay(at - p.atFt.indexOf(at) * W), `${L} ft: aisle at ${at}`);
  }
});

const rack: RackLayoutInput = {
  buildingLengthFt: 300, buildingWidthFt: 120,
  beamLengthIn: 96, palletsPerBay: 2, levels: 4, frameDepthIn: 42,
  aisleWidthFt: 12.5, wallClearanceFt: 2.5, orientation: 'length',
};

test('the pallet layout never cuts a bay with an aisle, in either orientation', () => {
  for (const orientation of ['length', 'width'] as const) {
    for (const buildingLengthFt of [150, 240, 300, 420, 600]) {
      const l = layoutRack('selective', { ...rack, buildingLengthFt, buildingWidthFt: 400, orientation });
      assert.equal(l.crossAisleAtFt.length, l.crossAisles);
      for (const a of l.crossAisleAtFt) {
        for (const x of l.bayStartsFt) {
          const over = Math.min(x + l.bayLengthFt, a + W) - Math.max(x, a);
          assert.ok(over <= 1e-6, `${orientation} ${buildingLengthFt}: bay at ${x} cut by aisle at ${a}`);
        }
        assert.ok(l.bayStartsFt.some((x) => Math.abs(x + l.bayLengthFt - a) < 1e-6),
          `${orientation} ${buildingLengthFt}: the aisle at ${a} ft starts at a bay end`);
      }
    }
  }
});

test('a cantilever floor on its own breaks at the ends of runs', () => {
  const l = layoutCantileverRuns({
    buildingLengthFt: 400, buildingWidthFt: 120, clearHeightFt: 24,
    aisleWidthFt: 12, wallClearanceFt: 2.5, orientation: 'length',
    productLengthFt: 20, armLengthIn: 48,
  });
  assert.ok(l.crossAisles > 0);
  for (const a of l.crossAisleAtFt) {
    assert.ok(l.runStartsFt.some((x) => Math.abs(x + l.runLengthFt - a) < 1e-6),
      `the aisle at ${a} ft starts where a run ends`);
  }
});

/** The longest stretch of racking with no cross aisle in it, ft. */
function longestRunFt(startsFt: readonly number[], moduleFt: number, pitchFt: number): number {
  let run = 0, longest = 0, last = -Infinity;
  for (const x of startsFt) {
    run = x - last > pitchFt + 1e-6 ? moduleFt : run + pitchFt;
    longest = Math.max(longest, run);
    last = x;
  }
  return longest;
}

test('a mixed floor plans from the longer zone, and holds both to 120 ft', () => {
  // With the floor given as an area, each zone's run is that area over its own
  // width. The pallet zone is narrower than the building by the strip, so it
  // runs further: 60,000 sq ft is ~387 ft of strip and over 450 ft of pallets.
  const input: MixedInput = {
    buildingLengthFt: 600, buildingWidthFt: 160, clearHeightFt: 28,
    wallClearanceFt: 2.5, orientation: 'length',
    available: { mode: 'area', sqFt: 60000 },
    cantilever: { linearFeetNeededFt: 500, productLengthFt: 20, armLengthIn: 48, armSpacingIn: 24 },
    pallet: {
      kind: 'selective', beamLengthIn: 96, palletsPerBay: 2, levels: 4,
      frameDepthIn: 42, aisleWidthFt: 12.5,
    },
  };
  const l = layoutMixed(input);
  assert.ok(l.pallets.usableAlongFt > l.strip.usableAlongFt + 50,
    `the pallet zone runs ${l.pallets.usableAlongFt.toFixed(0)} ft, `
    + `the strip ${l.strip.usableAlongFt.toFixed(0)} ft`);

  assert.deepEqual(l.strip.crossAisleAtFt, l.pallets.crossAisleAtFt,
    'the aisles are at the same feet in both zones');
  // Planned from the strip alone, the pallet zone's far end ran on past the
  // last aisle with nothing holding it to 120 ft. That is the case this fixes.
  const fromStrip = crossAislePlan({ usableAlongFt: l.strip.usableAlongFt, moduleFt: BAY_FT }).atFt;
  const tail = l.pallets.usableAlongFt - ((fromStrip[fromStrip.length - 1] ?? -W) + W);
  assert.ok(tail > 120, `planned from the strip, the pallet zone would end in ${tail.toFixed(0)} ft unbroken`);

  const pallets = longestRunFt(l.pallets.bayStartsFt, l.pallets.bayLengthFt, l.pallets.bayLengthFt);
  assert.ok(pallets <= 120 + 1e-9, `the longest pallet run is ${pallets.toFixed(1)} ft`);
  const strip = longestRunFt(l.strip.runStartsFt, l.strip.runLengthFt,
    l.strip.runLengthFt + l.strip.runGapFt);
  assert.ok(strip <= 120 + 1e-9, `the longest cantilever run is ${strip.toFixed(1)} ft`);

  // and the pallet bays still break at a bay end
  for (const a of l.pallets.crossAisleAtFt) {
    if (a >= l.pallets.usableAlongFt) continue;
    assert.ok(l.pallets.bayStartsFt.some((x) => Math.abs(x + l.pallets.bayLengthFt - a) < 1e-6),
      `the aisle at ${a} ft starts at a pallet bay end`);
  }
});

test('the mixed aisle plan settles well inside its cap', () => {
  const base: MixedInput = {
    buildingLengthFt: 600, buildingWidthFt: 160, clearHeightFt: 28,
    wallClearanceFt: 2.5, orientation: 'length',
    cantilever: { linearFeetNeededFt: 500, productLengthFt: 20, armLengthIn: 48, armSpacingIn: 24 },
    pallet: {
      kind: 'selective', beamLengthIn: 96, palletsPerBay: 2, levels: 4,
      frameDepthIn: 42, aisleWidthFt: 12.5,
    },
  };
  const cases: MixedInput[] = [
    base,
    { ...base, available: { mode: 'area', sqFt: 60000 } },
    { ...base, available: { mode: 'area', sqFt: 30000 }, orientation: 'width', buildingWidthFt: 400 },
    { ...base, available: { mode: 'fraction', fraction: 0.75 } },
    { ...base, cantilever: { ...base.cantilever, linearFeetNeededFt: 3000 },
      available: { mode: 'area', sqFt: 45000 } },
  ];
  for (const c of cases) {
    const p = mixedAislePlan(c);
    assert.ok(p.passes < MIXED_AISLE_PASSES, `${JSON.stringify(c.available)}: ${p.passes} passes`);
    const l = layoutMixed(c);
    assert.ok(p.alongFt >= Math.max(l.strip.usableAlongFt, l.pallets.usableAlongFt) - 1e-9,
      'planned along the longer zone');
  }
});

test('a mixed floor places its aisles once, on the pallet bays, and both zones use them', () => {
  const mixed: MixedInput = {
    buildingLengthFt: 300, buildingWidthFt: 160, clearHeightFt: 28,
    wallClearanceFt: 2.5, orientation: 'length',
    cantilever: { linearFeetNeededFt: 500, productLengthFt: 20, armLengthIn: 48, armSpacingIn: 24 },
    pallet: {
      kind: 'selective', beamLengthIn: 96, palletsPerBay: 2, levels: 4,
      frameDepthIn: 42, aisleWidthFt: 12.5,
    },
  };
  for (const orientation of ['length', 'width'] as const) {
    const l = layoutMixed({ ...mixed, orientation, buildingWidthFt: orientation === 'width' ? 300 : 160 });
    assert.deepEqual(l.strip.crossAisleAtFt, l.pallets.crossAisleAtFt,
      `${orientation}: the same feet in both zones`);
    assert.ok(l.pallets.crossAisles > 0, `${orientation}: a long enough floor is broken`);
    for (const a of l.pallets.crossAisleAtFt) {
      assert.ok(l.pallets.bayStartsFt.some((x) => Math.abs(x + l.pallets.bayLengthFt - a) < 1e-6),
        `${orientation}: the aisle at ${a} ft starts at a pallet bay end`);
      for (const x of l.strip.runStartsFt) {
        const over = Math.min(x + l.strip.runLengthFt, a + W) - Math.max(x, a);
        assert.ok(over <= 1e-6, `${orientation}: a run at ${x} ft is cut by the aisle at ${a} ft`);
      }
    }
  }
});
