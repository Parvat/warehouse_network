import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RACK_TYPES, rankRackTypes, canRecommend, layoutRack, compareRackTypes,
  type RackAnswers, type RackLayoutInput,
} from '../src/index.js';

const top = (a: RackAnswers) => rankRackTypes(a)[0]!.type.kind;

// A 240 x 120 ft building, GMA pallets, 96 in beams, four levels.
const bldg: RackLayoutInput = {
  buildingLengthFt: 240, buildingWidthFt: 120,
  beamLengthIn: 96, palletsPerBay: 2, levels: 4,
  frameDepthIn: 42, aisleWidthFt: 12.5,
  wallClearanceFt: 2.5, orientation: 'length',
};

test('two answers are enough to recommend', () => {
  assert.equal(canRecommend({}), false);
  assert.equal(canRecommend({ palletsPerSku: '6' }), false);
  assert.equal(canRecommend({ palletsPerSku: '6', rotation: 'any' }), true);
});

test('one or two pallets per SKU can only be selective', () => {
  assert.equal(top({ palletsPerSku: '1', rotation: 'any' }), 'selective');
  assert.equal(top({ palletsPerSku: '1', rotation: 'fifo', throughput: 'high', skuCount: 'lots' }), 'selective');
});

test('strict rotation rules out the last-in-first-out systems', () => {
  const r = rankRackTypes({ palletsPerSku: '10', rotation: 'fifo', skuCount: 'few' });
  const winner = r[0]!.type;
  assert.equal(winner.rotation, 'FIFO', 'a FIFO need must not return a LIFO system');
  const driveIn = r.find((x) => x.type.kind === 'drivein')!;
  const pushBack = r.find((x) => x.type.kind === 'pushback')!;
  assert.ok(driveIn.score < 40 && pushBack.score < 40);
});

test('double-deep is penalised under strict rotation — the back pallet is stranded', () => {
  assert.notEqual(top({ palletsPerSku: '3', rotation: 'fifo' }), 'doubledeep');
  assert.equal(top({ palletsPerSku: '3', rotation: 'any' }), 'pushback');
});

test('heavy throughput pulls back from deep lanes', () => {
  const calm = top({ palletsPerSku: '10', rotation: 'any', skuCount: 'few', throughput: 'low' });
  const busy = top({ palletsPerSku: '10', rotation: 'any', skuCount: 'few', throughput: 'high' });
  assert.equal(calm, 'drivein', 'slow and deep is what drive-in is for');
  assert.notEqual(busy, 'drivein', 'the truck travels the lane on every pallet');
});

test('a sit-down truck cannot reach the back of a double-deep bay', () => {
  const withCb = rankRackTypes({ palletsPerSku: '3', rotation: 'any', truck: 'counterbalance' });
  const without = rankRackTypes({ palletsPerSku: '3', rotation: 'any' });
  const s1 = withCb.find((x) => x.type.kind === 'doubledeep')!.score;
  const s2 = without.find((x) => x.type.kind === 'doubledeep')!.score;
  assert.ok(s1 < s2 - 20);
});

test('no two types ever show the same figure', () => {
  const cases: RackAnswers[] = [
    { palletsPerSku: '1', rotation: 'any' },
    { palletsPerSku: '6', rotation: 'fifo', skuCount: 'few' },
    { palletsPerSku: '10', rotation: 'any', throughput: 'high', skuCount: 'few' },
    { palletsPerSku: '10', rotation: 'fifo', skuCount: 'few', throughput: 'high' },
  ];
  for (const a of cases) {
    const scores = rankRackTypes(a).map((x) => x.score);
    assert.equal(new Set(scores).size, scores.length, JSON.stringify(a));
  }
});

// ── layout ───────────────────────────────────────────────────────────────

test('deeper storage holds more, never less', () => {
  const cmp = compareRackTypes(bldg);
  const get = (k: string) => cmp.find((c) => c.kind === k)!.layout.positions;
  assert.ok(get('doubledeep') > get('selective'), 'double-deep must beat selective');
  assert.ok(get('drivein') > get('doubledeep'));
});

test('an aisle-picked row holds its depth — the bug that made double-deep look worse', () => {
  const sel = layoutRack('selective', bldg);
  const dd = layoutRack('doubledeep', bldg);
  assert.ok(dd.rows < sel.rows, 'fewer aisles means fewer rows');
  assert.ok(dd.positions > sel.positions, 'but each row is two pallets deep');
});

test('the row against a wall is single — nobody reaches the far side of a pair', () => {
  const l = layoutRack('selective', bldg);
  assert.equal(l.wallRows, 2);
  assert.equal((l.rows - l.wallRows) % 2, 0, 'everything else is back-to-back pairs');
});

test('drive-through pays for its second aisle', () => {
  const di = layoutRack('drivein', bldg).positions;
  const dt = layoutRack('drivethru', bldg).positions;
  assert.ok(dt <= di, 'every block needs a clear aisle at both ends');
});

test('lane depth is clamped to what the type supports', () => {
  assert.equal(layoutRack('selective', { ...bldg, deep: 9 }).deep, 1);
  assert.equal(layoutRack('drivein', { ...bldg, deep: 99 }).deep, 10);
  assert.equal(layoutRack('flow', { ...bldg, deep: 1 }).deep, 4);
});

test('rotating the building changes what fits', () => {
  const a = layoutRack('selective', bldg).positions;
  const b = layoutRack('selective', { ...bldg, orientation: 'width' }).positions;
  assert.ok(a > 0 && b > 0);
  assert.notEqual(a, b, 'a 240 x 120 box is not symmetric');
});

test('every type carries the copy the cards need', () => {
  for (const t of RACK_TYPES) {
    assert.ok(t.badge && t.blurb && t.bestFor, t.kind);
    assert.equal(t.benefits.length, 4, `${t.kind} needs four bullets`);
  }
});
