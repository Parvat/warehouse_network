import {
  BEAM_CONNECTOR_IN, BEAM_FACE_IN, BEAM_LENGTHS_IN, FRAME_HEIGHTS_FT, LANE_TIE_IN,
  LIFT_CLEARANCE_IN,
  PALLET_OVERHANG_IN, SPRINKLER_CLEARANCE_IN,
} from './constants.js';
import type { BuildingInput, PalletInput, RackConfigInput, RackSpec } from './types.js';

/**
 * How many pallets fit on one beam pair.
 * Clearance is taken at each upright AND between pallets, so N pallets
 * need N+1 gaps. A 144" beam takes three 40" pallets; a 96" beam takes two.
 */
export function palletsPerBay(beamLengthIn: number, palletWidthIn: number, gapIn = 4): number {
  return Math.max(1, Math.floor((beamLengthIn - gapIn) / (palletWidthIn + gapIn)));
}

/** Smallest standard beam that carries the requested pallet count. */
export function bestFitBeam(palletWidthIn: number, perBay = 2, gapIn = 4): number {
  const required = perBay * palletWidthIn + (perBay + 1) * gapIn;
  const largest = BEAM_LENGTHS_IN[BEAM_LENGTHS_IN.length - 1]!;
  return BEAM_LENGTHS_IN.find((b) => b >= required) ?? largest;
}

/**
 * The frame a building and a pallet imply.
 *
 * Nobody buying racking knows what frame height they want; it falls out of the
 * clear height, the load and what the sprinklers need above it. The one subtle
 * step is subtracting a load height before dividing: the top level does not
 * need a beam above it, so a beam landing at the usable limit still earns a
 * level as long as the load fits over it. Dividing the whole height by the
 * pitch throws that level away.
 */
export function deriveFrame(usableHeightIn: number, loadHeightIn: number): {
  levelPitchIn: number; beamLevels: number; levels: number; frameHeightIn: number;
} {
  const levelPitchIn = levelModuleIn(loadHeightIn);
  // The beam has a depth of its own, and the upright has to carry it: a frame
  // exactly as tall as its top beam leaves that beam standing above the
  // column, which cannot be built. So the beam is counted only where the
  // upright above it and the load on it both still clear the sprinklers.
  const beamLevels = Math.max(0,
    Math.floor((usableHeightIn - loadHeightIn - BEAM_FACE_IN) / levelPitchIn));
  return {
    levelPitchIn, beamLevels,
    // the floor carries a load without a beam under it
    levels: beamLevels + 1,
    // exactly tall enough to carry the top beam's face — never less
    frameHeightIn: beamLevels * levelPitchIn + BEAM_FACE_IN,
  };
}

/**
 * The height one level takes: the beam's own face, the load on it, and the room
 * to lift that load clear before it lands.
 */
export function levelModuleIn(loadHeightIn: number): number {
  return BEAM_FACE_IN + loadHeightIn + LIFT_CLEARANCE_IN;
}

/**
 * Beam levels an upright of this height carries.
 *
 * Used where the frame height is given rather than derived — a customer reusing
 * frames they already own. The connector comes off the top before dividing,
 * because a beam needs column above its connector as well as below it.
 */
export function beamLevelsIn(frameHeightIn: number, loadHeightIn: number): number {
  return Math.max(0,
    Math.floor((frameHeightIn - BEAM_CONNECTOR_IN) / levelModuleIn(loadHeightIn)));
}

/**
 * Where the top beam's underside sits, in, and whether the upright carries it.
 *
 * The assertion the drawing checks before it draws: a beam whose face runs past
 * the top of its own upright is not a rack, it is a bug. The load *above* the
 * top beam may overhang the frame — that is normal and expected. Only the beam
 * has to fit.
 */
export function topBeamFits(spec: {
  beamLevels: number; levelPitchIn: number; frameHeightIn: number;
}): boolean {
  if (spec.beamLevels <= 0) return true;
  return spec.beamLevels * spec.levelPitchIn + BEAM_FACE_IN <= spec.frameHeightIn + 1e-9;
}

/**
 * How tall a drive-in upright is, in.
 *
 * Up past the top rail, past the load resting on it, and on to the tie that
 * braces the lane across. Not the beam-frame figure: there are no beams here,
 * and a frame that stopped at the top rail would have nothing to brace to.
 */
export function laneFrameHeightIn(a: {
  levels: number; levelPitchIn: number; loadHeightIn: number;
}): number {
  const topRail = Math.max(0, a.levels - 1) * a.levelPitchIn;
  return topRail + a.loadHeightIn + LANE_TIE_IN;
}

/** Tallest standard frame that still clears the sprinklers. */
export function bestFitFrameFt(usableHeightIn: number): number {
  const fits = FRAME_HEIGHTS_FT.filter((f) => f * 12 <= usableHeightIn);
  return fits.length ? fits[fits.length - 1]! : FRAME_HEIGHTS_FT[0];
}

export type SprinklerKind = BuildingInput['sprinklers'];

/** What a planner needs from a pallet and a building before it can lay anything out. */
export interface PalletDerivation {
  palletsPerBay: number;
  /** Total pallet levels including the floor level. */
  levels: number;
  levelPitchIn: number;
  frameDepthIn: number;
  frameHeightFt: number;
  /** The same height unrounded. Anything comparing against a beam uses this. */
  frameHeightIn: number;
  usableHeightIn: number;
}

/**
 * The figures a layout needs, derived the same way `buildSpec` derives them.
 *
 * Exposed on its own because the planner picks its beam by hand and never
 * builds a full spec — without this it would have to reimplement the
 * arithmetic, which is exactly what rule 1 forbids. Storage stops short of
 * the sprinklers and the frame snaps to a standard height, so levels come
 * from the frame that would actually be bought, not from the clear height.
 */
export function deriveFromPallet(
  pallet: PalletInput,
  clearHeightFt: number,
  beamLengthIn: number,
  sprinklers: SprinklerKind = 'ceiling',
): PalletDerivation {
  const usableHeightIn = clearHeightFt * 12 - SPRINKLER_CLEARANCE_IN[sprinklers];
  const f = deriveFrame(usableHeightIn, pallet.loadHeightIn);

  return {
    palletsPerBay: palletsPerBay(beamLengthIn, pallet.widthIn),
    levels: f.levels,
    levelPitchIn: f.levelPitchIn,
    frameDepthIn: Math.max(24, pallet.depthIn - PALLET_OVERHANG_IN * 2),
    frameHeightFt: +(f.frameHeightIn / 12).toFixed(2),
    frameHeightIn: f.frameHeightIn,
    usableHeightIn,
  };
}

export function buildSpec(
  building: BuildingInput,
  pallet: PalletInput,
  config: RackConfigInput,
): RackSpec {
  const topClearanceIn = SPRINKLER_CLEARANCE_IN[building.sprinklers];
  const usableHeightIn = building.clearHeightFt * 12 - topClearanceIn;

  const beamLengthIn =
    config.beam.mode === 'fixed' ? config.beam.lengthIn : bestFitBeam(pallet.widthIn);
  const ppb = palletsPerBay(beamLengthIn, pallet.widthIn);
  const palletClearanceIn = (beamLengthIn - ppb * pallet.widthIn) / (ppb + 1);

  const frameDepthIn = Math.max(24, pallet.depthIn - PALLET_OVERHANG_IN * 2);
  const derived = deriveFrame(usableHeightIn, pallet.loadHeightIn);
  const levelPitchIn = derived.levelPitchIn;

  // A height can still be forced — a customer reusing frames they already own —
  // but nothing asks for one any more.
  const frameHeightIn = config.frameHeight.mode === 'fixed'
    ? config.frameHeight.heightFt * 12 : derived.frameHeightIn;
  const fixed = config.frameHeight.mode === 'fixed';
  // A given height is measured properly rather than docked a level to be safe:
  // `floor(h / pitch) - 1` threw away a level a 16 ft frame really carries.
  const beamLevels = fixed
    ? beamLevelsIn(frameHeightIn, pallet.loadHeightIn) : derived.beamLevels;
  const levels = beamLevels + 1;
  const beamCapacityLb = ppb * pallet.weightLb;
  const frameCapacityLb = beamCapacityLb * levels;

  return {
    beamLengthIn,
    palletsPerBay: ppb,
    palletClearanceIn,
    beamCapacityLb,
    frameDepthIn,
    frameHeightIn,
    frameCapacityLb,
    loadPerColumnLb: Math.round(frameCapacityLb / 2),
    levelPitchIn,
    levels,
    beamLevels,
    usableHeightIn,
    topClearanceIn,
    topBeamHeightFt: (beamLevels * levelPitchIn) / 12,
    beamFaceIn: BEAM_FACE_IN,
    topBeamFits: topBeamFits({ beamLevels, levelPitchIn, frameHeightIn }),
    frameExceedsClear: frameHeightIn > usableHeightIn,
  };
}
