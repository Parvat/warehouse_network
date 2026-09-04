import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILDING_FT, buildingSizeCheck, crossAislesFor, layoutMixed, layoutRack, maxStripRows,
  mixedChecks,
  type MixedInput, type MixedPriority, type RackLayoutInput,
} from '../src/index.js';

/* ── which family gets the building first ──────────────────────────────── */

const base: MixedInput = {
  buildingLengthFt: 240, buildingWidthFt: 120, clearHeightFt: 28,
  wallClearanceFt: 2.5, orientation: 'length',
  cantilever: { linearFeetNeededFt: 5000, productLengthFt: 20, armLengthIn: 48 },
  pallet: {
    kind: 'selective', beamLengthIn: 96, palletsPerBay: 2, levels: 4,
    frameDepthIn: 42, aisleWidthFt: 12.5,
  },
};

const at = (neededFt: number, priority: MixedPriority): MixedInput => ({
  ...base, priority, cantilever: { ...base.cantilever, linearFeetNeededFt: neededFt },
});

test('the cantilever leads by default, because its figure was asked for', () => {
  const l = layoutMixed(at(5000, 'cantilever'));
  assert.equal(l.priority, 'cantilever');
  assert.equal(layoutMixed({ ...at(5000, 'cantilever'), priority: undefined }).priority,
    'cantilever', 'and it is the default, not something to remember to set');
});

test('cantilever first meets the linear feet and the pallet count falls to suit', () => {
  const l = layoutMixed(at(5000, 'cantilever'));
  assert.ok(l.strip.linearFt >= 5000, `${l.strip.linearFt} ft built against 5,000 asked`);
  assert.equal(l.shortFt, 0);
  assert.ok(l.pallets.positions < l.palletsAlone.positions,
    'the strip is paid for in positions, and the trade-off line says so');
  assert.ok(l.positionsCost > 0);
  assert.equal(mixedChecks(at(5000, 'cantilever'), l).filter((f) => f.severity === 'blocking')
    .length, 0, 'nothing is blocking when the requirement is met');
});

test('asking for more takes more of the width, and only as much as it needs', () => {
  const small = layoutMixed(at(2000, 'cantilever'));
  const large = layoutMixed(at(12000, 'cantilever'));
  assert.ok(large.strip.rows > small.strip.rows, 'more stock, more rows');
  assert.ok(large.pallets.positions < small.pallets.positions, 'and fewer pallet positions');
  assert.ok(small.strip.linearFt >= 2000 && small.strip.linearFt < 12000,
    'the small ask does not quietly build the large one');
});

test('pallets first holds the strip to a minimum and prices the shortfall', () => {
  const input = at(5000, 'pallets');
  const l = layoutMixed(input);
  assert.equal(l.strip.rows, 1, 'one row is the minimum strip');
  assert.ok(l.shortFt > 0, `${l.strip.linearFt} ft built against 5,000 asked`);
  assert.ok(l.pallets.positions > layoutMixed(at(5000, 'cantilever')).pallets.positions,
    'and the pallet racking keeps what the strip gave up');

  const flag = mixedChecks(input, l).find((f) => f.severity === 'blocking');
  assert.ok(flag, 'a shortfall is never reported as a bare figure');
  assert.match(flag!.detail, /5,000 linear ft/, 'it names what was asked for');
  assert.match(flag!.detail, /more cantilever rows?/, 'and what meeting it would take');
  assert.match(flag!.detail, /pallet positions/, 'and what that would cost');
  assert.match(flag!.detail, /cantilever first/, 'and the way out');
});

test('a request beyond the whole building is blocking under either priority', () => {
  for (const priority of ['cantilever', 'pallets'] as const) {
    const input = at(60000, priority);
    const l = layoutMixed(input);
    assert.ok(60000 > l.wholeBuildingLinearFt, 'this really is past the building');
    const flag = mixedChecks(input, l)
      .find((f) => f.severity === 'blocking' && /will not hold/.test(f.title));
    assert.ok(flag, `${priority} first raises it`);
    assert.match(flag!.detail, new RegExp(l.wholeBuildingLinearFt.toLocaleString()),
      'naming the achievable figure');
  }
});

test('switching priority changes both counts', () => {
  const c = layoutMixed(at(5000, 'cantilever'));
  const p = layoutMixed(at(5000, 'pallets'));
  assert.notEqual(c.strip.linearFt, p.strip.linearFt);
  assert.notEqual(c.pallets.positions, p.pallets.positions);
  assert.notEqual(c.stripTotalDepthFt, p.stripTotalDepthFt, 'and the drawing with them');
});

test('the strip may never take the last pallet row', () => {
  for (const widthFt of [60, 80, 100, 120, 160, 200]) {
    const input = { ...at(60000, 'cantilever'), buildingWidthFt: widthFt };
    const rows = maxStripRows(input);
    assert.ok(rows >= 1, `${widthFt} ft: at least one row`);
    const l = layoutMixed(input);
    assert.ok(l.strip.rows <= rows, `${widthFt} ft: ${l.strip.rows} rows within the ${rows} cap`);
    if (l.fits) {
      assert.ok(l.pallets.rows >= 1, `${widthFt} ft: pallet racking survives`);
    }
  }
});

/* ── cross aisles come off the count, and follow the override ──────────── */

const rackInput = (crossAisles?: number): RackLayoutInput => ({
  buildingLengthFt: 240, buildingWidthFt: 120,
  beamLengthIn: 96, palletsPerBay: 2, levels: 4, frameDepthIn: 42,
  aisleWidthFt: 12.5, wallClearanceFt: 2.5, orientation: 'length',
  crossAisles,
});

test('cross aisles cost positions, and the count follows the number', () => {
  const derived = layoutRack('selective', rackInput());
  assert.equal(derived.crossAisles, crossAislesFor(derived.usableAlongFt),
    'left alone, Trace cuts a row every hundred feet');

  let last = Number.POSITIVE_INFINITY;
  for (const n of [0, 1, 2, 3, 4]) {
    const l = layoutRack('selective', rackInput(n));
    assert.equal(l.crossAisles, n, `${n} asked for`);
    assert.equal(l.crossAisleAtFt.length, n, 'and drawn where they are counted');
    assert.ok(l.positions <= last, `${n} aisles: ${l.positions} positions, was ${last}`);
    last = l.positions;
  }
  assert.ok(layoutRack('selective', rackInput(4)).positions
    < layoutRack('selective', rackInput(0)).positions,
    'four aisles cost real positions against none');
});

test('clearing the override returns the derived figure', () => {
  const forced = layoutRack('selective', rackInput(5));
  const derived = layoutRack('selective', rackInput(undefined));
  assert.equal(forced.crossAisles, 5);
  assert.equal(derived.crossAisles, crossAislesFor(derived.usableAlongFt));
  assert.notEqual(forced.positions, derived.positions);
});

/* ── a cross aisle cuts the building, not one family in it ─────────────── */

test('a cross aisle cuts the strip and the pallet zone alike', () => {
  const none = layoutMixed({ ...at(5000, 'cantilever'), crossAisles: 0 });
  const two = layoutMixed({ ...at(5000, 'cantilever'), crossAisles: 2 });

  assert.equal(none.pallets.crossAisles, 0, 'the pallet zone is told');
  assert.equal(two.pallets.crossAisles, 2);
  assert.equal(none.strip.crossAisles, 0, 'and so is the strip');
  assert.equal(two.strip.crossAisles, 2);

  // both rows are really broken by the gap, and the gaps are in the same place
  assert.deepEqual(
    two.pallets.crossAisleAtFt.map((x) => +x.toFixed(1)),
    two.strip.crossAisleAtFt.map((x) => +x.toFixed(1)),
    'an aisle at 80 ft is at 80 ft in both zones');

  assert.ok(two.pallets.positions < none.pallets.positions,
    `${none.pallets.positions} positions down to ${two.pallets.positions}`);
  assert.ok(two.strip.maxLinearFt <= none.strip.maxLinearFt,
    `${none.strip.maxLinearFt} linear ft down to ${two.strip.maxLinearFt}`);
});

test('the aisles line up whatever the building length', () => {
  // The datum is the building, so changing its length moves both zones' aisles
  // together — which is what makes a gap a route rather than two dead ends.
  for (const buildingLengthFt of [180, 240, 300, 420, 600, 750]) {
    const l = layoutMixed({ ...at(40000, 'cantilever'), buildingLengthFt, crossAisles: 2 });
    const pallets = l.pallets.crossAisleAtFt.map((x) => +x.toFixed(2));
    const strip = l.strip.crossAisleAtFt.map((x) => +x.toFixed(2));
    assert.deepEqual(pallets, strip, `${buildingLengthFt} ft: ${pallets} against ${strip}`);
    assert.equal(pallets.length, 2);
  }
});

test('the aisles are drawn where they were counted, in both zones', () => {
  const l = layoutMixed({ ...at(40000, 'cantilever'), crossAisles: 2 });
  assert.equal(l.pallets.crossAisleAtFt.length, 2, 'the pallet zone draws two');
  assert.equal(l.strip.crossAisleAtFt.length, 2, 'the strip draws two');

  // a run is emitted as segments: the gaps are real floor, not an overlay
  const starts = [...l.strip.runStartsFt];
  assert.ok(starts.length > 0);
  const gaps = starts.slice(1).map((x, i) => x - starts[i]! - l.strip.runLengthFt);
  assert.ok(gaps.some((g) => g > l.strip.crossAisleWidthFt - 1),
    `runs are broken by a ${l.strip.crossAisleWidthFt} ft gap, not drawn through it`);
});

test('an aisle costs the pallet zone bays, every time', () => {
  // An 8 ft bay is small against a segment, so the pallet count falls smoothly.
  let positions = Infinity;
  for (const n of [0, 1, 2, 3, 4, 5, 6]) {
    const l = layoutMixed({ ...at(40000, 'cantilever'), crossAisles: n });
    assert.ok(l.pallets.positions <= positions,
      `${n} aisles: ${l.pallets.positions} against ${positions}`);
    positions = l.pallets.positions;
  }
});

test('the strip pays too, though a coarse module makes it lumpy', () => {
  // A cantilever run is 20 ft of product on a 3 ft gap — 23 ft against a 223 ft
  // row. Cutting that into equal segments wastes whatever the last run in each
  // does not use, and the waste does not shrink evenly: two aisles can leave
  // *more* room for runs than one, because three short segments happen to
  // divide better than two long ones.
  //
  // The alternative is to place the aisles where this zone's runs happen to
  // end, which is exactly what put the strip's gaps at different feet from the
  // racking's. A route through the building is worth more than a monotonic
  // curve, so the geometry is left honest and the lumps are documented here.
  const holds = (n: number) =>
    layoutMixed({ ...at(40000, 'cantilever'), crossAisles: n }).strip.maxLinearFt;

  assert.ok(holds(1) < holds(0), `one aisle costs the strip (${holds(0)} → ${holds(1)})`);
  assert.ok(holds(6) < holds(0), `and six cost it plenty (${holds(0)} → ${holds(6)})`);
  assert.ok(holds(4) < holds(2), `over any real step it falls (${holds(2)} → ${holds(4)})`);
});

/* ── the building the planner will size ────────────────────────────────── */

test('a building at the ceiling says so, and says what to do instead', () => {
  assert.equal(buildingSizeCheck(240, 120), null, 'an ordinary shed raises nothing');
  assert.equal(buildingSizeCheck(BUILDING_FT.max - 1, BUILDING_FT.max - 1), null);

  const long = buildingSizeCheck(BUILDING_FT.max, 120);
  assert.ok(long, 'a length at the limit raises a check');
  assert.equal(long!.severity, 'check', 'a check, not a blocker: the layout is still valid');
  assert.match(long!.detail, new RegExp(`${BUILDING_FT.max} ft`), 'naming the figure');
  assert.match(long!.detail, /length has been held/, 'and which dimension was held');
  assert.match(long!.detail, /split the floor into zones/, 'and what to do instead');

  const both = buildingSizeCheck(BUILDING_FT.max, BUILDING_FT.max);
  assert.match(both!.detail, /length and width have been held/, 'both, where both are');
});
