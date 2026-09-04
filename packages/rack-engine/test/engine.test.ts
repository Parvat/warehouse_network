import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BEAM_FACE_IN, bestFitBeam, deriveFromPallet, levelModuleIn, palletsPerBay, solve,
  beamLevelsIn, topBeamFits, type EngineInput,
} from '../src/index.js';

const base: EngineInput = {
  building: { lengthFt: 240, widthFt: 120, clearHeightFt: 28, columnGridXFt: 40, columnGridYFt: 40, sprinklers: 'ceiling' },
  pallet: { depthIn: 48, widthIn: 40, loadHeightIn: 52, weightLb: 2200 },
  config: { frameHeight: { mode: 'fit' }, beam: { mode: 'best-fit' }, aisleWidthFt: 12.5, flueIn: 6, wallClearanceFt: 2.5 },
  stock: { skuCount: 600, palletsOutPerDay: 90, rotation: 'fifo' },
};
const clone = (o: EngineInput): EngineInput => JSON.parse(JSON.stringify(o));

test('a 144 in beam holds three GMA pallets, a 96 in beam holds two', () => {
  assert.equal(palletsPerBay(144, 40), 3);
  assert.equal(palletsPerBay(96, 40), 2);
  assert.equal(palletsPerBay(120, 40), 2, '120 in is the wasteful middle ground');
});

test('best-fit beam picks 96 in for two 40 in pallets', () => {
  assert.equal(bestFitBeam(40, 2), 96);
  assert.equal(bestFitBeam(40, 3), 144);
});

test('deriveFromPallet agrees with buildSpec — the planner has no arithmetic of its own', () => {
  const { spec } = solve(base);
  const d = deriveFromPallet(base.pallet, base.building.clearHeightFt, spec.beamLengthIn);

  assert.equal(d.palletsPerBay, spec.palletsPerBay);
  assert.equal(d.levels, spec.levels);
  assert.equal(d.levelPitchIn, spec.levelPitchIn);
  assert.equal(d.frameDepthIn, spec.frameDepthIn);
  assert.equal(d.usableHeightIn, spec.usableHeightIn);
});

test('no load height or clear height puts a beam past the top of its upright', () => {
  // The failure this catches is a module that does not match the face — the old
  // 63 in from a 5 in beam against a 4 in section. Sweeping both inputs is
  // cheaper than trusting one worked example.
  for (let loadHeightIn = 24; loadHeightIn <= 96; loadHeightIn += 2) {
    for (let clearHeightFt = 14; clearHeightFt <= 40; clearHeightFt += 1) {
      for (const sprinklers of ['ceiling', 'in-rack'] as const) {
        const d = deriveFromPallet(
          { depthIn: 48, widthIn: 40, loadHeightIn, weightLb: 2000 },
          clearHeightFt, 96, sprinklers);
        const beams = d.levels - 1;
        const where = `${loadHeightIn} in load, ${clearHeightFt} ft clear, ${sprinklers}`;
        assert.equal(d.levelPitchIn, levelModuleIn(loadHeightIn), where);
        assert.ok(topBeamFits({ beamLevels: beams, levelPitchIn: d.levelPitchIn,
          frameHeightIn: d.frameHeightIn }),
          `${where}: top beam at ${beams * d.levelPitchIn} in, frame ${d.frameHeightIn} in`);
        assert.ok(d.frameHeightIn <= d.usableHeightIn, `${where}: frame clears the heads`);
      }
    }
  }
});

test('a given frame height carries the levels it really carries', () => {
  // Reusing frames already owned: 16 ft of upright, a 52 in load, a 4 in face
  // and a 6 in lift is a 62 in module, and 189 in of usable column over the
  // connector is three of them. Docking a level "to be safe" threw one away.
  assert.equal(levelModuleIn(52), 62);
  assert.equal(beamLevelsIn(16 * 12, 52), 3, 'beams at 62, 124 and 186 in');
  assert.ok(3 * 62 + BEAM_FACE_IN <= 16 * 12, 'the top one occupies 186-190 of 192');
  assert.equal(beamLevelsIn(12 * 12, 52), 2);
  assert.equal(beamLevelsIn(60, 52), 0, 'no upright carries a beam it cannot clear');
});

test('storage stops short of the sprinklers, and no beam sits above its upright', () => {
  const pallet = { depthIn: 48, widthIn: 40, loadHeightIn: 60, weightLb: 2000 };

  // 26 ft clear, 36 in for ceiling heads. A level is the beam's own face, the
  // load, and the room to lift it clear — written from the constants rather
  // than as a literal, because a 5 in face masquerading as the module is
  // exactly the bug this test exists to catch.
  const module = levelModuleIn(pallet.loadHeightIn);
  assert.equal(module, BEAM_FACE_IN + pallet.loadHeightIn + 6);

  const d = deriveFromPallet(pallet, 26, 96);
  assert.equal(d.usableHeightIn, 26 * 12 - 36);
  assert.equal(d.levelPitchIn, module);
  const beams = d.levels - 1;
  assert.equal(d.frameHeightIn, beams * module + BEAM_FACE_IN,
    'the upright runs past its top beam by the beam face and no further');

  // the top beam, its load, and the upright carrying it all clear the heads
  const topBeamIn = beams * module;
  assert.ok(topBeamIn + BEAM_FACE_IN <= d.frameHeightIn, 'the top beam is inside the frame');
  assert.ok(topBeamIn + pallet.loadHeightIn <= d.usableHeightIn, 'and its load clears the heads');
  assert.ok((beams + 1) * module + BEAM_FACE_IN + pallet.loadHeightIn > d.usableHeightIn,
    'one more beam would not');

  // In-rack sprinklers need less room above the load, so they never store less.
  for (const ft of [20, 24, 26, 28, 32, 36]) {
    const ceiling = deriveFromPallet(pallet, ft, 96, 'ceiling');
    const inRack = deriveFromPallet(pallet, ft, 96, 'in-rack');
    assert.ok(inRack.levels >= ceiling.levels, `${ft} ft: in-rack must never store less`);
    assert.ok(inRack.usableHeightIn > ceiling.usableHeightIn, `${ft} ft: and buys back height`);

    // whatever the inputs, the frame carries its top beam and clears the heads
    const beams = ceiling.levels - 1;
    assert.ok(topBeamFits({ beamLevels: beams, levelPitchIn: ceiling.levelPitchIn,
      frameHeightIn: ceiling.frameHeightIn }), `${ft} ft: no beam above the upright`);
    assert.ok(ceiling.frameHeightIn <= ceiling.usableHeightIn, `${ft} ft: frame clears heads`);
    assert.ok(beams * ceiling.levelPitchIn + pallet.loadHeightIn <= ceiling.usableHeightIn,
      `${ft} ft: and so does the load on the top beam`);
  }
});

test('N bays take N+1 frames', () => {
  const { layout, bom } = solve(base);
  const frames = bom.lines.find((l) => l.item === 'Upright frame')!;
  assert.equal(frames.qty, layout.rows * (layout.baysPerRow + 1));
});

test('the floor level carries no beams or decking', () => {
  const { spec, layout, bom } = solve(base);
  const beams = bom.lines.find((l) => l.item === 'Beam')!;
  assert.equal(spec.beamLevels, spec.levels - 1);
  assert.equal(beams.qty, layout.rows * layout.baysPerRow * spec.beamLevels * 2);
});

test('pallet clearance is shared evenly and reconstructs the beam length', () => {
  const { spec } = solve(base);
  const total = spec.palletsPerBay * 40 + (spec.palletsPerBay + 1) * spec.palletClearanceIn;
  assert.ok(Math.abs(total - spec.beamLengthIn) < 1e-9);
  assert.ok(spec.palletClearanceIn > 0, 'pallets must not touch the uprights');
});

test('narrowing the aisle fits more positions', () => {
  const wide = solve(base).layout.palletPositions;
  const narrow = clone(base);
  narrow.config.aisleWidthFt = 6;
  assert.ok(solve(narrow).layout.palletPositions > wide);
});

test('a frame taller than the clear height is blocking', () => {
  const tall = clone(base);
  tall.config.frameHeight = { mode: 'fixed', heightFt: 40 };
  const flags = solve(tall).flags;
  assert.ok(flags.some((f) => f.severity === 'blocking' && f.title === 'Frame will not fit'));
});

test('zero flue is blocking, tight flue is a check', () => {
  const none = clone(base); none.config.flueIn = 0;
  assert.ok(solve(none).flags.some((f) => f.severity === 'blocking' && f.category === 'Fire'));
  const tight = clone(base); tight.config.flueIn = 4;
  assert.ok(solve(tight).flags.some((f) => f.severity === 'check' && f.title === 'Flue below 6 in'));
});

test('more SKUs than positions is blocking', () => {
  const many = clone(base);
  many.stock.skuCount = 99_999;
  assert.ok(solve(many).flags.some((f) => f.title === 'More SKUs than positions'));
});

test('three heavy pallets per bay raises the beam capacity flag', () => {
  const heavy = clone(base);
  heavy.config.beam = { mode: 'fixed', lengthIn: 144 };
  heavy.pallet.weightLb = 2600;
  const { spec, flags } = solve(heavy);
  assert.equal(spec.palletsPerBay, 3);
  assert.equal(spec.beamCapacityLb, 7800);
  assert.ok(flags.some((f) => f.title === 'Heavy beam section'));
});

test('a clean configuration produces no blocking flags', () => {
  assert.equal(solve(base).flags.filter((f) => f.severity === 'blocking').length, 0);
});

test('bom weight is the sum of its lines', () => {
  const { bom } = solve(base);
  assert.equal(bom.totalWeightLb, bom.lines.reduce((s, l) => s + l.totalWeightLb, 0));
  assert.ok(bom.truckloads >= 1);
});
