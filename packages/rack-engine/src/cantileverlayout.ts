import {
  CANTILEVER_COLUMN_IN, DOCK_APRON_FT, LONG_HEAD_CLEARANCE_IN,
} from './constants.js';
import { longType, type LongKind, type LongType } from './longgoods.js';
import type { Orientation } from './racklayout.js';

/**
 * Fills a building with one long-goods system.
 *
 *   along  — the axis rows run down, where columns are counted
 *   across — the axis stacked with aisles
 *
 * The difference that costs floor is how many faces are armed:
 *
 *   sides 1  arms on one face only, braced back — a run can start hard against
 *            the wall and adjacent runs share the aisle between them
 *
 *   sides 2  free-standing, armed on both faces, so every row needs a clear
 *            aisle on each side. Fewer rows fit, but each holds twice as much
 */
export interface CantileverLayoutInput {
  buildingLengthFt: number;
  buildingWidthFt: number;
  /** Floor to lowest obstruction, ft. */
  clearHeightFt: number;
  aisleWidthFt: number;
  wallClearanceFt: number;
  orientation: Orientation;
  /** Overrides the system's arm reach, in. */
  armLengthIn?: number;
  /** Overrides the system's column centres, ft. */
  columnPitchFt?: number;
}

export interface CantileverLayout {
  sides: 1 | 2;
  armLengthIn: number;
  columnPitchFt: number;
  /** Arm levels per column. A vertical rack has exactly one. */
  levels: number;
  rows: number;
  /** Uprights along one row. */
  columns: number;
  /** Spans between uprights — one fewer than the columns. */
  bays: number;
  rowDepthFt: number;
  /** Total arm length available, ft. The capacity figure for this family. */
  linearFt: number;
  alongFt: number;
  acrossFt: number;
  usedFt: number;
  spareFt: number;
}

export function layoutCantilever(
  kind: LongKind,
  input: CantileverLayoutInput,
): CantileverLayout {
  const T: LongType = longType(kind);
  const armLengthIn = input.armLengthIn ?? T.armLengthIn;
  const columnPitchFt = Math.max(1, input.columnPitchFt ?? T.columnPitchFt);
  const sides = T.sides;

  const alongFt =
    (input.orientation === 'length' ? input.buildingLengthFt : input.buildingWidthFt) -
    input.wallClearanceFt * 2 - DOCK_APRON_FT;
  const acrossFt =
    (input.orientation === 'length' ? input.buildingWidthFt : input.buildingLengthFt) -
    input.wallClearanceFt * 2;

  // Material stands on end in a vertical rack, so there is nothing to stack.
  const usableIn = input.clearHeightFt * 12 - LONG_HEAD_CLEARANCE_IN;
  const levels = T.levelPitchIn > 0
    ? Math.max(1, Math.floor(usableIn / T.levelPitchIn))
    : 1;

  const rowDepthFt = (armLengthIn * sides + CANTILEVER_COLUMN_IN) / 12;
  const aisle = input.aisleWidthFt;

  let rows: number, usedFt: number;
  if (sides === 1) {
    // Braced back, so the first run starts at the wall and runs share aisles.
    rows = Math.max(0, Math.floor((acrossFt + aisle) / (rowDepthFt + aisle)));
    usedFt = rows * rowDepthFt + Math.max(0, rows - 1) * aisle;
  } else {
    // Free-standing and armed both faces — an aisle on every side.
    rows = Math.max(0, Math.floor((acrossFt - aisle) / (rowDepthFt + aisle)));
    usedFt = rows * rowDepthFt + (rows + 1) * aisle;
  }

  const columns = Math.max(0, Math.floor(alongFt / columnPitchFt));
  const bays = Math.max(0, columns - 1);
  const linearFt = Math.round(rows * bays * columnPitchFt * levels * sides);

  return {
    sides, armLengthIn, columnPitchFt, levels, rows, columns, bays, rowDepthFt,
    linearFt, alongFt, acrossFt, usedFt, spareFt: acrossFt - usedFt,
  };
}

/** Every long-goods system laid out in the same building, most capacity first. */
export function compareLongTypes(input: CantileverLayoutInput) {
  return (['cantilever-rf', 'cantilever-str', 'cantilever-wall',
           'vertical', 'stackrack'] as LongKind[])
    .map((kind) => ({ kind, type: longType(kind), layout: layoutCantilever(kind, input) }))
    .sort((a, b) => b.layout.linearFt - a.layout.linearFt);
}
