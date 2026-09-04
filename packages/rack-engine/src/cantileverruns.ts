import {
  CROSS_AISLE_WIDTH_FT, crossAislesFor,
  CANTILEVER_ARM_PITCH_IN, CANTILEVER_BASE_HEIGHT_IN,
  CANTILEVER_BRACE_PITCH_FT, CANTILEVER_COLUMN_IN,
  CANTILEVER_TOP_CLEARANCE_IN, CANTILEVER_TOP_MATERIAL_IN,
  CANTILEVER_MAX_CENTRES_FT, CANTILEVER_MAX_OVERHANG_FT, CANTILEVER_PRODUCT_FT,
  CANTILEVER_RUN_GAP_FT, DOCK_APRON_FT, LONG_HEAD_CLEARANCE_IN, TRUCK_PAYLOAD_LB,
} from './constants.js';
import { crossAisleSpans, fillSegments } from './crossaisles.js';
import { gridColumns, type Availability, type Orientation } from './racklayout.js';
import type { Bom, BomLine, Flag } from './types.js';

/**
 * Cantilever racking laid out as sectioned runs.
 *
 * Two rules carry this layout.
 *
 * **Spacing is derived, never entered.** Tower centres and brace spacing are
 * consequences of the product and the tower height, and letting them be typed
 * produces combinations that cannot be built. Centres are the widest that keep
 * the overhang within the cap, up to the 6 ft ceiling; the pitch is then capped
 * again at `product / (towers - 1)` so short stock cannot end up with a span
 * longer than the material and a negative overhang.
 *
 * **Sides follow position, not preference.** A row against a wall can only be
 * reached from the aisle, so it is armed on one face; a row out on the floor is
 * reached from both. This is the same rule the pallet solver applies to its
 * wall rows, and it means capacity has to sum per row rather than multiply by
 * one global figure. It counts the bases too: a tower armed on both faces takes
 * a base section on each.
 *
 * **The base is a storage level.** Product rests on the base itself, not only
 * on the arms, so a tower with N arm levels holds N+1 levels of material.
 * Counting arms alone lost a whole level of capacity.
 *
 * **Only what was asked for is built.** A row is not filled to the wall because
 * there is wall to fill: the last row carries the runs the stock still needs and
 * stops, and the floor beyond it stays empty. Filling it would overstate what
 * the customer is buying and hide the floor they have left.
 *
 * **Rows follow what is stored, not what fits.** A customer knows how many feet
 * of stock they have; they do not know how many rows that is. Rows are added
 * one at a time until the stock is housed or the building runs out — one at a
 * time because a single-sided row holds half what a double does, so dividing by
 * an average is wrong.
 *
 * **A double-sided row is the efficient one, and the solver prefers it.** Per
 * foot of building width a single row costs about 16.5 ft for one face and a
 * double about 20.5 ft for two — 16.5 ft a face against 10.25. A single exists
 * because a wall gives something to brace back to and saves a little depth, not
 * because it is a good use of width. So: one wall row, then doubles, and a
 * second single only where a double will no longer fit. The condition is
 * written out rather than left to fall out of the loop order, because testing
 * "would a single finish the job?" before "is there room for a double?" puts a
 * one-face row in space that could have held two.
 *
 * **The top arm is not the top of the tower.** The load lying on it needs
 * somewhere to be, so the column carries on past the top arm by a load height
 * plus clearance. A tower is base, then its arms, then that allowance — and it
 * is the whole of it that has to fit under the sprinklers.
 */

export interface CantileverRunInput {
  buildingLengthFt: number;
  buildingWidthFt: number;
  clearHeightFt: number;
  aisleWidthFt: number;
  wallClearanceFt: number;
  orientation: Orientation;

  /** Longest piece or bundle stored, ft. Sanitised before use. */
  productLengthFt: number;
  /** Arm reach, in. The base matches it. */
  armLengthIn: number;
  /** Arm levels up the tower. Defaults from the clear height. */
  levels?: number;
  /** Vertical gap between arm levels, in. Defaults to the standard pitch. */
  armSpacingIn?: number;
  /**
   * A strip against one wall rather than a whole building: exactly this many
   * rows, the first hard against the wall and single-sided, the rest double.
   * The far edge is an aisle shared with what fills the rest of the floor, so
   * it is not a second wall.
   */
  stripRows?: number;
  /** Linear feet of arm the customer needs. Rows are added until it is met. */
  linearFeetNeededFt?: number;
  /** How much of the footprint is free for racking. */
  available?: Availability;
  /** Overrides the cross aisles worked out from the run. */
  crossAisles?: number;
  /** The building's column grid, ft. Drawn, but see `columnsSolved`. */
  gridXFt?: number;
  gridYFt?: number;
}

export interface CantileverRunLayout {
  /** The product actually used, after clamping. */
  productLengthFt: number;
  towersPerRun: number;
  /** Distance first tower to last, ft. */
  spanFt: number;
  /** Derived spacing, never above the ceiling. */
  towerCentresFt: number;
  /** Material past the end tower at each end, ft. Never above the cap. */
  overhangFt: number;
  /** A run occupies the product, because the material overhangs the towers. */
  runLengthFt: number;
  runGapFt: number;
  runsPerRow: number;

  rows: number;
  /** Arms per row, in order across the building. 1 at a wall, 2 inside. */
  rowSides: readonly (1 | 2)[];
  wallRows: number;
  interiorRows: number;

  /** Arm levels, as asked for. Never clamped — an overrun raises a flag. */
  levels: number;
  /** Levels that carry product: the arms, plus the base they stand on. */
  storageLevels: number;
  armLengthIn: number;
  /** Always the arm: a base must resist the moment of a loaded arm. */
  baseLengthIn: number;
  /** Base sections. One per tower face, so an interior tower takes two. */
  bases: number;
  /** The base stands under the first arm, so it takes height. */
  baseHeightIn: number;
  /** Column above the top arm: a load height plus clearance. */
  topAllowanceIn: number;
  /** Base plus the arms above it — what this combination actually needs. */
  towerHeightIn: number;
  /** Tower height this building leaves room for, in. */
  usableHeightIn: number;
  armPitchIn: number;
  /** Brace sets between one pair of towers, spanning the derived centres. */
  braceSetsPerBay: number;

  /** Depth of a one-armed and a two-armed row, ft. */
  singleDepthFt: number;
  doubleDepthFt: number;

  linearFt: number;
  /** What every row this building holds would come to, ft. */
  maxLinearFt: number;
  /** What was asked for, ft. Undefined where the building was simply filled. */
  linearFeetNeededFt: number | undefined;
  /** True where the building cannot house what was asked for. */
  short: boolean;
  /** Runs built in the last row. Fewer than `runsPerRow` where it is part-filled. */
  runsInLastRow: number;
  /** True where the last row carries fewer runs than it has room for. */
  lastRowPartial: boolean;
  crossAisles: number;
  crossAisleWidthFt: number;
  crossAisleAtFt: readonly number[];
  /**
   * Where every run starts along the row, in envelope feet, with the cross
   * aisles already broken out of it. The drawing renders from this so a run it
   * shows is a run the count paid for — and so a part-filled last row simply
   * draws fewer of them.
   */
  runStartsFt: readonly number[];
  /** The building's columns, in building feet. Drawn on the plan. */
  columns: readonly { xFt: number; yFt: number }[];
  /**
   * False, and honestly so: the pallet solver slides its block to put columns
   * in flues and aisles, and nothing here does that for towers yet. The columns
   * are drawn because they are a fact about the building, and a flag says the
   * linear feet do not yet account for them.
   */
  columnsSolved: boolean;
  usableAlongFt: number;
  unavailableAlongFt: number;
  alongFt: number;
  acrossFt: number;
  usedFt: number;
  spareFt: number;
}

/** Tower height this building leaves under the sprinkler heads, in. */
export function usableTowerHeightIn(clearHeightFt: number): number {
  return clearHeightFt * 12 - LONG_HEAD_CLEARANCE_IN;
}

/** Column carried above the top arm, for the load lying on it. */
export const CANTILEVER_TOP_ALLOWANCE_IN =
  CANTILEVER_TOP_MATERIAL_IN + CANTILEVER_TOP_CLEARANCE_IN;

/** Base, arms and the allowance above the top one. */
export function cantileverTowerHeightIn(levels: number, armSpacingIn: number): number {
  return CANTILEVER_BASE_HEIGHT_IN + levels * armSpacingIn + CANTILEVER_TOP_ALLOWANCE_IN;
}

/**
 * Arm levels that fit under the sprinklers at a given spacing.
 *
 * The base is under the first arm and the load on the top arm sits above the
 * last one, so both come off the budget before the arms are counted.
 */
export function cantileverLevels(
  clearHeightFt: number, armSpacingIn: number = CANTILEVER_ARM_PITCH_IN,
): number {
  const spacing = Math.max(1, armSpacingIn);
  const forArms = usableTowerHeightIn(clearHeightFt)
    - CANTILEVER_BASE_HEIGHT_IN - CANTILEVER_TOP_ALLOWANCE_IN;
  return Math.max(1, Math.floor(forArms / spacing));
}

/**
 * A product length that can actually be built with.
 *
 * Zero, blank and NaN all reach here from a half-edited field, and computing
 * with them produced a run reporting no product, no overhang and towers wider
 * than the ceiling — a drawing that contradicted itself.
 */
export function normaliseProductLengthFt(v: number): number {
  if (!Number.isFinite(v)) return CANTILEVER_PRODUCT_FT.fallback;
  return Math.min(CANTILEVER_PRODUCT_FT.max, Math.max(CANTILEVER_PRODUCT_FT.min, v));
}

/**
 * Towers needed so the material overhangs no more than the cap at either end,
 * at the widest spacing that gets built. Never fewer than two — one tower is a
 * post, not a run.
 */
export function towersForRun(productLengthFt: number): number {
  const product = normaliseProductLengthFt(productLengthFt);
  const needed = Math.ceil(
    (product - CANTILEVER_MAX_OVERHANG_FT * 2) / CANTILEVER_MAX_CENTRES_FT) + 1;
  return Math.max(2, needed);
}

/** The derived spacing for a run: as wide as the cap allows, never wider. */
/** A row's depth for one and for two arms, ft. The same figures the strip uses. */
export function cantileverRowDepthsFt(armLengthIn: number): {
  singleDepthFt: number; doubleDepthFt: number;
} {
  return {
    singleDepthFt: (armLengthIn + CANTILEVER_COLUMN_IN) / 12,
    doubleDepthFt: (armLengthIn * 2 + CANTILEVER_COLUMN_IN) / 12,
  };
}

export function towerSpacing(productLengthFt: number): {
  productLengthFt: number; towersPerRun: number; towerCentresFt: number;
  spanFt: number; overhangFt: number;
} {
  const product = normaliseProductLengthFt(productLengthFt);
  const towersPerRun = towersForRun(product);
  // Capped a second time by the material itself, or short stock gets a span
  // longer than the product and an overhang below zero.
  const towerCentresFt = Math.min(CANTILEVER_MAX_CENTRES_FT, product / (towersPerRun - 1));
  const spanFt = (towersPerRun - 1) * towerCentresFt;
  return {
    productLengthFt: product, towersPerRun, towerCentresFt, spanFt,
    overhangFt: (product - spanFt) / 2,
  };
}

export function layoutCantileverRuns(input: CantileverRunInput): CantileverRunLayout {
  const armPitchIn = Math.max(1, input.armSpacingIn ?? CANTILEVER_ARM_PITCH_IN);
  const levels = Math.max(1, input.levels ?? cantileverLevels(input.clearHeightFt, armPitchIn));
  // Product rests on the base as well as on every arm above it.
  const storageLevels = levels + 1;
  const { productLengthFt, towersPerRun, towerCentresFt, spanFt, overhangFt } =
    towerSpacing(input.productLengthFt);
  const centres = towerCentresFt;

  const alongFullFt =
    (input.orientation === 'length' ? input.buildingLengthFt : input.buildingWidthFt) -
    input.wallClearanceFt * 2 - DOCK_APRON_FT;
  const acrossFt =
    (input.orientation === 'length' ? input.buildingWidthFt : input.buildingLengthFt) -
    input.wallClearanceFt * 2;

  // The building holds more than racking, and long runs need cross aisles just
  // as pallet rows do. Both come off the run before anything is laid in it.
  const usableAlongFt = availableAlong(alongFullFt, acrossFt, input.available);
  const crossAisles = Math.max(0, Math.round(input.crossAisles ?? crossAislesFor(usableAlongFt)));
  const alongFt = Math.max(0, usableAlongFt - crossAisles * CROSS_AISLE_WIDTH_FT);

  // A run occupies the product, not the span — the ends hang past the towers.
  const runLengthFt = Math.max(spanFt, productLengthFt);

  // The runs are laid into the building's own segments, so the strip breaks
  // where the pallet zone breaks. Counting them off the whole length and then
  // slicing it up let a run straddle an aisle, which is not a run anybody can
  // load — and put the strip's gaps at different feet from the racking's.
  const runStartsFt = runStarts(usableAlongFt, runLengthFt, crossAisles);
  const runsPerRow = runStartsFt.length;

  const { singleDepthFt, doubleDepthFt } = cantileverRowDepthsFt(input.armLengthIn);
  const aisle = input.aisleWidthFt;

  const strip = input.stripRows === undefined ? 0
    : Math.max(1, Math.round(input.stripRows));

  // wall, aisle, [interior, aisle] …, wall
  const wallRows = strip > 0 ? 1
    : acrossFt >= singleDepthFt * 2 + aisle ? 2
    : acrossFt >= singleDepthFt ? 1 : 0;
  let interiorRows = 0;
  let usedFt = 0;
  if (strip > 0) {
    // The strip is sized by its row count, not by what the building leaves:
    // the pallet racking takes the remainder. Its own aisles are internal —
    // the aisle on its open side is shared and belongs to neither zone.
    interiorRows = strip - 1;
    usedFt = singleDepthFt + interiorRows * (doubleDepthFt + aisle);
  } else if (wallRows === 2) {
    interiorRows = Math.max(0,
      Math.floor((acrossFt - singleDepthFt * 2 - aisle) / (doubleDepthFt + aisle)));
    usedFt = singleDepthFt * 2 + interiorRows * doubleDepthFt + (interiorRows + 1) * aisle;
  } else if (wallRows === 1) {
    interiorRows = Math.max(0,
      Math.floor((acrossFt - singleDepthFt - aisle) / (doubleDepthFt + aisle)));
    usedFt = singleDepthFt + interiorRows * doubleDepthFt + (interiorRows + 1) * aisle;
  }


  // Never clamped to what fits: a combination that does not fit has to be
  // visible as a blocking flag, not quietly shortened into one that does.
  const towerHeightIn = cantileverTowerHeightIn(levels, armPitchIn);
  // X-braces span horizontally between towers, so their width is the derived
  // centre spacing; only how many stack up the tower is left to work out.
  const braceSetsPerBay = Math.max(1,
    Math.ceil(towerHeightIn / 12 / CANTILEVER_BRACE_PITCH_FT));

  // What a run holds is the product on it, not the distance between its end
  // towers: the material overhangs a foot at each end and that stock is stored
  // just the same. Span is where the towers go — a drawing figure, and the one
  // the bill counts towers from. It is not a capacity figure, and using it here
  // undercounted a 20 ft product on 18 ft of span by a tenth, more as the
  // centres widen.
  //
  // Over the storage levels, because the base holds product too.
  const perRun = productLengthFt * storageLevels;
  const width = {
    widthFt: acrossFt, singleDepthFt, doubleDepthFt, aisleFt: aisle,
    capacityPerRun: perRun, runsPerRow,
    maxRows: strip > 0 ? strip : undefined,
  };

  // What this building could ever hold, for the shortfall flag to name.
  const maxLinearFt = Math.round(
    solveRows({ ...width, neededFt: Number.POSITIVE_INFINITY }).builtFt);

  // And what the stock actually asks for.
  const needed = input.linearFeetNeededFt;
  const solved = solveRows({
    ...width,
    // No figure asked for means fill the building, which is the same walk with
    // a demand nothing can satisfy.
    neededFt: needed !== undefined && Number.isFinite(needed) && needed > 0
      ? needed : Number.POSITIVE_INFINITY,
  });
  const rowSides = solved.rowSides;
  const rows = rowSides.length;
  const runsInLastRow = solved.runsInLastRow;
  const linearFt = Math.round(solved.builtFt);
  const usedFtRows = solved.usedFt;

  // One base per armed face: an interior tower is based on both sides.
  const towersPerRow = runsPerRow * towersPerRun;
  const bases = rowSides.reduce((sum, sides) => sum + towersPerRow * sides, 0);

  return {
    productLengthFt, towersPerRun, spanFt, towerCentresFt, overhangFt, runLengthFt,
    runGapFt: CANTILEVER_RUN_GAP_FT, runsPerRow,
    rows, rowSides,
    wallRows: rowSides.filter((x) => x === 1).length,
    interiorRows: rowSides.filter((x) => x === 2).length,
    maxLinearFt, linearFeetNeededFt: needed,
    runsInLastRow, lastRowPartial: runsInLastRow < runsPerRow,
    short: solved.shortFt > 0,
    crossAisles, crossAisleWidthFt: CROSS_AISLE_WIDTH_FT,
    crossAisleAtFt: [...crossAisleSpans(usableAlongFt, crossAisles).atFt],
    runStartsFt,
    columns: input.gridXFt && input.gridYFt
      ? gridColumns(input, { xFt: input.gridXFt, yFt: input.gridYFt }).map(
        ({ xFt, yFt }) => ({ xFt, yFt }))
      : [],
    columnsSolved: false,
    usableAlongFt, unavailableAlongFt: Math.max(0, alongFullFt - usableAlongFt),
    levels, storageLevels, armLengthIn: input.armLengthIn, baseLengthIn: input.armLengthIn,
    bases, baseHeightIn: CANTILEVER_BASE_HEIGHT_IN,
    topAllowanceIn: CANTILEVER_TOP_ALLOWANCE_IN,
    towerHeightIn, usableHeightIn: usableTowerHeightIn(input.clearHeightFt),
    armPitchIn, braceSetsPerBay,
    singleDepthFt, doubleDepthFt,
    linearFt, alongFt: alongFullFt, acrossFt,
    usedFt: usedFtRows, spareFt: acrossFt - usedFtRows,
  };
}

/** What the layout cannot decide for itself. */
export function cantileverChecks(
  input: CantileverRunInput, layout: CantileverRunLayout,
): Flag[] {
  const out: Flag[] = [];

  if (layout.towersPerRun < 3) {
    out.push({
      severity: 'check', category: 'support',
      title: 'Material lands on only two towers',
      detail: `A ${layout.productLengthFt} ft piece spans ${layout.spanFt} ft between two `
        + `towers. Three points of support is normal practice — anything under about 12 ft is `
        + `carried at two, so confirm the deflection with a dealer before ordering.`,
    });
  }

  if (layout.towerHeightIn > layout.usableHeightIn) {
    const over = layout.towerHeightIn - layout.usableHeightIn;
    const fits = cantileverLevels(input.clearHeightFt, layout.armPitchIn);
    out.push({
      severity: 'blocking', category: 'height',
      title: 'The tower does not fit under the sprinklers',
      detail: `${layout.levels} arm levels at ${layout.armPitchIn} in, on a `
        + `${layout.baseHeightIn} in base and carrying ${layout.topAllowanceIn} in of column `
        + `above the top arm for the load on it, needs ${layout.towerHeightIn} in of tower. `
        + `This building allows ${layout.usableHeightIn} in — ${input.clearHeightFt} ft clear `
        + `less ${LONG_HEAD_CLEARANCE_IN} in for the sprinkler heads — so the tower runs `
        + `${over} in over. Drop to ${fits} arm levels at this spacing, or bring the spacing `
        + `down.`,
    });
  }

  if (layout.short) {
    out.push({
      severity: 'blocking', category: 'capacity',
      title: 'This building will not hold that much',
      detail: `This building fits about ${layout.maxLinearFt.toLocaleString()} linear feet of `
        + `cantilever. You asked for ${(layout.linearFeetNeededFt ?? 0).toLocaleString()}. A wider `
        + `building, closer tower centres or another 4 ft of clear height would close the gap.`,
    });
  }

  if (layout.columns.length > 0 && !layout.columnsSolved) {
    out.push({
      severity: 'check', category: 'columns',
      title: 'The towers are not yet laid out around the columns',
      detail: `${layout.columns.length} building columns are drawn on the plan, but the runs have `
        + `not been slid to clear them the way pallet rows are. A tower landing on a column moves, `
        + `and a run that cannot clear one loses a bay — so treat the `
        + `${layout.linearFt.toLocaleString()} linear feet as the figure before that adjustment.`,
    });
  }

  if (layout.runsPerRow === 0) {
    out.push({
      severity: 'blocking', category: 'layout',
      title: 'No run fits along this building',
      detail: `A ${layout.runLengthFt} ft run will not fit in ${layout.alongFt.toFixed(0)} ft of `
        + `usable length. Shorten the product or run the rows the other way.`,
    });
  }

  if (layout.rows === 0) {
    out.push({
      severity: 'blocking', category: 'layout',
      title: 'No row fits across this building',
      detail: `A ${layout.singleDepthFt.toFixed(1)} ft row plus its aisle will not fit in `
        + `${layout.acrossFt.toFixed(0)} ft. Shorten the arms or narrow the aisle.`,
    });
  }

  return out;
}

/** Typical unit weights, lb — freight sizing only. Replace with catalogue data. */
export const CANTILEVER_WEIGHTS = {
  towerLbPerFt: 14,
  baseLbPerIn: 1.1,
  armLbPerIn: 0.9,
  xBraceSet: 11,
  horizontalTie: 8,
  anchorBolt: 0.6,
};

/**
 * Counts the material from the runs as drawn, summing per row so a wall row
 * is not billed for arms it does not carry.
 *
 * Cantilever really is modular, so unlike a drive-in or push-back layout these
 * quantities are countable. What this cannot do is rate anything: arm capacity
 * comes from the manufacturer's chart for a given profile, arm length and
 * deflection limit, and so does the tower section.
 */
export function cantileverBom(layout: CantileverRunLayout): Bom {
  const towers = layout.rows * layout.runsPerRow * layout.towersPerRun;
  const baysPerRow = layout.runsPerRow * Math.max(0, layout.towersPerRun - 1);
  const braceSets = layout.rows * baysPerRow * layout.braceSetsPerBay;
  const towersPerRow = layout.runsPerRow * layout.towersPerRun;
  const arms = layout.rowSides.reduce(
    (sum, sides) => sum + towersPerRow * layout.levels * sides, 0);

  const towerFt = layout.towerHeightIn / 12;
  const levelsNote = `${layout.levels} arm levels plus the base, ${layout.storageLevels} storing`;
  const sidesNote = layout.wallRows > 0 && layout.interiorRows > 0
    ? `${layout.wallRows} wall rows single-sided, ${layout.interiorRows} interior rows double`
    : layout.interiorRows > 0 ? 'interior rows, double-sided' : 'wall rows, single-sided';

  const lines: BomLine[] = [
    line('Structure', 'Tower', `${towerFt.toFixed(1)} ft column — ${levelsNote}; ${sidesNote}`,
      towers, +(towerFt * CANTILEVER_WEIGHTS.towerLbPerFt).toFixed(1)),
    line('Structure', 'Base', `${layout.baseLengthIn} in base, one per armed face`,
      layout.bases, +(layout.baseLengthIn * CANTILEVER_WEIGHTS.baseLbPerIn).toFixed(1)),
    line('Arms', 'Arm', `${layout.armLengthIn} in reach, ${layout.levels} levels at ${layout.armPitchIn} in pitch`,
      arms, +(layout.armLengthIn * CANTILEVER_WEIGHTS.armLbPerIn).toFixed(1)),
    line('Bracing', 'X-brace set', `${ftIn(layout.towerCentresFt)} span, ${layout.braceSetsPerBay} per bay`,
      braceSets, CANTILEVER_WEIGHTS.xBraceSet),
    line('Bracing', 'Horizontal tie', `${ftIn(layout.towerCentresFt)} span, one per brace set`,
      braceSets, CANTILEVER_WEIGHTS.horizontalTie),
    line('Fixings', 'Anchor bolt', 'two per tower into the slab',
      towers * 2, CANTILEVER_WEIGHTS.anchorBolt),
  ];

  const totalWeightLb = lines.reduce((s, l) => s + l.totalWeightLb, 0);
  return {
    lines,
    totalWeightLb,
    truckloads: Math.max(1, Math.ceil(totalWeightLb / TRUCK_PAYLOAD_LB)),
  };
}

/** Feet and inches, as a drawing states a dimension. */
export function ftIn(ft: number): string {
  const whole = Math.floor(ft + 1e-9);
  const inches = Math.round((ft - whole) * 12);
  return inches === 12 ? `${whole + 1}'-0"` : `${whole}'-${inches}"`;
}

const line = (group: string, item: string, description: string,
              qty: number, unitWeightLb: number): BomLine => ({
  group, item, description, qty, unitWeightLb,
  totalWeightLb: +(qty * unitWeightLb).toFixed(1),
});

/** The envelope left once the building's other work has taken its share. */
function availableAlong(alongFt: number, acrossFt: number, a?: Availability): number {
  if (!a || a.mode === 'all') return alongFt;
  if (a.mode === 'fraction') {
    return alongFt * Math.min(1, Math.max(0.05, a.fraction ?? 1));
  }
  if (!Number.isFinite(a.sqFt) || a.sqFt <= 0 || acrossFt <= 0) return alongFt;
  return Math.min(alongFt, a.sqFt / acrossFt);
}

/** Where the cross aisles fall along a row of runs, in envelope feet. */
/**
 * Where each run starts along a row, laid into the building's segments.
 *
 * The same segments the pallet zone uses, so an aisle at 80 ft is at 80 ft in
 * both and the gap reads as one route across the floor. A run never straddles
 * an aisle: what will not fit in a segment is spare.
 */
export function runStarts(
  usableAlongFt: number, runLengthFt: number, crossAisles: number,
): number[] {
  if (runLengthFt <= 0) return [];
  return fillSegments(
    crossAisleSpans(usableAlongFt, crossAisles),
    runLengthFt, runLengthFt + CANTILEVER_RUN_GAP_FT);
}

/**
 * How many rows of what kind, for a given demand and a given width.
 *
 * One walk, used both for "house this much stock" and for "what could this
 * building ever hold" — the second is the first with a demand nothing can
 * satisfy. Everything the drawing shows and the placard reports comes from the
 * list this returns, so the two cannot describe different buildings.
 */
export function solveRows(a: {
  neededFt: number;
  widthFt: number;
  singleDepthFt: number;
  doubleDepthFt: number;
  aisleFt: number;
  /** Linear feet one run of one face carries. */
  capacityPerRun: number;
  runsPerRow: number;
  /** A strip against one wall is only ever so many rows deep. */
  maxRows?: number;
}): {
  rowSides: (1 | 2)[]; runsInLastRow: number; builtFt: number; usedFt: number; shortFt: number;
} {
  const rowSides: (1 | 2)[] = [];
  const capacity = (sides: 1 | 2) => a.capacityPerRun * a.runsPerRow * sides;
  const singlePitch = a.singleDepthFt + a.aisleFt;
  const doublePitch = a.doubleDepthFt + a.aisleFt;

  let remaining = a.neededFt;
  let widthLeft = a.widthFt;
  let usedFt = 0;
  let runsInLastRow = a.runsPerRow;
  let builtFt = 0;

  /** Takes only the runs the remaining demand calls for. */
  const place = (sides: 1 | 2, pitch: number) => {
    const perRow = a.capacityPerRun * sides;
    const runs = Number.isFinite(remaining) && perRow > 0
      ? Math.max(1, Math.min(a.runsPerRow, Math.ceil(remaining / perRow)))
      : a.runsPerRow;
    rowSides.push(sides);
    runsInLastRow = runs;
    const built = perRow * runs;
    builtFt += built;
    remaining -= built;
    widthLeft -= pitch;
    usedFt += pitch;
  };

  if (a.runsPerRow > 0 && a.capacityPerRun > 0) {
    // One wall row first: the cheapest footprint, and it braces back to the wall.
    const room = () => a.maxRows === undefined || rowSides.length < a.maxRows;
    if (remaining > 0 && room() && widthLeft >= singlePitch) place(1, singlePitch);

    // Then doubles, which are the row that earns its width.
    while (remaining > 0 && room() && widthLeft >= doublePitch) place(2, doublePitch);

    // A second single only as a last resort: never where a double would fit.
    const canFitDouble = widthLeft >= doublePitch;
    const canFitSingle = widthLeft >= a.singleDepthFt;
    if (remaining > 0 && room() && !canFitDouble && canFitSingle) place(1, a.singleDepthFt);
  }

  // the last row carries no aisle behind it
  if (rowSides.length > 0) usedFt -= a.aisleFt;

  return {
    rowSides, runsInLastRow, builtFt,
    usedFt: Math.max(0, usedFt),
    shortFt: Number.isFinite(remaining) ? Math.max(0, remaining) : 0,
  };
}
