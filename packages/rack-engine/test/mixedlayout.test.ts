import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANTILEVER_AISLE_MIN_FT, MIXED_CANT_ROWS,
  cantileverBom, layoutMixed, layoutRack, mixedAisles, mixedBom, mixedChecks,
  mixedStripInput, palletBomIsCountable,
  type MixedInput,
} from '../src/index.js';

const base: MixedInput = {
  buildingLengthFt: 240, buildingWidthFt: 120, clearHeightFt: 28,
  wallClearanceFt: 2.5, orientation: 'length',
  cantilever: { linearFeetNeededFt: 2000, productLengthFt: 20, armLengthIn: 48 },
  pallet: {
    kind: 'selective', beamLengthIn: 96, palletsPerBay: 2, levels: 5,
    frameDepthIn: 42, aisleWidthFt: 12.5,
  },
};
const at = (o: Partial<MixedInput>) => layoutMixed({ ...base, ...o });
/**
 * The strip takes the rows its stock needs, and part-fills the last one, so a
 * row count is asked for by handing it a little more than the rows below hold.
 */
const withRows = (rows: number) => {
  const full = at({ cantilever: { ...base.cantilever, linearFeetNeededFt: 999999 } }).strip;
  const perRun = full.linearFt / (full.runsPerRow * (full.wallRows + full.interiorRows * 2));
  let feet = 1;
  for (let i = 1; i < rows; i++) {
    feet += full.runsPerRow * perRun * (i === 1 ? 1 : 2);
  }
  return at({ cantilever: { ...base.cantilever, linearFeetNeededFt: Math.ceil(feet) } });
};

/* ── the strip costs the pallet racking width ──────────────────────────── */

test('pallet capacity with a strip is lower than without, by the strip width', () => {
  const l = at({});
  assert.ok(l.pallets.positions < l.palletsAlone.positions,
    `${l.pallets.positions} with the strip vs ${l.palletsAlone.positions} without`);
  assert.ok(l.pallets.acrossFt < l.palletsAlone.acrossFt);
  assert.ok(Math.abs((l.palletsAlone.acrossFt - l.pallets.acrossFt) - l.stripTotalDepthFt) < 1e-9,
    'the width lost is exactly the strip plus its shared aisle');
  assert.equal(Math.round(l.palletWidthFt * 1e6) / 1e6,
    Math.round(l.pallets.acrossFt * 1e6) / 1e6, 'and that is what the solver was given');
});

test('the reported cost is the difference between the two pallet runs', () => {
  for (const rows of [1, 2, 3, 4]) {
    const l = withRows(rows);
    assert.equal(l.positionsCost, l.palletsAlone.positions - l.pallets.positions,
      `${rows} cantilever rows`);
    assert.ok(l.positionsCost > 0, `${rows} rows costs ${l.positionsCost} positions`);
  }
});

test('adding a cantilever row costs pallet positions and buys linear feet', () => {
  let prev = withRows(1);
  for (const rows of [2, 3, 4]) {
    const l = withRows(rows);
    assert.ok(l.strip.linearFt > prev.strip.linearFt,
      `${rows} rows: ${l.strip.linearFt} ft of arm vs ${prev.strip.linearFt}`);
    assert.ok(l.pallets.positions <= prev.pallets.positions,
      `${rows} rows: ${l.pallets.positions} positions vs ${prev.pallets.positions}`);
    assert.ok(l.positionsCost >= prev.positionsCost, 'and the cost figure rises with it');
    prev = l;
  }
  assert.ok(withRows(4).pallets.positions < withRows(1).pallets.positions,
    'four rows cost more than one');
});

/* ── the shared aisle ──────────────────────────────────────────────────── */

test('the shared aisle is the larger of the two aisle figures', () => {
  for (const palletAisleFt of [8, 10, 12.5, 14, 16, 20]) {
    const { cantileverAisleFt, sharedAisleFt } = mixedAisles(palletAisleFt);
    assert.equal(sharedAisleFt, Math.max(palletAisleFt, cantileverAisleFt),
      `${palletAisleFt} ft pallet aisle`);
    assert.ok(sharedAisleFt >= palletAisleFt, 'never narrower than the pallet aisle');
    assert.ok(sharedAisleFt >= CANTILEVER_AISLE_MIN_FT,
      'never narrower than a truck on long stock needs');
  }
  // a wide pallet aisle wins on its own account
  assert.equal(mixedAisles(20).sharedAisleFt, 20);
  assert.equal(at({}).sharedAisleFt, CANTILEVER_AISLE_MIN_FT,
    'the 12.5 ft pallet aisle is widened for the long load');
});

test('the strip carries its own aisles and the shared one is counted once', () => {
  for (const rows of [1, 2, 3, 4]) {
    const l = withRows(rows);
    const internal = (rows - 1) * mixedAisles(base.pallet.aisleWidthFt).cantileverAisleFt;
    const racks = l.strip.singleDepthFt + (rows - 1) * l.strip.doubleDepthFt;
    assert.ok(Math.abs(l.stripDepthFt - (racks + internal)) < 1e-9,
      `${rows} rows: ${l.stripDepthFt} ft = ${racks} ft of rack + ${internal} ft of aisle`);
    assert.equal(l.stripTotalDepthFt, l.stripDepthFt + l.sharedAisleFt);
  }
});

/* ── sides follow position, in both zones ──────────────────────────────── */

test('the wall-hugging cantilever row is single-sided and further ones double', () => {
  for (const rows of [1, 2, 3, 4]) {
    const l = withRows(rows);
    assert.equal(l.strip.rows, rows, `${rows} rows asked for, ${l.strip.rows} laid out`);
    assert.equal(l.strip.rowSides[0], 1, 'the row against the wall is armed one way');
    for (let i = 1; i < rows; i++) {
      assert.equal(l.strip.rowSides[i], 2, `row ${i} is out on the floor, so both ways`);
    }
    assert.equal(l.strip.wallRows, 1, 'a strip has one wall, not two');
    assert.equal(l.strip.interiorRows, rows - 1);
  }
});

test('the pallet zone edge against the strip is not treated as a wall row', () => {
  const l = at({});
  assert.equal(l.pallets.wallRows, 1, 'one real wall bounds the pallet zone');
  assert.equal(l.palletsAlone.wallRows, 2, 'the same racking alone has two');

  // a wall forces a single row; an aisle takes a full back-to-back pair
  assert.equal((l.pallets.rows - l.pallets.wallRows) % 2, 0, 'the rest are pairs');
  const asIfWalled = layoutRack('selective', {
    buildingLengthFt: 240, buildingWidthFt: 120 - l.stripTotalDepthFt,
    beamLengthIn: 96, palletsPerBay: 2, levels: 5, frameDepthIn: 42,
    aisleWidthFt: 12.5, wallClearanceFt: 2.5, orientation: 'length',
  });
  assert.ok(l.pallets.rows >= asIfWalled.rows,
    `${l.pallets.rows} rows against the aisle vs ${asIfWalled.rows} if it were a wall`);
});

/* ── what does not fit ─────────────────────────────────────────────────── */

test('a building too narrow for both blocks rather than returning negative rows', () => {
  const narrow = { ...base, buildingWidthFt: 26 };
  const l = layoutMixed(narrow);
  assert.ok(l.pallets.rows >= 0, 'rows never go negative');
  assert.ok(l.pallets.positions >= 0, 'nor do positions');
  assert.equal(l.fits, false);

  const flag = mixedChecks(narrow, l).find((f) => f.severity === 'blocking');
  assert.ok(flag, 'a blocking flag is raised');
  assert.equal(flag!.category, 'layout');
  assert.ok(/too narrow/i.test(flag!.title));
  assert.ok(/cantilever row/.test(flag!.detail), 'and it says what to do');

  assert.equal(mixedChecks(base, at({})).some((f) => f.severity === 'blocking'), false,
    'a building that holds both raises none');
});

test('the strip takes the rows its stock needs, and no more than a strip can be', () => {
  const little = at({ cantilever: { ...base.cantilever, linearFeetNeededFt: 100 } });
  assert.equal(little.cantileverRows, 1, 'a hundred feet is one row');
  assert.ok(little.strip.linearFt >= 100);

  const lots = at({ cantilever: { ...base.cantilever, linearFeetNeededFt: 999999 } });
  assert.equal(lots.cantileverRows, MIXED_CANT_ROWS.max, 'a strip is four rows at most');
  assert.equal(lots.strip.short, true, 'and says so when that is not enough');

  assert.equal(mixedStripInput(base).stripRows, MIXED_CANT_ROWS.max,
    'the solver is offered every row a strip can be');
  assert.equal(mixedStripInput(base).linearFeetNeededFt, base.cantilever.linearFeetNeededFt);

  // less cantilever leaves more building for pallets — the trade this view shows
  assert.ok(little.pallets.positions > lots.pallets.positions,
    `${little.pallets.positions} positions against ${lots.pallets.positions}`);
});

/* ── orientation is shared, so it is a trade ───────────────────────────── */

test('an orientation that suits one family and not the other raises a check', () => {
  const flags = mixedChecks(base, at({}));
  const orient = flags.find((f) => f.category === 'orientation');
  if (orient) {
    assert.equal(orient.severity, 'check', 'a trade is a check, never blocking');
    assert.ok(/[0-9]/.test(orient.detail), 'it names the numbers on both sides');
    assert.ok(/pallet positions/.test(orient.detail) && /linear feet/.test(orient.detail));
  }
  // whichever way it falls, the two orientations are genuinely different
  const alongL = at({ orientation: 'length' });
  const acrossW = at({ orientation: 'width' });
  assert.ok(alongL.pallets.positions !== acrossW.pallets.positions
    || alongL.strip.linearFt !== acrossW.strip.linearFt,
    'the choice changes at least one family');
});

/* ── one bill, two sections ────────────────────────────────────────────── */

test('the bill files both families under their own heading and re-totals', () => {
  const l = at({});
  const cant = cantileverBom(l.strip);
  const pal = { lines: [{ group: 'Frames', item: 'Upright frame', description: 'x', qty: 10,
    unitWeightLb: 100, totalWeightLb: 1000 }], totalWeightLb: 1000, truckloads: 1 };

  const bom = mixedBom(cant, pal);
  const groups = [...new Set(bom.lines.map((x) => x.group))];
  assert.deepEqual(groups, ['Cantilever', 'Pallet racking']);
  assert.equal(bom.lines.length, cant.lines.length + 1);
  assert.ok(Math.abs(bom.totalWeightLb - (cant.totalWeightLb + 1000)) < 1e-6,
    'the total spans both families');
  assert.ok(bom.truckloads >= cant.truckloads, 'and so do the truckloads');

  // a type with no countable bill leaves its section out, keeping the strip's
  const alone = mixedBom(cant, null);
  assert.deepEqual([...new Set(alone.lines.map((x) => x.group))], ['Cantilever']);
  assert.equal(alone.lines.length, cant.lines.length);
  assert.equal(palletBomIsCountable('selective'), true);
  assert.equal(palletBomIsCountable('drivein'), false);
});
