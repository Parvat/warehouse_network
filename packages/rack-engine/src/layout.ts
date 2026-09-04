import { COLUMN_WIDTH_IN, DOCK_APRON_FT } from './constants.js';
import type { BuildingInput, Layout, RackConfigInput, RackSpec } from './types.js';

/**
 * Fills the building with back-to-back double rows separated by aisles.
 * Single-deep rows against the walls are NOT modelled yet — this is the
 * conservative count, so real layouts usually beat it slightly.
 */
export function buildLayout(
  building: BuildingInput,
  spec: RackSpec,
  config: RackConfigInput,
): Layout {
  const moduleDepthFt = (spec.frameDepthIn * 2 + config.flueIn) / 12;
  const bandPitchFt = moduleDepthFt + config.aisleWidthFt;

  const availableWidthFt = building.widthFt - config.wallClearanceFt * 2;
  // The last band needs no aisle behind it, hence the + aisle.
  const bands = Math.max(
    1,
    Math.floor((availableWidthFt + config.aisleWidthFt) / bandPitchFt),
  );

  const bayLengthFt = (spec.beamLengthIn + COLUMN_WIDTH_IN) / 12;
  const availableLengthFt = building.lengthFt - config.wallClearanceFt * 2 - DOCK_APRON_FT;
  const baysPerRow = Math.max(1, Math.floor(availableLengthFt / bayLengthFt));

  const rows = bands * 2;
  const palletPositions = rows * baysPerRow * spec.palletsPerBay * spec.levels;

  return {
    bands,
    rows,
    baysPerRow,
    palletPositions,
    bayLengthFt,
    moduleDepthFt,
    bandPitchFt,
    unusedWidthFt: availableWidthFt - (bands * bandPitchFt - config.aisleWidthFt),
    unusedLengthFt: availableLengthFt - baysPerRow * bayLengthFt,
  };
}

/**
 * Widest aisle that would still allow one more back-to-back band.
 * Returns null when another band cannot fit at any workable aisle.
 */
export function aisleForExtraBand(
  building: BuildingInput,
  layout: Layout,
  config: RackConfigInput,
): number | null {
  const available = building.widthFt - config.wallClearanceFt * 2;
  const next = layout.bands + 1;
  const aisle = (available - next * layout.moduleDepthFt) / layout.bands;
  return aisle >= 6 && aisle < config.aisleWidthFt ? aisle : null;
}
