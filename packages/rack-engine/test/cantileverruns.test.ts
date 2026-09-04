import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANTILEVER_ARM_PITCH_IN, CANTILEVER_BASE_HEIGHT_IN, CANTILEVER_BRACE_PITCH_FT,
  CANTILEVER_TOP_ALLOWANCE_IN, CANTILEVER_TOP_CLEARANCE_IN, CANTILEVER_TOP_MATERIAL_IN,
  cantileverTowerHeightIn,
  CANTILEVER_MAX_CENTRES_FT, CANTILEVER_MAX_OVERHANG_FT,
  CANTILEVER_PRODUCT_FT, CANTILEVER_RUN_GAP_FT, LONG_HEAD_CLEARANCE_IN,
  crossAisleSpans, cantileverBom, cantileverChecks, cantileverLevels, ftIn, layoutCantileverRuns,
  normaliseProductLengthFt, solveRows, towerSpacing, towersForRun, usableTowerHeightIn,
  type CantileverRunInput,
} from '../src/index.js';

const base: CantileverRunInput = {
  buildingLengthFt: 240, buildingWidthFt: 120, clearHeightFt: 24,
  aisleWidthFt: 12, wallClearanceFt: 2.5, orientation: 'length',
  productLengthFt: 20, armLengthIn: 48,
};
const at = (o: Partial<CantileverRunInput>) => layoutCantileverRuns({ ...base, ...o });

/* ── spacing is derived, not entered ───────────────────────────────────── */

test('the worked table: every product gets the towers and spacing it should', () => {
  const table = [
    { product: 4, towers: 2, centres: 4, span: 4, over: 0 },
    { product: 8, towers: 2, centres: 6, span: 6, over: 1 },
    { product: 12, towers: 2, centres: 6, span: 6, over: 3 },
    { product: 16, towers: 3, centres: 6, span: 12, over: 2 },
    { product: 20, towers: 4, centres: 6, span: 18, over: 1 },
    { product: 24, towers: 4, centres: 6, span: 18, over: 3 },
  ];
  for (const c of table) {
    const s = towerSpacing(c.product);
    assert.equal(s.towersPerRun, c.towers, `${c.product} ft towers`);
    assert.equal(s.towerCentresFt, c.centres, `${c.product} ft centres`);
    assert.equal(s.spanFt, c.span, `${c.product} ft span`);
    assert.equal(s.overhangFt, c.over, `${c.product} ft overhang`);

    // the layout reports exactly what the derivation says
    const l = at({ productLengthFt: c.product });
    assert.equal(l.towersPerRun, c.towers);
    assert.equal(l.towerCentresFt, c.centres);
    assert.equal(l.spanFt, c.span);
    assert.equal(l.overhangFt, c.over);
  }
});

test('three towers at 6 ft centres would leave 4 ft hanging — the fourth fixes it', () => {
  // the case that drove the rule: 3 towers span 12 ft of a 20 ft piece
  assert.equal((3 - 1) * 6, 12);
  assert.equal((20 - 12) / 2, 4, 'four feet unsupported at each end');

  const l = at({ productLengthFt: 20 });
  assert.equal(l.towersPerRun, 4);
  assert.equal(l.overhangFt, 1);
});

test('centres never exceed the ceiling that gets built, for any product', () => {
  for (let productLengthFt = 4; productLengthFt <= 60; productLengthFt += 0.5) {
    const l = at({ productLengthFt });
    assert.ok(l.towerCentresFt <= CANTILEVER_MAX_CENTRES_FT + 1e-9,
      `${productLengthFt} ft pitched at ${l.towerCentresFt} ft`);
    assert.ok(l.towerCentresFt > 0, `${productLengthFt} ft has a positive pitch`);
  }
});

test('the overhang never exceeds the cap and never goes negative', () => {
  for (let productLengthFt = 4; productLengthFt <= 60; productLengthFt += 0.5) {
    const l = at({ productLengthFt });
    assert.ok(l.overhangFt <= CANTILEVER_MAX_OVERHANG_FT + 1e-9,
      `${productLengthFt} ft overhangs ${l.overhangFt} ft`);
    assert.ok(l.overhangFt >= -1e-9, `${productLengthFt} ft overhangs ${l.overhangFt} ft`);
  }
});

test('the span is the towers times the derived centres, and never longer than the product', () => {
  for (let productLengthFt = 4; productLengthFt <= 60; productLengthFt += 0.5) {
    const l = at({ productLengthFt });
    assert.ok(Math.abs(l.spanFt - (l.towersPerRun - 1) * l.towerCentresFt) < 1e-9);
    assert.ok(l.spanFt <= l.productLengthFt + 1e-9,
      `${productLengthFt} ft spans ${l.spanFt} ft`);
  }
});

test('towers never fall below two', () => {
  for (const productLengthFt of [0, 1, 2, 4, 6, 8, 12]) {
    assert.ok(towersForRun(productLengthFt) >= 2, `${productLengthFt} ft`);
  }
  assert.equal(at({ productLengthFt: 4 }).towersPerRun, 2);
});

/* ── a half-edited field cannot reach the arithmetic ───────────────────── */

test('zero, blank and non-numeric product all fall back rather than computing with NaN', () => {
  assert.equal(normaliseProductLengthFt(Number.NaN), CANTILEVER_PRODUCT_FT.fallback);
  assert.equal(normaliseProductLengthFt(Number.POSITIVE_INFINITY), CANTILEVER_PRODUCT_FT.fallback);
  assert.equal(normaliseProductLengthFt(0), CANTILEVER_PRODUCT_FT.min, 'zero clamps up to the minimum');
  assert.equal(normaliseProductLengthFt(-40), CANTILEVER_PRODUCT_FT.min);
  assert.equal(normaliseProductLengthFt(500), CANTILEVER_PRODUCT_FT.max);
  assert.equal(normaliseProductLengthFt(20), 20, 'a sane value passes through');
});

test('a layout built from a blank field still draws something buildable', () => {
  const l = at({ productLengthFt: Number.NaN });
  assert.equal(l.productLengthFt, CANTILEVER_PRODUCT_FT.fallback);
  assert.ok(l.towersPerRun >= 2 && l.spanFt > 0 && l.towerCentresFt > 0);
  assert.ok(Number.isFinite(l.overhangFt) && Number.isFinite(l.linearFt));
  assert.equal(at({ productLengthFt: 0 }).productLengthFt, CANTILEVER_PRODUCT_FT.min);
});

test('a run occupies the product, because the ends hang past the towers', () => {
  const l = at({ productLengthFt: 20 });
  assert.equal(l.runLengthFt, 20, 'the run is the product, not the 18 ft span');

  assert.equal(l.runGapFt, CANTILEVER_RUN_GAP_FT);

  // The runs are laid into the building's segments, so what has to fit is each
  // segment — not the row as one block. Nothing straddles an aisle.
  const spans = crossAisleSpans(l.usableAlongFt, l.crossAisles);
  assert.equal(spans.atFt.length, l.crossAisles);
  for (const seg of spans.segments) {
    const inSeg = l.runStartsFt.filter(
      (x) => x >= seg.startFt - 1e-6 && x < seg.startFt + seg.lengthFt);
    const used = inSeg.length * l.runLengthFt + Math.max(0, inSeg.length - 1) * l.runGapFt;
    assert.ok(used <= seg.lengthFt + 1e-6,
      `${inSeg.length} runs use ${used.toFixed(1)} of a ${seg.lengthFt.toFixed(1)} ft segment`);
    assert.ok(used + l.runLengthFt + l.runGapFt > seg.lengthFt,
      'and one more would not fit in it');
  }
  assert.equal(l.runStartsFt.length, l.runsPerRow, 'the count is what was laid down');
});

/* ── sides follow position ─────────────────────────────────────────────── */

test('wall rows are single-sided and interior rows double-sided', () => {
  const l = at({});
  assert.ok(l.rows >= 3, 'this building holds both kinds');
  assert.equal(l.rowSides[0], 1, 'the first row is against a wall');
  assert.equal(l.rowSides[l.rows - 1], 1, 'and so is the last');
  for (let i = 1; i < l.rows - 1; i++) {
    assert.equal(l.rowSides[i], 2, `interior row ${i} is armed both ways`);
  }
  assert.equal(l.wallRows, 2);
  assert.equal(l.interiorRows, l.rows - 2);
  assert.equal(l.rowSides.length, l.rows);
});

test('a wall row is half the depth of an interior row', () => {
  const l = at({ armLengthIn: 48 });
  assert.equal(l.singleDepthFt, (48 + 6) / 12);
  assert.equal(l.doubleDepthFt, (48 * 2 + 6) / 12);
  assert.ok(l.doubleDepthFt > l.singleDepthFt);
});

test('linear feet sums per row rather than using one global sides value', () => {
  const l = at({});
  const shelfPerRow = l.runsPerRow * l.productLengthFt * l.storageLevels;
  const summed = l.rowSides.reduce((s, sides) => s + shelfPerRow * sides, 0);
  assert.equal(l.linearFt, Math.round(summed));

  // treating every row as double would overstate it by the two wall rows
  const asIfAllDouble = shelfPerRow * l.rows * 2;
  assert.ok(l.linearFt < asIfAllDouble, 'the wall rows are not billed for two faces');
  assert.equal(Math.round(asIfAllDouble - summed), Math.round(shelfPerRow * 2));
});

test('a run holds the product on it, not the span between its end towers', () => {
  // The material overhangs the end towers by a foot at each end and that stock
  // is stored the same as the rest. Span is where the towers go — a drawing
  // figure, and the one the bill counts towers from — never a capacity figure.
  const l = at({});
  const faces = l.rowSides.reduce((s, x) => s + x, 0);
  assert.equal(l.linearFt,
    Math.round(l.runsPerRow * l.productLengthFt * l.storageLevels * faces));

  assert.ok(l.productLengthFt > l.spanFt, 'this case really does overhang');
  const bySpan = Math.round(l.runsPerRow * l.spanFt * l.storageLevels * faces);
  assert.ok(l.linearFt > bySpan,
    `${l.linearFt} ft on the product against ${bySpan} ft on the span`);

  // a wider product on the same centres leaves more hanging, and it all counts
  const wide = at({ productLengthFt: 24 });
  assert.equal(wide.towerCentresFt, 6, 'six foot centres');
  assert.equal(wide.spanFt, 18, 'four towers span eighteen feet');
  const wideFaces = wide.rowSides.reduce((s, x) => s + x, 0);
  assert.equal(wide.linearFt,
    Math.round(wide.runsPerRow * 24 * wide.storageLevels * wideFaces),
    'a 24 ft product counts 24 ft a run-side, not the 18 ft it spans');
});

test('the four-run, seven-face, twenty-foot case comes to 3,920 ft', () => {
  // The live case the undercount was found in: 4 runs a row, 4 towers a run at
  // 6 ft centres — 18 ft of span under 20 ft of product — 7 storage levels,
  // and 4 rows armed as one single and three doubles.
  const runsPerRow = 4, product = 20, storageLevels = 7, faces = 7;
  assert.equal(runsPerRow * product * storageLevels * faces, 3920);
  assert.equal(runsPerRow * 18 * storageLevels * faces, 3528, 'what the span gave');
});

test('the span still decides where the towers go, and what the bill counts', () => {
  const before = { towersPerRun: 4, spanFt: 18, towerCentresFt: 6 };
  const l = at({ productLengthFt: 20 });
  assert.equal(l.towersPerRun, before.towersPerRun);
  assert.equal(l.spanFt, before.spanFt);
  assert.equal(l.towerCentresFt, before.towerCentresFt);

  const bom = cantileverBom(l);
  const q = (item: string) => bom.lines.find((x) => x.item === item)!.qty;
  const towersPerRow = l.runsPerRow * l.towersPerRun;
  assert.equal(q('Tower'), l.rows * towersPerRow, 'towers come off the span, not the capacity');
  assert.equal(q('X-brace set'),
    l.rows * l.runsPerRow * (l.towersPerRun - 1) * l.braceSetsPerBay,
    'and so do the braces, which span between towers');
});

test('the base is a storage level — product rests on it, not only on the arms', () => {
  for (const levels of [1, 3, 10]) {
    assert.equal(at({ levels }).storageLevels, levels + 1, `${levels} arm levels`);
  }
});

test('counting the base lifts capacity by exactly one level', () => {
  const l = at({});
  const perLevel = l.runsPerRow * l.productLengthFt;
  const armsOnly = l.rowSides.reduce((s, sides) => s + perLevel * l.levels * sides, 0);
  assert.equal(l.linearFt, Math.round(armsOnly + l.rowSides.reduce(
    (s, sides) => s + perLevel * sides, 0)), 'one level of shelf more than the arms alone');
  assert.ok(l.linearFt > armsOnly, `${l.linearFt} ft counted vs ${armsOnly} ft off the arms alone`);
});

test('the base fix leaves the towers, arms and bracing where they were', () => {
  const l = at({});
  const bom = cantileverBom(l);
  const q = (item: string) => bom.lines.find((x) => x.item === item)!.qty;
  const towersPerRow = l.runsPerRow * l.towersPerRun;

  assert.equal(q('Tower'), l.rows * towersPerRow, 'towers are per row, not per face');
  assert.equal(q('Arm'), l.rowSides.reduce((s, sides) => s + towersPerRow * l.levels * sides, 0),
    'arms still count arm levels, not storage levels');
  assert.equal(q('X-brace set'),
    l.rows * l.runsPerRow * (l.towersPerRun - 1) * l.braceSetsPerBay);
  assert.equal(q('Anchor bolt'), q('Tower') * 2, 'anchors follow the tower, not the base count');
});

/* ── bracing ───────────────────────────────────────────────────────────── */

test('brace sets step with tower height at the standard pitch', () => {
  const tall = at({ clearHeightFt: 32 });
  const short = at({ clearHeightFt: 16 });
  assert.ok(tall.braceSetsPerBay > short.braceSetsPerBay,
    `${tall.braceSetsPerBay} sets at 32 ft clear vs ${short.braceSetsPerBay} at 16 ft`);

  for (const levels of [1, 3, 6, 10]) {
    const l = at({ levels });
    assert.equal(l.braceSetsPerBay,
      Math.max(1, Math.ceil(l.towerHeightIn / 12 / CANTILEVER_BRACE_PITCH_FT)));
    assert.ok(l.braceSetsPerBay >= 1, 'a bay is never left unbraced');
  }
});

/* ── bill of materials ─────────────────────────────────────────────────── */

test('arm count matches towers by levels by the per-row sides', () => {
  for (const armLengthIn of [36, 72]) {
    for (const levels of [1, 4]) {
      const l = at({ armLengthIn, levels });
      const bom = cantileverBom(l);
      const towers = bom.lines.find((x) => x.item === 'Tower')!.qty;
      const arms = bom.lines.find((x) => x.item === 'Arm')!.qty;

      assert.equal(towers, l.rows * l.runsPerRow * l.towersPerRun);
      const towersPerRow = l.runsPerRow * l.towersPerRun;
      const expected = l.rowSides.reduce((s, sides) => s + towersPerRow * levels * sides, 0);
      assert.equal(arms, expected);
      assert.ok(arms < towers * levels * 2, 'wall rows carry one face, not two');
    }
  }
});

test('a wall row takes one base per tower and an interior row two', () => {
  const l = at({});
  const towersPerRow = l.runsPerRow * l.towersPerRun;
  assert.ok(l.wallRows > 0 && l.interiorRows > 0, 'this building holds both kinds');

  const expected = l.wallRows * towersPerRow + l.interiorRows * towersPerRow * 2;
  assert.equal(l.bases, expected, 'a double-sided tower is based on both faces');
  assert.equal(cantileverBom(l).lines.find((x) => x.item === 'Base')!.qty, expected);

  const towers = l.rows * towersPerRow;
  assert.ok(l.bases > towers, `${l.bases} bases under ${towers} towers`);
  assert.equal(l.bases, l.rowSides.reduce((s, sides) => s + towersPerRow * sides, 0));
});

test('a building of wall rows only takes one base per tower', () => {
  // narrow enough that no interior row fits, so every tower is single-sided
  const l = at({ buildingWidthFt: 22, armLengthIn: 48, aisleWidthFt: 12 });
  assert.equal(l.interiorRows, 0, 'no interior row fits across 22 ft');
  assert.equal(l.bases, l.rows * l.runsPerRow * l.towersPerRun);
});

test('anchors, braces and ties follow the towers', () => {
  const l = at({});
  const bom = cantileverBom(l);
  const towers = bom.lines.find((x) => x.item === 'Tower')!.qty;
  assert.equal(bom.lines.find((x) => x.item === 'Anchor bolt')!.qty, towers * 2);

  const braceSets = l.rows * l.runsPerRow * (l.towersPerRun - 1) * l.braceSetsPerBay;
  assert.equal(bom.lines.find((x) => x.item === 'X-brace set')!.qty, braceSets);
  assert.equal(bom.lines.find((x) => x.item === 'Horizontal tie')!.qty, braceSets);

  assert.equal(bom.lines.find((x) => x.item === 'Base')!.description.includes(`${l.armLengthIn} in`), true,
    'the base is listed at the arm dimension');
});

test('the brace lines quote the span they have to reach', () => {
  const l = at({ productLengthFt: 20 });
  const bom = cantileverBom(l);
  const want = ftIn(l.towerCentresFt);
  assert.equal(want, '6\'-0"');
  for (const item of ['X-brace set', 'Horizontal tie']) {
    const desc = bom.lines.find((x) => x.item === item)!.description;
    assert.ok(desc.includes(want), `${item} description names the span: ${desc}`);
  }
});

test('feet and inches read the way a drawing states them', () => {
  assert.equal(ftIn(6), '6\'-0"');
  assert.equal(ftIn(4), '4\'-0"');
  assert.equal(ftIn(5.5), '5\'-6"');
  assert.equal(ftIn(4.25), '4\'-3"');
  assert.equal(ftIn(3.999), '4\'-0"', 'a hair under a foot reads 4 ft, not 3 ft 12 in');
});

test('the base always matches the arm — it is a stability figure, not a choice', () => {
  for (const armLengthIn of [36, 48, 60, 72]) {
    assert.equal(at({ armLengthIn }).baseLengthIn, armLengthIn);
  }
});

test('short material landing on two towers raises a check', () => {
  const short = { ...base, productLengthFt: 10 };
  const flags = cantileverChecks(short, layoutCantileverRuns(short));
  const check = flags.find((f) => f.category === 'support');
  assert.ok(check, 'a support check is raised');
  assert.equal(check!.severity, 'check');
  assert.ok(/10 ft/.test(check!.detail), 'the check names the product length');

  const long = { ...base, productLengthFt: 20 };
  assert.equal(
    cantileverChecks(long, layoutCantileverRuns(long)).some((f) => f.category === 'support'),
    false);
});

test('levels come from the clear height and can be overridden', () => {
  // the base stands under the first arm, so it comes off the budget first
  assert.equal(cantileverLevels(24), Math.floor((24 * 12 - 24 - CANTILEVER_BASE_HEIGHT_IN) / 24));
  assert.equal(at({}).levels, cantileverLevels(base.clearHeightFt));
  assert.equal(at({ levels: 2 }).levels, 2);
});

test('arm spacing is asked for, and drives the levels and the tower', () => {
  assert.equal(at({}).armPitchIn, CANTILEVER_ARM_PITCH_IN, 'the standard pitch is the default');
  for (const armSpacingIn of [18, 24, 30, 36, 48]) {
    const l = at({ armSpacingIn });
    assert.equal(l.armPitchIn, armSpacingIn);
    assert.equal(l.towerHeightIn, cantileverTowerHeightIn(l.levels, armSpacingIn),
      `tower at ${armSpacingIn} in`);
  }
  // tighter spacing fits more levels under the same roof
  assert.ok(cantileverLevels(24, 18) > cantileverLevels(24, 36));
});

test('levels times spacing over the usable height is blocking, not a check', () => {
  const usable = usableTowerHeightIn(24);
  assert.equal(usable, 24 * 12 - LONG_HEAD_CLEARANCE_IN);

  const tooMany = { ...base, clearHeightFt: 24, armSpacingIn: 36, levels: 12 };
  const l = layoutCantileverRuns(tooMany);
  assert.equal(l.towerHeightIn,
    CANTILEVER_BASE_HEIGHT_IN + 12 * 36 + CANTILEVER_TOP_ALLOWANCE_IN,
    'nothing is silently clamped');
  assert.equal(l.levels, 12, 'the levels asked for survive into the layout');
  assert.ok(l.towerHeightIn > l.usableHeightIn);

  const flag = cantileverChecks(tooMany, l).find((f) => f.category === 'height');
  assert.ok(flag, 'a height flag is raised');
  assert.equal(flag!.severity, 'blocking', 'it blocks rather than warns');
  assert.ok(flag!.detail.includes(String(l.towerHeightIn - l.usableHeightIn)),
    `the flag names how far over it runs: ${flag!.detail}`);
  assert.ok(flag!.detail.includes(String(cantileverLevels(24, 36))),
    'and what the clear height does allow');
});

test('the column carries past the top arm, by a load height plus clearance', () => {
  assert.equal(CANTILEVER_TOP_ALLOWANCE_IN,
    CANTILEVER_TOP_MATERIAL_IN + CANTILEVER_TOP_CLEARANCE_IN);
  assert.equal(CANTILEVER_TOP_MATERIAL_IN, 12, 'a load height on the top arm');

  for (const armSpacingIn of [18, 24, 36, 48]) {
    for (const levels of [1, 4, 9]) {
      const l = at({ armSpacingIn, levels });
      assert.equal(l.topAllowanceIn, CANTILEVER_TOP_ALLOWANCE_IN);
      assert.equal(l.towerHeightIn,
        l.baseHeightIn + levels * armSpacingIn + l.topAllowanceIn,
        `${levels} at ${armSpacingIn} in`);

      // the top arm is a whole allowance below the top of the column
      const topArmIn = l.baseHeightIn + levels * armSpacingIn;
      assert.equal(l.towerHeightIn - topArmIn, l.topAllowanceIn,
        'bare column above the top arm');
      assert.ok(l.towerHeightIn > topArmIn, 'no arm is flush with the top');
    }
  }
});

test('the allowance is counted against the clear height, not ignored', () => {
  // a tower that fits only if the load on its top arm is forgotten must not fit
  const spacing = 24;
  const fits = cantileverLevels(24, spacing);
  const usable = usableTowerHeightIn(24);

  assert.ok(cantileverTowerHeightIn(fits, spacing) <= usable, `${fits} levels fit`);
  assert.ok(cantileverTowerHeightIn(fits + 1, spacing) > usable, 'and one more does not');

  const ignoringTop = Math.floor(
    (usable - CANTILEVER_BASE_HEIGHT_IN) / spacing);
  assert.ok(fits <= ignoringTop,
    `${fits} levels allowed, against ${ignoringTop} if the top load were ignored`);

  const over = { ...base, clearHeightFt: 24, armSpacingIn: spacing, levels: fits + 1 };
  const flag = cantileverChecks(over, layoutCantileverRuns(over))
    .find((f) => f.category === 'height');
  assert.ok(flag, 'the extra level is blocked');
  assert.equal(flag!.severity, 'blocking');
  assert.ok(/tower runs [0-9]+ in over/.test(flag!.detail),
    `the flag reports the tower, not the arms: ${flag!.detail}`);
  assert.ok(flag!.detail.includes(String(CANTILEVER_TOP_ALLOWANCE_IN)),
    'and names the allowance it is carrying');
});

test('a combination that fits raises no height flag', () => {
  for (const armSpacingIn of [18, 24, 30, 36, 48]) {
    const fits = { ...base, clearHeightFt: 24, armSpacingIn,
      levels: cantileverLevels(24, armSpacingIn) };
    const l = layoutCantileverRuns(fits);
    assert.ok(l.towerHeightIn <= l.usableHeightIn,
      `${l.levels} levels at ${armSpacingIn} in needs ${l.towerHeightIn} of ${l.usableHeightIn} in`);
    assert.equal(cantileverChecks(fits, l).some((f) => f.category === 'height'), false);
  }
});

test('bom weight is the sum of its lines', () => {
  const bom = cantileverBom(at({}));
  const sum = bom.lines.reduce((s, l) => s + l.totalWeightLb, 0);
  assert.ok(Math.abs(sum - bom.totalWeightLb) < 1e-6);
  assert.ok(bom.truckloads >= 1);
  for (const l of bom.lines) assert.ok(l.description.length > 0, `${l.item} has a description`);
});

/* ── rows follow the stock, not the building ───────────────────────────── */

test('rows are added one at a time until the stock is housed', () => {
  const full = at({});
  const perRow = full.runsPerRow * full.productLengthFt * full.storageLevels;

  // the row against the wall is armed one way, the rest both, so capacity does
  // not accumulate evenly — asking for one row's worth must not buy two
  const one = at({ linearFeetNeededFt: perRow });
  assert.equal(one.rows, 1, `${perRow} ft is one wall row`);
  assert.equal(one.rowSides[0], 1);
  assert.ok(one.linearFt >= perRow);
  assert.equal(one.runsInLastRow, one.runsPerRow, 'and that row is full');

  const two = at({ linearFeetNeededFt: perRow + 1 });
  assert.equal(two.rows, 2, 'a foot more needs a second row');
  assert.deepEqual([...two.rowSides], [1, 2], 'and that row is armed both ways');
  // one more foot buys one more run, not a whole second row
  assert.equal(two.runsInLastRow, 1, 'the second row carries a single run');
  assert.equal(two.lastRowPartial, true);
  assert.ok(two.linearFt < perRow * 3, `${two.linearFt} ft, not the ${perRow * 3} a full row gives`);

  // enough to want every row, and the far row goes back to being a wall row
  const all = at({ linearFeetNeededFt: full.maxLinearFt });
  assert.equal(all.rows, full.rows);
  assert.deepEqual([...all.rowSides], [...full.rowSides]);
  assert.equal(all.linearFt, full.maxLinearFt);
  assert.equal(all.lastRowPartial, false, 'and nothing is part-filled');
});

test('the last row carries what is left and stops', () => {
  const full = at({});
  const perRun = full.linearFt / (full.runsPerRow * full.rowSides
    .reduce((s, x) => s + x, 0) / full.rowSides.length) / full.rows;

  for (const needed of [400, 900, 1500, 3000]) {
    const l = at({ linearFeetNeededFt: needed });
    assert.ok(l.linearFt >= needed, `${needed} ft asked, ${l.linearFt} ft built`);
    assert.ok(l.runsInLastRow >= 1 && l.runsInLastRow <= l.runsPerRow,
      `${l.runsInLastRow} of ${l.runsPerRow} runs in the last row`);
    assert.equal(l.lastRowPartial, l.runsInLastRow < l.runsPerRow);

    // and never more than one row's worth of overshoot
    const lastSides = l.rowSides[l.rows - 1]!;
    const perRunFt = l.productLengthFt * l.storageLevels * lastSides;
    assert.ok(l.linearFt - needed < perRunFt + 1,
      `${(l.linearFt - needed).toFixed(0)} ft over, less than the ${perRunFt} ft a run adds`);
  }
  assert.ok(perRun > 0);
});

test('asking for less leaves the rest of the building alone', () => {
  const small = at({ linearFeetNeededFt: 500 });
  const full = at({});
  assert.ok(small.rows < full.rows, `${small.rows} rows against ${full.rows} filling it`);
  assert.ok(small.usedFt < full.usedFt, 'and it takes less width');
  assert.ok(small.spareFt > full.spareFt, 'leaving more of the floor');
  assert.ok(small.linearFt >= 500, `${small.linearFt} ft covers the 500 asked for`);
  assert.equal(small.short, false);
});

test('a request the building cannot meet blocks, and says what it does hold', () => {
  const full = at({});
  const tooMuch = { ...base, linearFeetNeededFt: full.maxLinearFt + 1000 };
  const l = layoutCantileverRuns(tooMuch);
  assert.equal(l.short, true);
  assert.equal(l.rows, full.rows, 'every row it can hold is still laid out');
  assert.equal(l.maxLinearFt, full.maxLinearFt);

  const flag = cantileverChecks(tooMuch, l).find((f) => f.category === 'capacity');
  assert.ok(flag, 'a capacity flag is raised');
  assert.equal(flag!.severity, 'blocking');
  assert.ok(flag!.detail.includes(full.maxLinearFt.toLocaleString()), 'naming what it holds');
  assert.ok(flag!.detail.includes((full.maxLinearFt + 1000).toLocaleString()), 'and what was asked');

  assert.equal(cantileverChecks(base, full).some((f) => f.category === 'capacity'), false,
    'filling the building asks for nothing, so nothing is short');
});

/* ── the building takes its share before the racking does ──────────────── */

test('availability and cross aisles apply to long goods too', () => {
  const whole = at({});
  const most = at({ available: { mode: 'fraction', fraction: 0.75 } });
  assert.ok(most.usableAlongFt < whole.usableAlongFt, 'the envelope shrank');
  assert.ok(most.linearFt < whole.linearFt, `${most.linearFt} ft against ${whole.linearFt}`);
  assert.ok(most.unavailableAlongFt > 0);

  assert.equal(whole.crossAisles, Math.ceil(whole.usableAlongFt / 100) - 1);
  assert.ok(whole.crossAisles > 0, 'a 240 ft building breaks its runs');
  assert.equal(whole.crossAisleAtFt.length, whole.crossAisles);
  assert.equal(whole.crossAisleWidthFt, 10);

  const none = layoutCantileverRuns({ ...base, crossAisles: 0 });
  assert.ok(none.runsPerRow >= whole.runsPerRow, 'no cross aisle leaves more run');
  assert.ok(none.linearFt >= whole.linearFt);
});

/* ── the row solver: doubles earn their width, singles are a last resort ── */

const rows = (o: Partial<Parameters<typeof solveRows>[0]> = {}) => solveRows({
  neededFt: Number.POSITIVE_INFINITY, widthFt: 115,
  singleDepthFt: 4.5, doubleDepthFt: 8.5, aisleFt: 12.5,
  capacityPerRun: 234, runsPerRow: 9, ...o,
});

test('a double-sided row is preferred wherever one fits', () => {
  const full = rows();
  // one wall row, then doubles, and a single only where a double will not fit
  assert.equal(full.rowSides[0], 1, 'the wall row comes first');
  const middle = full.rowSides.slice(1, -1);
  assert.ok(middle.every((s) => s === 2), `everything between is double: ${full.rowSides.join(',')}`);
  assert.ok(full.rowSides.filter((s) => s === 1).length <= 2, 'at most two singles, one per wall');

  // and the last single is only there because 14 ft is short of a double's 21
  const pitchDouble = 8.5 + 12.5;
  const usedByOthers = full.rowSides.slice(0, -1)
    .reduce((w, s) => w + (s === 2 ? 8.5 : 4.5) + 12.5, 0);
  if (full.rowSides[full.rowSides.length - 1] === 1 && full.rowSides.length > 1) {
    assert.ok(115 - usedByOthers < pitchDouble,
      `${(115 - usedByOthers).toFixed(1)} ft left, less than the ${pitchDouble} a double needs`);
  }
});

test('a single is never placed while the width could still take a double', () => {
  for (const widthFt of [20, 25, 40, 60, 80, 115, 200]) {
    const r = rows({ widthFt });
    let left = widthFt;
    r.rowSides.forEach((s, i) => {
      const last = i === r.rowSides.length - 1;
      if (s === 1 && i > 0) {
        assert.ok(left < 8.5 + 12.5,
          `${widthFt} ft: a single at row ${i} with ${left.toFixed(1)} ft left`);
      }
      left -= (s === 2 ? 8.5 : 4.5) + (last ? 0 : 12.5);
    });
  }
});

test('a row whose capacity nothing asked for is never returned', () => {
  for (const neededFt of [1, 100, 234, 500, 1000, 2106, 2107, 5000]) {
    const r = rows({ neededFt });
    assert.ok(r.builtFt >= neededFt, `${neededFt} ft asked, ${r.builtFt} built`);

    // drop the last row and the demand is no longer met — so none is spare
    const without = r.rowSides.slice(0, -1)
      .reduce((ft, s) => ft + 234 * 9 * s, 0);
    assert.ok(without < neededFt,
      `${neededFt} ft: ${r.rowSides.length} rows, and ${r.rowSides.length - 1} would not do`);
  }
});

test('the last row carries only the runs the remainder calls for', () => {
  const r = rows({ neededFt: 1000 });
  assert.ok(r.runsInLastRow < 9, `${r.runsInLastRow} of 9 runs`);
  assert.equal(r.runsInLastRow, Math.ceil(1000 / (234 * r.rowSides[r.rowSides.length - 1]!)));
  assert.equal(r.builtFt, 234 * r.runsInLastRow * r.rowSides[0]!);

  // 40 ft of demand still earns a row, but that row builds one run
  assert.equal(rows({ neededFt: 40 }).runsInLastRow, 1);
  assert.equal(rows({ neededFt: 40 }).rowSides.length, 1);
});

test('a demand past the building width is reported short, not quietly trimmed', () => {
  const r = rows({ neededFt: 99999 });
  assert.ok(r.shortFt > 0, `${r.shortFt.toFixed(0)} ft could not be housed`);
  assert.ok(r.builtFt > 0 && r.builtFt < 99999);
  assert.equal(rows({ neededFt: r.builtFt }).shortFt, 0, 'and what does fit is not short');
});

test('spare width does not buy a row nobody asked for', () => {
  const narrow = rows({ neededFt: 1000, widthFt: 115 });
  const wide = rows({ neededFt: 1000, widthFt: 400 });
  assert.equal(wide.rowSides.length, narrow.rowSides.length,
    `${wide.rowSides.length} rows in a wide building, ${narrow.rowSides.length} in a narrow one`);
  assert.equal(wide.builtFt, narrow.builtFt);
});
