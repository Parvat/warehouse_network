import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assess, inferPallet, inferBuildingAreaSqFt, nextBestQuestion,
  stated, type Requirement,
} from '../src/index.js';

const base = (over: Partial<Requirement> = {}): Requirement => ({
  id: 'r1', services: ['complete_project'], mode: 'knows_quantity',
  location: { raw: 'Allentown, PA' }, material: 'either', files: [],
  createdAt: '', updatedAt: '', ...over,
});

test('a provider can bid on location + service + quantity', () => {
  const r = base({ palletPositions: stated(2400) });
  const c = assess(r);
  assert.equal(c.biddable, true);
  assert.deepEqual(c.missingForBid, []);
});

test('"we need racking" with no size is not biddable', () => {
  const c = assess(base());
  assert.equal(c.biddable, false);
  assert.ok(c.missingForBid.includes('how much you store'));
});

test('inspection-only needs no sizing to be biddable', () => {
  const c = assess(base({ services: ['inspection_only'] }));
  assert.equal(c.biddable, true, 'they already have racks');
});

test('completeness bands drive the inbox dots', () => {
  assert.equal(assess(base()).band, 'outline');
  assert.equal(assess(base({ palletPositions: stated(2400), targetDate: '2027-03-01' })).band, 'workable');
  assert.equal(
    assess(base({ palletPositions: stated(2400), targetDate: '2027-03-01', sizingResult: {} })).band,
    'full',
  );
});

test('a layout upload counts toward completeness', () => {
  const r = base({
    palletPositions: stated(2400), targetDate: '2027-03-01',
    files: [{ id: 'f1', filename: 'plan.dwg', kind: 'layout_dwg', sizeBytes: 1 }],
  });
  assert.equal(assess(r).band, 'full');
});

test('pallet values are inferred from the commodity and marked as guesses', () => {
  const p = inferPallet('beverage');
  assert.equal(p.weightLb.value, 2600);
  assert.equal(p.weightLb.provenance, 'inferred');
  assert.ok(p.weightLb.basis, 'every guess must carry its basis for the chip');
  assert.ok(inferPallet('packaging').weightLb.value < p.weightLb.value, 'empties are lighter than cans');
});

test('unknown commodity falls back rather than throwing', () => {
  assert.equal(inferPallet(undefined).weightLb.value, 1800);
  assert.equal(inferPallet('nonsense').weightLb.value, 1800);
});

test('building area can be inferred from a position count', () => {
  const a = inferBuildingAreaSqFt(2400, 28);
  assert.ok(a > 15_000 && a < 40_000, `implausible area: ${a}`);
  assert.ok(inferBuildingAreaSqFt(2400, 36) < a, 'a taller building needs less floor');
});

test('next best question asks for a blocker before a nicety', () => {
  assert.equal(nextBestQuestion(base()), 'how much you store');
  assert.equal(nextBestQuestion(base({ palletPositions: stated(2400) })), 'target date');
});
