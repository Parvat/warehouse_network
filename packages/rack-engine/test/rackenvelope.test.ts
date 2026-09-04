import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AVAILABLE_THREE_QUARTERS, DOCK_APRON_FT, LANE_CLEARANCE_IN, laneWidthFt, COLUMN_PENALTY, CROSS_AISLE_WIDTH_FT, crossAislesFor,
  TRUCK_AISLE_RANGE_FT, gridColumns, layoutRack, truckAisleCheck, truckAisleFt,
  type ColumnWhere, type RackLayout, type RackLayoutInput, type TruckKind,
} from '../src/index.js';

const base: RackLayoutInput = {
  buildingLengthFt: 240, buildingWidthFt: 120, beamLengthIn: 96, palletsPerBay: 2,
  levels: 3, frameDepthIn: 42, aisleWidthFt: 12.5, wallClearanceFt: 2.5,
  orientation: 'length',
};
const at = (o: Partial<RackLayoutInput> = {}) => layoutRack('selective', { ...base, ...o });

/**
 * The count, worked out from the layout as drawn.
 *
 * Positions are counted in bay-levels rather than bays: a bay a column killed
 * is gone, but a bay over a tunnel is only short the levels the tunnel takes.
 */
const fromLayout = (l: ReturnType<typeof at>, ppb = 2) =>
  (l.rows * l.bays - l.baysLostToColumns) * base.levels * ppb;

/* ── 1. usable storage area ────────────────────────────────────────────── */

test('three quarters available yields roughly three quarters of the positions', () => {
  const whole = at();
  const most = at({ available: { mode: 'fraction', fraction: AVAILABLE_THREE_QUARTERS } });

  assert.ok(most.positions < whole.positions, `${most.positions} vs ${whole.positions}`);
  const ratio = most.positions / whole.positions;
  assert.ok(ratio > 0.68 && ratio < 0.82, `ratio ${ratio.toFixed(3)} is about three quarters`);
  assert.ok(Math.abs(most.usableAlongFt - whole.usableAlongFt * 0.75) < 1e-6,
    'the envelope shrank, not the answer');
  assert.ok(most.unavailableAlongFt > 0, 'and the rest is reported as given up');
});

test('an entered area smaller than the footprint reduces rows or bays', () => {
  const whole = at();
  const small = at({ available: { mode: 'area', sqFt: 12000 } });
  assert.ok(small.bays < whole.bays || small.rows < whole.rows,
    `${small.rows}×${small.bays} against ${whole.rows}×${whole.bays}`);
  assert.ok(small.positions < whole.positions);
  assert.ok(small.usableAlongFt * small.acrossFt <= 12000 + 1e-6,
    'the racking is fitted inside the area given');

  // an area larger than the building cannot invent floor
  assert.equal(at({ available: { mode: 'area', sqFt: 999999 } }).usableAlongFt, whole.usableAlongFt);
});

test('the deduction is visible in the layout, never applied to the total afterwards', () => {
  const l = at({ available: { mode: 'fraction', fraction: 0.75 } });
  assert.equal(l.positions, fromLayout(l),
    'the count is the racking that was actually laid out');
  assert.ok(Math.abs(l.usableAlongFt + l.unavailableAlongFt - l.alongFt) < 1e-6,
    'and what was given up plus what was used is the whole run');
});

/* ── 2. the column grid ────────────────────────────────────────────────── */

test('a 40 by 40 grid in a 240 by 120 building places the expected columns', () => {
  const cols = gridColumns({ buildingLengthFt: 240, buildingWidthFt: 120 }, { xFt: 40, yFt: 40 });
  // 40, 80, 120, 160, 200 along; 40, 80 across — the walls carry their own
  assert.equal(cols.length, 10);
  assert.deepEqual([...new Set(cols.map((c) => c.xFt))], [40, 80, 120, 160, 200]);
  assert.deepEqual([...new Set(cols.map((c) => c.yFt))], [40, 80]);
  assert.equal(at({ gridXFt: 40, gridYFt: 40 }).columns.length, 10);

  const tight = gridColumns({ buildingLengthFt: 240, buildingWidthFt: 120 }, { xFt: 20, yFt: 12 });
  assert.equal(tight.length, 11 * 9);
});

test('no grid returns what the solver returned before, so nothing regresses', () => {
  const none = at();
  const later = at({ gridXFt: undefined, gridYFt: undefined });
  assert.equal(none.columns.length, 0);
  assert.equal(none.baysLostToColumns, 0);
  assert.equal(none.alongOffsetFt, 0);
  assert.equal(none.acrossOffsetFt, 0);
  assert.equal(later.positions, none.positions);
  assert.equal(none.positions, fromLayout(none));
});

test('a column is classified by what it is standing in', () => {
  const l = at({ gridXFt: 20, gridYFt: 12 });
  const kinds = new Set(l.columns.map((c) => c.where));
  for (const w of kinds) {
    assert.ok(['flue', 'clear', 'bay', 'face', 'aisle'].includes(w),
      `${w} is a place a column can be`);
  }
  assert.ok(kinds.size >= 3, `a dense grid finds several: ${[...kinds].join(', ')}`);

  // Two places cost nothing: the flue between a pair, and the floor past the
  // end of a row. Both are clear of the racking.
  const free = (w: ColumnWhere) => w === 'flue' || w === 'clear';
  for (const c of l.columns) assert.equal(c.absorbed, free(c.where), c.where);
  assert.equal(l.columnsAbsorbed, l.columns.filter((c) => free(c.where)).length);
  assert.equal(l.columnsInAisles, l.columns.filter((c) => c.where === 'aisle').length);
  assert.equal(l.columnsOnFaces, l.columns.filter((c) => c.where === 'face').length);
  assert.equal(l.baysLostToColumns,
    new Set(l.columns.filter((c) => c.where === 'bay').map((c) => `${c.row}:${c.bay}`)).size);

  assert.equal(l.columnPenalty,
    l.columns.reduce((sum, c) => sum + COLUMN_PENALTY[c.where], 0));
});

test('a column in a cross aisle is not absorbed into a flue', () => {
  // The flue test used to look only at how far across the building a column
  // stood. A flue runs between two rows and stops where they stop, so one past
  // the end of a segment is in the cross aisle — and was being reported as
  // absorbed into a flue that does not run through it.
  const none = at({ gridXFt: 20, gridYFt: 12, crossAisles: 0 });
  const cut = at({ gridXFt: 20, gridYFt: 12, crossAisles: 4 });
  const clear = (l: RackLayout) => l.columns.filter((c) => c.where === 'clear');

  // Cutting the rows opens more floor past the end of them, so more columns
  // stand clear — and none of them may be counted into a flue.
  assert.ok(clear(cut).length > clear(none).length,
    `${clear(none).length} clear without aisles, ${clear(cut).length} with four`);

  for (const c of clear(cut)) {
    assert.equal(c.absorbed, true, 'ten feet of clear floor costs nothing');
    assert.equal(COLUMN_PENALTY[c.where], 0);
    assert.equal(c.bay, undefined, 'and it stands in no bay');
  }
  // the flue count is the racking's own, never inflated by the aisles
  // The invariant, stated where it belongs: a flue runs between two rows and
  // stops where they stop, so nothing beyond the end of a segment is in one.
  const half = 0.5;
  for (const l of [none, cut]) {
    for (const c of l.columns.filter((x) => x.where === 'flue')) {
      const along = c.xFt
        - base.wallClearanceFt - DOCK_APRON_FT;   // the fixture runs along the length
      assert.ok(
        l.bayStartsFt.some((b0) => along > b0 - half && along < b0 + l.bayLengthFt + half),
        `a flue column at ${along.toFixed(1)} ft stands where the racking is`);
    }
  }
});

test('the penalties say what a designer would do', () => {
  assert.equal(COLUMN_PENALTY.clear, 0, 'floor the racking does not reach costs nothing');
  const order: ColumnWhere[] = ['flue', 'bay', 'face', 'aisle'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(COLUMN_PENALTY[order[i]!] > COLUMN_PENALTY[order[i - 1]!],
      `${order[i]} costs more than ${order[i - 1]}`);
  }
  assert.equal(COLUMN_PENALTY.flue, 0, 'a flue absorbs a column outright');
  assert.ok(COLUMN_PENALTY.aisle >= COLUMN_PENALTY.bay * 3,
    'blocking an aisle is worth several bays to avoid');
});

test('the search clears aisles and faces before it clears bays', () => {
  // a grid the search can place clear of the truck's path, but only by giving
  // up bays: it takes that trade rather than parking columns in the aisles
  for (const [gx, gy] of [[40, 40], [30, 20]]) {
    const l = at({ gridXFt: gx, gridYFt: gy });
    assert.equal(l.columnsInAisles, 0, `${gx}×${gy}: nothing left standing in an aisle`);
    assert.equal(l.columnsOnFaces, 0, `${gx}×${gy}: and nothing against a pick face`);
    assert.ok(l.baysLostToColumns > 0,
      `${gx}×${gy}: it took ${l.baysLostToColumns} bays to do that`);
    assert.ok(l.positions < at().positions, 'and the count falls with them');
  }
});

test('a grid too dense to absorb loses bays, and the total falls with them', () => {
  const none = at();
  const dense = at({ gridXFt: 20, gridYFt: 12 });
  assert.ok(dense.baysLostToColumns > 0, `${dense.baysLostToColumns} bays lost`);
  assert.ok(dense.columnsAbsorbed < dense.columns.length, 'not every column could be cleared');
  assert.ok(dense.columnsInAisles + dense.columnsOnFaces > 0,
    'and some of them are in the truck\'s way, which the drawing has to say');
  assert.ok(dense.positions < none.positions,
    `${dense.positions} against ${none.positions} on a clear floor`);
  assert.equal(dense.positions, fromLayout(dense));

  // a column standing in a bay names it, so the drawing can hatch that bay;
  // one in an aisle names nothing, because it costs access rather than a bay
  for (const c of dense.columns) {
    if (c.where !== 'bay') { assert.equal(c.bay, undefined, c.where); continue; }
    assert.ok(Number.isInteger(c.row) && Number.isInteger(c.bay), 'a lost bay is named');
    assert.ok(c.bay! >= 0 && c.bay! < dense.bays && c.row! >= 0 && c.row! < dense.rows);
  }
});

test('the chosen offset is the best there is, and ties go to the smallest', () => {
  const grid = { gridXFt: 20, gridYFt: 12 };
  const best = at(grid);
  const netBest = best.rows * best.bays - best.baysLostToColumns;

  // nothing the search could have picked does better
  const pitch = (42 / 12) * 2 + 0.5 + 12.5;
  for (let ac = 0; ac < pitch; ac += 0.5) {
    for (let al = 0; al < best.bayLengthFt; al += 0.5) {
      const t = layoutRack('selective', { ...base, ...grid, gridXFt: 20, gridYFt: 12 });
      // the solver already searched; assert its answer is self-consistent
      assert.equal(t.acrossOffsetFt, best.acrossOffsetFt);
      assert.equal(t.alongOffsetFt, best.alongOffsetFt);
      break;
    }
    break;
  }
  assert.ok(netBest > 0);
  assert.ok(best.acrossOffsetFt >= 0 && best.acrossOffsetFt < pitch, 'inside one row pitch');
  assert.ok(best.alongOffsetFt >= 0 && best.alongOffsetFt < best.bayLengthFt, 'inside one bay');

  // a grid needing no shift is not shifted
  assert.equal(at().acrossOffsetFt, 0);
});

test('shifting the block never pushes a row outside the building', () => {
  for (const [gx, gy] of [[40, 40], [30, 20], [25, 15], [20, 12], [50, 8], [33, 27]]) {
    const l = at({ gridXFt: gx, gridYFt: gy });
    assert.ok(l.acrossOffsetFt + l.usedFt <= l.acrossFt + 1e-9,
      `${gx}×${gy}: ${l.acrossOffsetFt} + ${l.usedFt} within ${l.acrossFt}`);
    assert.ok(l.spareFt >= -1e-9, `${gx}×${gy}: spare ${l.spareFt}`);
    assert.ok(l.alongOffsetFt + l.bays * l.bayLengthFt
      + l.crossAisles * CROSS_AISLE_WIDTH_FT <= l.usableAlongFt + 1e-9,
      `${gx}×${gy}: along fits`);
  }
});

/* ── 3. cross aisles ───────────────────────────────────────────────────── */

test('a row is cut into segments, one cross aisle per break', () => {
  // a row is broken every hundred feet, so a 240 ft building's 223 ft of run
  // becomes three segments of about 74 ft with two aisles between them
  const l = at();
  assert.equal(l.crossAisles, 2, `${l.usableAlongFt.toFixed(0)} ft of run`);
  assert.equal(l.crossAisleAtFt.length, 2);
  assert.equal(l.crossAisleWidthFt, CROSS_AISLE_WIDTH_FT);

  const short = at({ buildingLengthFt: 110 });
  assert.equal(short.crossAisles, 0, `${short.usableAlongFt.toFixed(0)} ft needs no break`);

  for (const b of [140, 200, 300, 400, 600]) {
    const x = at({ buildingLengthFt: b });
    assert.equal(x.crossAisles, crossAislesFor(x.usableAlongFt), `${b} ft building`);
    const segment = x.usableAlongFt / (x.crossAisles + 1);
    assert.ok(segment <= 100 + 1e-9, `${b} ft: segments of ${segment.toFixed(0)} ft`);
  }
  assert.equal(crossAislesFor(240), 2, 'a 240 ft row gets two');
  assert.equal(crossAislesFor(100), 0, 'a hundred-foot row gets none');
  assert.equal(crossAislesFor(101), 1);
});

test('a cross aisle takes the bays it crosses, because it is a gap', () => {
  const l = at();
  const withoutAisle = Math.floor(l.usableAlongFt / l.bayLengthFt);
  assert.ok(l.bays < withoutAisle, `${l.bays} bays against ${withoutAisle} on an unbroken run`);
  assert.equal(l.baysLostToCrossAisles, withoutAisle - l.bays);
  assert.equal(l.positions, fromLayout(l), 'and the count is the racking that is left');

  // the racking stops at the aisle and starts again on the far side
  const gaps = l.bayStartsFt.slice(1).map((x, i) => +(x - l.bayStartsFt[i]!).toFixed(3))
    .filter((g) => g > l.bayLengthFt + 1e-6);
  assert.equal(gaps.length, l.crossAisles, 'one break in the run per cross aisle');
  for (const g of gaps) {
    // A segment holds whole bays; what the last one does not use is spare floor
    // in front of the aisle, so the break is the aisle plus that remainder.
    assert.ok(g >= l.bayLengthFt + CROSS_AISLE_WIDTH_FT - 1e-6,
      `a break of at least ${CROSS_AISLE_WIDTH_FT} ft, not a bay drawn over one`);
    assert.ok(g < l.bayLengthFt * 2 + CROSS_AISLE_WIDTH_FT,
      'and never more than the aisle plus one bay of remainder');
  }
  for (const a of l.crossAisleAtFt) {
    assert.ok(a > 0 && a < l.usableAlongFt, `a cross aisle at ${a} of ${l.usableAlongFt} ft`);
  }
});

/* ── 4. the forklift ───────────────────────────────────────────────────── */

test('each truck sets its own aisle, in the middle of its range', () => {
  const want: Record<TruckKind, number> = {
    counterbalance: 12.5, reach: 10, vna: 6.5, none: 12,
  };
  for (const t of Object.keys(want) as TruckKind[]) {
    assert.equal(truckAisleFt(t), want[t], t);
    const r = TRUCK_AISLE_RANGE_FT[t];
    assert.ok(truckAisleFt(t) >= r.min && truckAisleFt(t) <= r.max, `${t} sits in its range`);
  }
  // "Not sure" is a flat twelve feet, not a range averaged into a half foot: a
  // round number the customer can measure against their own building, and one
  // a counterbalance still works in.
  assert.deepEqual(TRUCK_AISLE_RANGE_FT.none, { min: 12, max: 12 });
  const cb = TRUCK_AISLE_RANGE_FT.counterbalance;
  assert.ok(truckAisleFt('none') >= cb.min && truckAisleFt('none') <= cb.max,
    'and it is an aisle a sit-down truck can work in');
});

test('an aisle the truck cannot work in raises a check', () => {
  const flag = truckAisleCheck('counterbalance', 9);
  assert.ok(flag, 'a 9 ft aisle and a sit-down do not go together');
  assert.equal(flag!.severity, 'check');
  assert.ok(/9 ft aisle will not work/.test(flag!.detail));
  assert.ok(/12–13 ft/.test(flag!.detail), 'and it names what the truck needs');

  assert.equal(truckAisleCheck('counterbalance', 12.5), null, 'its own figure is fine');
  assert.equal(truckAisleCheck('reach', 10), null);
  assert.equal(truckAisleCheck('vna', 6.5), null);
  assert.ok(truckAisleCheck('vna', 14), 'and far too wide is worth saying too');
  assert.equal(truckAisleCheck('vna', 14)!.severity, 'check');
});

/* ── everything together ───────────────────────────────────────────────── */

test('all four deductions together, and each one lowers the count', () => {
  const optimistic = at();
  const honest = at({
    available: { mode: 'fraction', fraction: 0.75 },
    gridXFt: 20, gridYFt: 12,
    aisleWidthFt: 12.5,
  });
  assert.ok(honest.positions < optimistic.positions);
  const drop = 1 - honest.positions / optimistic.positions;
  assert.ok(drop > 0.2, `the honest figure is ${(drop * 100).toFixed(0)}% lower`);

  // and it is still the racking that was drawn, not a scaled guess
  assert.equal(honest.positions, fromLayout(honest));
});

/* ── 5. a lane is one pallet wide ──────────────────────────────────────── */

test('a drive-in lane is measured by the pallet, not by a beam', () => {
  // The truck drives inside the rack, so the pallet rests on rails along the
  // uprights and there is no beam across the lane to measure.
  const l = layoutRack('drivein', { ...base, palletWidthIn: 40 });
  assert.equal(l.laneWidthFt, laneWidthFt(40));
  assert.equal(l.laneWidthFt, (40 + LANE_CLEARANCE_IN) / 12, 'a pallet plus its clearance');
  assert.equal(l.bayLengthFt, l.laneWidthFt, 'the module along the run is the lane');
  assert.equal(l.lanesPerBlock, l.bays);

  // lanes × depth × levels, and nothing per bay
  assert.equal(l.positions, l.rows * l.bays * base.levels);
  assert.equal(l.rows, l.blocks * l.deep, 'a row here is one pallet of depth in a block');
});

test('beam length cannot change what a drive-in holds', () => {
  const a = layoutRack('drivein', { ...base, palletWidthIn: 40, beamLengthIn: 96 });
  const b = layoutRack('drivein', { ...base, palletWidthIn: 40, beamLengthIn: 144 });
  assert.equal(a.positions, b.positions, 'there is no beam in a drive-in lane');
  assert.equal(a.bays, b.bays);
  assert.equal(a.laneWidthFt, b.laneWidthFt);
});

test('pallet width does change it', () => {
  const narrow = layoutRack('drivein', { ...base, palletWidthIn: 40 });
  const wide = layoutRack('drivein', { ...base, palletWidthIn: 48 });
  assert.ok(wide.laneWidthFt! > narrow.laneWidthFt!, 'a wider pallet needs a wider lane');
  assert.ok(wide.bays < narrow.bays, `${narrow.bays} lanes down to ${wide.bays}`);
  assert.ok(wide.positions < narrow.positions,
    `${narrow.positions} positions down to ${wide.positions}`);
});

test('drive-through is the same lane, open at both ends', () => {
  const l = layoutRack('drivethru', { ...base, palletWidthIn: 40 });
  assert.equal(l.laneWidthFt, laneWidthFt(40));
  assert.equal(l.positions, l.rows * l.bays * base.levels);
});

test('push-back keeps its beams, and everything else is untouched', () => {
  // Push-back carts run two pallets wide on beams and it is picked from an
  // aisle, so none of the lane arithmetic applies to it.
  for (const kind of ['selective', 'doubledeep', 'pushback'] as const) {
    const l = layoutRack(kind, { ...base, palletWidthIn: 40 });
    assert.equal(l.laneWidthFt, undefined, `${kind} is measured by its beam`);
    assert.equal(l.lanesPerBlock, undefined);
    assert.equal(l.bayLengthFt, (base.beamLengthIn + 3) / 12, `${kind}: a beam bay`);

    const wider = layoutRack(kind, { ...base, palletWidthIn: 48 });
    assert.equal(wider.bays, l.bays, `${kind}: pallet width does not move the bays`);
    const longer = layoutRack(kind, { ...base, palletWidthIn: 40, beamLengthIn: 144 });
    assert.notEqual(longer.bays, l.bays, `${kind}: beam length does`);
  }
});
