import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canRecommendLong, compareLongTypes, layoutCantilever, longType, LONG_TYPES,
  rankLongTypes, scoreLongType,
  type CantileverLayoutInput, type LongAnswers, type LongKind,
} from '../src/index.js';

const building: CantileverLayoutInput = {
  buildingLengthFt: 240, buildingWidthFt: 120, clearHeightFt: 24,
  aisleWidthFt: 12, wallClearanceFt: 2.5, orientation: 'length',
};

const winner = (a: LongAnswers): LongKind => rankLongTypes(a)[0]!.type.kind;
const scoreOf = (a: LongAnswers, kind: LongKind) =>
  rankLongTypes(a).find((r) => r.type.kind === kind)!.score;

// ── the wizard ───────────────────────────────────────────────────────────

test('two answers are enough to recommend a long-goods system', () => {
  assert.equal(canRecommendLong({}), false);
  assert.equal(canRecommendLong({ pieceWeight: 'heavy' }), false);
  assert.equal(canRecommendLong({ pieceWeight: 'heavy', where: 'indoor' }), true);
  assert.equal(canRecommendLong({ pieceWeight: 'unknown', where: 'unknown' }), true,
    'not sure is still an answer');
});

test('stored outdoors, the winner is rated for it and roll-formed is ruled out', () => {
  for (const pieceWeight of ['light', 'medium', 'heavy', 'unknown'] as const) {
    const a: LongAnswers = { pieceWeight, where: 'outdoor' };
    assert.ok(longType(winner(a)).outdoor,
      `${pieceWeight} outdoors picked a system not rated for weather`);
    assert.ok(scoreOf(a, 'cantilever-rf') < 40,
      `${pieceWeight} outdoors left roll-formed reading as viable`);
  }
});

test('heavy indoor stock returns structural', () => {
  assert.equal(winner({ pieceWeight: 'heavy', where: 'indoor' }), 'cantilever-str');
  assert.equal(
    winner({ pieceWeight: 'heavy', where: 'indoor', pieceLength: 'long', placement: 'open' }),
    'cantilever-str',
  );
});

test('medium indoor stock on open floor returns roll-formed', () => {
  assert.equal(
    winner({ pieceWeight: 'medium', where: 'indoor', placement: 'open' }),
    'cantilever-rf',
  );
});

test('stock over 20 ft rules the vertical rack out', () => {
  for (const pieceWeight of ['light', 'medium', 'heavy'] as const) {
    const a: LongAnswers = { pieceWeight, where: 'indoor', pieceLength: 'xlong' };
    assert.ok(scoreOf(a, 'vertical') < 25,
      `${pieceWeight} 24 ft stock still read the vertical rack as an option`);
  }
});

test('short light stock returns the vertical rack', () => {
  assert.equal(
    winner({ pieceWeight: 'light', where: 'indoor', pieceLength: 'short' }),
    'vertical',
  );
});

test('a wall run returns a single-sided system, open floor a two-sided one', () => {
  const base: LongAnswers = { pieceWeight: 'medium', where: 'indoor' };
  assert.equal(longType(winner({ ...base, placement: 'wall' })).sides, 1);
  assert.equal(longType(winner({ ...base, placement: 'open' })).sides, 2);
});

test('no two systems ever show the same figure', () => {
  const answers: LongAnswers[] = [
    {},
    { pieceWeight: 'heavy', where: 'outdoor' },
    { pieceWeight: 'light', where: 'indoor', pieceLength: 'short', placement: 'wall' },
    { pieceWeight: 'medium', where: 'indoor', pieceLength: 'mid', placement: 'open' },
    { pieceWeight: 'unknown', where: 'unknown', pieceLength: 'unknown', placement: 'unknown' },
    { pieceWeight: 'heavy', where: 'outdoor', pieceLength: 'xlong', placement: 'open' },
  ];
  for (const a of answers) {
    const shown = rankLongTypes(a).map((r) => r.score);
    assert.equal(new Set(shown).size, shown.length,
      `two systems tied on ${JSON.stringify(a)}: ${shown.join(', ')}`);
    const sorted = [...shown].sort((x, y) => y - x);
    assert.deepEqual(shown, sorted, 'ranking must stay ordered after the step down');
  }
});

test('ranking uses the raw score, so a clamped ceiling cannot reorder it', () => {
  const a: LongAnswers = { pieceWeight: 'heavy', where: 'outdoor', pieceLength: 'xlong' };
  const ranked = rankLongTypes(a);
  const raws = ranked.map((r) => r.raw);
  assert.deepEqual(raws, [...raws].sort((x, y) => y - x));
  assert.ok(raws[0]! > 99, 'this answer set should exceed the display ceiling');
  assert.equal(ranked[0]!.score, 99, 'and still be shown clamped');
});

test('every system carries the copy the cards need', () => {
  for (const t of LONG_TYPES) {
    assert.ok(t.badge.length > 0, `${t.kind} has no badge`);
    assert.ok(t.blurb.length > 0, `${t.kind} has no blurb`);
    assert.ok(t.bestFor.length > 0, `${t.kind} has no bestFor`);
    assert.equal(t.benefits.length, 4, `${t.kind} needs exactly four benefits`);
  }
  assert.equal(LONG_TYPES.length, 5);
});

test('a cantilever is never scored against a pallet rack', () => {
  // The two families are separate on purpose — a long-goods kind must not be
  // reachable through the pallet model, or the score means nothing.
  const kinds = LONG_TYPES.map((t) => t.kind as string);
  assert.equal(kinds.includes('selective'), false);
  assert.equal(scoreLongType('vertical', {}), scoreLongType('vertical', {}));
});

// ── the layout ───────────────────────────────────────────────────────────

test('row depth is the arms plus the column, and both faces cost floor', () => {
  for (const t of LONG_TYPES) {
    const l = layoutCantilever(t.kind, building);
    assert.equal(l.rowDepthFt, (t.armLengthIn * t.sides + 6) / 12,
      `${t.kind} row depth does not match its arms`);
    assert.equal(l.sides, t.sides);
  }
});

test('a two-sided row holds more than the same row armed on one face', () => {
  const two = layoutCantilever('cantilever-rf', building);
  const one = layoutCantilever('cantilever-wall', building);

  // Identical but for the armed faces, so this isolates what sides buys.
  assert.equal(two.armLengthIn, one.armLengthIn);
  assert.equal(two.levels, one.levels);
  assert.ok(one.rows > two.rows, 'single-sided must fit more rows in the width');
  assert.ok(two.linearFt > one.linearFt, 'but two-sided must still hold more arm');
});

test('clear height drives arm levels, and a vertical rack has exactly one', () => {
  const low = layoutCantilever('cantilever-rf', { ...building, clearHeightFt: 12 });
  const high = layoutCantilever('cantilever-rf', { ...building, clearHeightFt: 30 });
  assert.ok(high.levels > low.levels, 'a taller building must take more arm levels');
  assert.equal(low.levels, Math.floor((12 * 12 - 24) / 24));

  for (const ft of [10, 16, 24, 32]) {
    assert.equal(layoutCantilever('vertical', { ...building, clearHeightFt: ft }).levels, 1,
      `${ft} ft: stock stands on end, so there is nothing to stack`);
  }
});

test('wider column centres give fewer bays and N columns take N-1 bays', () => {
  const tight = layoutCantilever('cantilever-rf', { ...building, columnPitchFt: 4 });
  const wide = layoutCantilever('cantilever-rf', { ...building, columnPitchFt: 8 });
  assert.ok(wide.bays < tight.bays, 'wider centres must give fewer bays');
  assert.equal(tight.bays, tight.columns - 1);
  assert.equal(wide.bays, wide.columns - 1);
});

test('linear feet is rows by bays by pitch by levels by sides', () => {
  for (const t of LONG_TYPES) {
    const l = layoutCantilever(t.kind, building);
    assert.equal(l.linearFt,
      Math.round(l.rows * l.bays * l.columnPitchFt * l.levels * l.sides),
      `${t.kind} capacity does not reconstruct from its own layout`);
  }
});

test('compareLongTypes returns all five, most capacity first', () => {
  const all = compareLongTypes(building);
  assert.equal(all.length, 5);
  const ft = all.map((x) => x.layout.linearFt);
  assert.deepEqual(ft, [...ft].sort((a, b) => b - a));
});
