import {
  CANTILEVER_AISLE_MIN_FT, MIXED_CANT_ROWS, TRUCK_PAYLOAD_LB,
} from './constants.js';
import {
  cantileverChecks, cantileverRowDepthsFt, layoutCantileverRuns,
  type CantileverRunInput, type CantileverRunLayout,
} from './cantileverruns.js';
import {
  layoutRack, type Availability, type Orientation, type RackLayout, type RackLayoutInput,
} from './racklayout.js';
import { rackType, type RackKind } from './racktypes.js';
import type { Bom, BomLine, Flag } from './types.js';

/**
 * A cantilever strip down one wall, pallet racking filling the rest.
 *
 * This is how these buildings are actually laid out. Long stock needs a clear
 * run and is awkward to handle mid-floor, and a wall run can be single-sided,
 * which halves its footprint — so the mixed case is a strip down one side, not
 * arbitrary zones.
 *
 * Three rules carry it.
 *
 * **The strip is solved first.** Its rows are asked for, not fitted, and the
 * pallet solver then runs against what is left rather than the whole width.
 *
 * **The shared aisle takes the larger width.** A truck handling 20 ft stock
 * needs more room to turn than one handling pallets, so the aisle between the
 * last cantilever row and the first pallet row is sized for the long load. That
 * is a safety matter, not a preference.
 *
 * **Neither zone treats their shared edge as a wall.** A wall forces a single
 * row because nobody can reach the far side of a pair; an aisle does not. Both
 * solvers are told how many real walls bound them and count accordingly.
 *
 * Both solvers are called, never reimplemented — the arithmetic that fills a
 * building with racking lives in one place per family.
 */

export type MixedWall = 'top' | 'bottom';

/**
 * Which family gets the building first.
 *
 * Both cannot have it. Linear feet is a figure the customer stated, while
 * pallet positions are what is left over — so the strip leads by default, and
 * the trade-off line already reports what that costs. Choosing pallets instead
 * holds the strip to a minimum and lets the shortfall be the thing that is
 * priced, which is a legitimate answer but has to be a decision, not a default.
 */
export type MixedPriority = 'cantilever' | 'pallets';

export interface MixedCantileverInput {
  /**
   * Linear feet of arm needed. The strip takes only the rows that houses, so
   * asking for less long-goods storage leaves more building for pallets —
   * which is the trade this view exists to show.
   */
  linearFeetNeededFt: number;
  productLengthFt: number;
  armLengthIn: number;
  levels?: number;
  armSpacingIn?: number;
}

export interface MixedPalletInput {
  kind: RackKind;
  beamLengthIn: number;
  palletsPerBay: number;
  /** Pallet levels including the floor level. */
  levels: number;
  frameDepthIn: number;
  aisleWidthFt: number;
  deep?: number;
}

export interface MixedInput {
  buildingLengthFt: number;
  buildingWidthFt: number;
  clearHeightFt: number;
  wallClearanceFt: number;
  orientation: Orientation;
  /** How much of the footprint is free for racking — both zones share it. */
  available?: Availability;
  /** The building's columns, which both zones are laid out around. */
  gridXFt?: number;
  gridYFt?: number;
  /**
   * Cross aisles, which are a property of the building rather than of either
   * family. A cross aisle cuts a cantilever run exactly as it cuts a pallet
   * row, so both zones are given the same figure and both lose bays to it.
   * Undefined leaves it to each solver's own reading of its run length.
   */
  crossAisles?: number;
  cantilever: MixedCantileverInput;
  pallet: MixedPalletInput;
  /** Defaults to the cantilever: it is the family with a stated requirement. */
  priority?: MixedPriority;
}

export interface MixedLayout {
  /** Always the first wall: which side it sits on is not worth a question. */
  wall: MixedWall;
  strip: CantileverRunLayout;
  pallets: RackLayout;
  /** The same racking filling the whole building — what the strip costs. */
  palletsAlone: RackLayout;

  /** Rows in the strip, after clamping. */
  cantileverRows: number;
  /** The strip's rows and its own aisles, ft. Excludes the shared aisle. */
  stripDepthFt: number;
  /** Aisles inside the strip, sized for the long load. */
  cantileverAisleFt: number;
  /** Sized for the long load, so usually wider than the pallet aisle. */
  sharedAisleFt: number;
  /** Width the strip takes off the pallet zone: its depth plus that aisle. */
  stripTotalDepthFt: number;
  /** Across-axis feet left for pallet racking, inside the wall clearances. */
  palletWidthFt: number;
  /** Across-axis feet inside the wall clearances, before the strip. */
  acrossFt: number;

  /** Pallet positions the strip costs. Never negative. */
  positionsCost: number;
  /** True where both zones actually fit. */
  fits: boolean;

  /** Which family took the building first. */
  priority: MixedPriority;
  /** Linear feet short of the requirement. 0 where it was met. */
  shortFt: number;
  /**
   * Linear feet this building holds as cantilever with no pallet racking at
   * all — the ceiling a shortfall is measured against, so a flag can say
   * whether the requirement is impossible here or merely crowded out.
   */
  wholeBuildingLinearFt: number;
}

/** The strip's own aisles, and the one it shares with the pallet racking. */
export function mixedAisles(palletAisleFt: number): {
  cantileverAisleFt: number; sharedAisleFt: number;
} {
  const cantileverAisleFt = Math.max(palletAisleFt, CANTILEVER_AISLE_MIN_FT);
  return { cantileverAisleFt, sharedAisleFt: Math.max(palletAisleFt, cantileverAisleFt) };
}

/**
 * The most cantilever rows this building can take and still hold pallet racking.
 *
 * "Cantilever first" is not "cantilever only": the strip may grow until one
 * pallet row and its aisle would no longer fit, and no further. The solver
 * stops as soon as the linear feet are met, so this is a ceiling, not a target.
 */
export function maxStripRows(input: MixedInput): number {
  const { cantileverAisleFt, sharedAisleFt } = mixedAisles(input.pallet.aisleWidthFt);
  const { singleDepthFt, doubleDepthFt } = cantileverRowDepthsFt(input.cantilever.armLengthIn);
  const acrossFt =
    (input.orientation === 'length' ? input.buildingWidthFt : input.buildingLengthFt) -
    input.wallClearanceFt * 2;

  // one pallet row and the aisle to reach it, kept back whatever else happens
  const keepFt = input.pallet.frameDepthIn / 12 + input.pallet.aisleWidthFt;
  let left = acrossFt - sharedAisleFt - keepFt;
  if (left < singleDepthFt) return MIXED_CANT_ROWS.min;

  let rows = 1;
  left -= singleDepthFt;
  while (left >= doubleDepthFt + cantileverAisleFt) {
    rows += 1;
    left -= doubleDepthFt + cantileverAisleFt;
  }
  return Math.max(MIXED_CANT_ROWS.min, rows);
}

/** What the cantilever solver is asked, so checks can be run against it too. */
export function mixedStripInput(input: MixedInput): CantileverRunInput {
  const { cantileverAisleFt } = mixedAisles(input.pallet.aisleWidthFt);
  return {
    buildingLengthFt: input.buildingLengthFt,
    buildingWidthFt: input.buildingWidthFt,
    clearHeightFt: input.clearHeightFt,
    aisleWidthFt: cantileverAisleFt,
    wallClearanceFt: input.wallClearanceFt,
    orientation: input.orientation,
    productLengthFt: input.cantilever.productLengthFt,
    armLengthIn: input.cantilever.armLengthIn,
    levels: input.cantilever.levels,
    armSpacingIn: input.cantilever.armSpacingIn,
    available: input.available,
    gridXFt: input.gridXFt,
    gridYFt: input.gridYFt,
    // Offered every row a strip can be, and told what has to fit in it; it
    // takes the rows that need and no more.
    // The row cap is the whole of what priority means here: leading, the strip
    // may grow to whatever leaves a pallet row standing; following, it is held
    // to the minimum and the pallet zone gets the rest.
    stripRows: (input.priority ?? 'cantilever') === 'pallets'
      ? MIXED_CANT_ROWS.min : maxStripRows(input),
    crossAisles: input.crossAisles,
    linearFeetNeededFt: input.cantilever.linearFeetNeededFt,
  };
}

/** The pallet solver's input, either against the whole building or what is left. */
function palletInputFor(
  input: MixedInput, acrossReductionFt: number, wallsAcross: 1 | 2,
): RackLayoutInput {
  const alongIsLength = input.orientation === 'length';
  return {
    ...input.pallet,
    buildingLengthFt: alongIsLength
      ? input.buildingLengthFt : input.buildingLengthFt - acrossReductionFt,
    buildingWidthFt: alongIsLength
      ? input.buildingWidthFt - acrossReductionFt : input.buildingWidthFt,
    wallClearanceFt: input.wallClearanceFt,
    orientation: input.orientation,
    wallsAcross,
    // Both zones stand in the same building: the same floor is unavailable,
    // the same columns come through it, and the same cross aisles cut it.
    available: input.available,
    gridXFt: input.gridXFt,
    gridYFt: input.gridYFt,
    crossAisles: input.crossAisles,
  };
}

export function layoutMixed(input: MixedInput): MixedLayout {
  const { cantileverAisleFt, sharedAisleFt } = mixedAisles(input.pallet.aisleWidthFt);

  const strip = layoutCantileverRuns(mixedStripInput(input));
  // The ceiling a shortfall is measured against: no strip cap, no pallet zone.
  const wholeBuilding = layoutCantileverRuns(
    { ...mixedStripInput(input), stripRows: undefined, linearFeetNeededFt: undefined });
  const cantileverRows = strip.rows;
  const priority: MixedPriority = input.priority ?? 'cantilever';
  const stripDepthFt = strip.usedFt;
  const stripTotalDepthFt = stripDepthFt + sharedAisleFt;

  const acrossFt =
    (input.orientation === 'length' ? input.buildingWidthFt : input.buildingLengthFt) -
    input.wallClearanceFt * 2;
  const palletWidthFt = acrossFt - stripTotalDepthFt;

  // One wall, not two: the pallet zone's other edge is the shared aisle.
  const pallets = layoutRack(input.pallet.kind, palletInputFor(input, stripTotalDepthFt, 1));
  const palletsAlone = layoutRack(input.pallet.kind, palletInputFor(input, 0, 2));

  return {
    wall: 'top',
    strip, pallets, palletsAlone,
    cantileverRows, stripDepthFt, cantileverAisleFt, sharedAisleFt, stripTotalDepthFt,
    palletWidthFt, acrossFt,
    positionsCost: Math.max(0, palletsAlone.positions - pallets.positions),
    fits: palletWidthFt > 0 && pallets.rows > 0 && strip.runsPerRow > 0,
    priority,
    shortFt: Math.max(0, Math.round((strip.linearFeetNeededFt ?? 0) - strip.linearFt)),
    wholeBuildingLinearFt: wholeBuilding.linearFt,
  };
}

const axis = (o: Orientation) => (o === 'length' ? 'along the length' : 'across the width');

/**
 * What the mix cannot decide for itself, plus everything the strip alone would
 * have raised — the customer sees one list, not one per zone.
 */
export function mixedChecks(input: MixedInput, layout: MixedLayout): Flag[] {
  const out: Flag[] = [];

  if (!layout.fits) {
    const short = Math.max(0, Math.ceil(layout.stripTotalDepthFt - layout.acrossFt));
    out.push({
      severity: 'blocking', category: 'layout',
      title: 'This building is too narrow for both',
      detail: `A ${layout.cantileverRows}-row cantilever strip takes `
        + `${layout.stripTotalDepthFt.toFixed(1)} ft of the `
        + `${layout.acrossFt.toFixed(0)} ft available, which leaves `
        + `${layout.palletWidthFt.toFixed(1)} ft for pallet racking — not enough for a row and `
        + `its aisle. ${short > 0 ? `The strip alone is ${short} ft over. ` : ''}`
        + `Drop to one cantilever row, shorten the arms, or store one family here and the other `
        + `elsewhere.`,
    });
  }

  // A figure lower than what was asked for is not an answer. Either this
  // building cannot hold it at all, or the pallet racking is standing in the
  // way — and those are different problems with different remedies, so the
  // alternative has to be solved before either can be named.
  if (layout.shortFt > 0) {
    const needed = layout.strip.linearFeetNeededFt ?? 0;

    if (needed > layout.wholeBuildingLinearFt) {
      out.push({
        severity: 'blocking', category: 'capacity',
        title: 'This building will not hold that much long stock',
        detail: `Given over to cantilever entirely, with no pallet racking at all, this `
          + `building fits about ${layout.wholeBuildingLinearFt.toLocaleString()} linear feet. `
          + `You asked for ${needed.toLocaleString()}, so the `
          + `${layout.shortFt.toLocaleString()} ft shortfall is the building, not the mix. `
          + `A wider building, closer tower centres or another 4 ft of clear height would `
          + `close the gap.`,
      });
    } else {
      // It fits here — something else is holding the width. Price that.
      const alt = layoutMixed({ ...input, priority: 'cantilever' });
      const moreRows = Math.max(0, alt.strip.rows - layout.strip.rows);
      const costPositions = Math.max(0, layout.pallets.positions - alt.pallets.positions);
      out.push({
        severity: 'blocking', category: 'capacity',
        title: 'The pallet racking is taking the width the long stock needs',
        detail: `This building fits ${layout.strip.linearFt.toLocaleString()} of the `
          + `${needed.toLocaleString()} linear ft you asked for alongside the pallet `
          + `racking. Meeting it in full would take ${moreRows} more cantilever `
          + `${moreRows === 1 ? 'row' : 'rows'} and cost about `
          + `${costPositions.toLocaleString()} pallet positions. Switch PRIORITY to `
          + `cantilever first, or reduce what you store.`,
      });
    }
  }

  // Both families share one orientation, so a gain for one can be a loss for
  // the other. Solving the alternative is the only way to price that.
  const other: Orientation = input.orientation === 'length' ? 'width' : 'length';
  const alt = layoutMixed({ ...input, orientation: other });
  const dPositions = alt.pallets.positions - layout.pallets.positions;
  const dLinear = alt.strip.linearFt - layout.strip.linearFt;

  if (layout.fits && alt.fits && (dPositions !== 0 || dLinear !== 0)) {
    const bothBetter = dPositions > 0 && dLinear > 0;
    const trade = (dPositions > 0 && dLinear < 0) || (dPositions < 0 && dLinear > 0);
    if (bothBetter) {
      out.push({
        severity: 'check', category: 'orientation',
        title: 'The other orientation suits both families',
        detail: `Rows running ${axis(input.orientation)} cost about `
          + `${dPositions.toLocaleString()} pallet positions and ${dLinear.toLocaleString()} `
          + `linear feet of arm against running them ${axis(other)}. Both families have to share `
          + `one orientation — switch ROWS RUN to take both.`,
      });
    } else if (trade) {
      const gains = dPositions > 0 ? 'pallet racking' : 'cantilever strip';
      out.push({
        severity: 'check', category: 'orientation',
        title: `Rows running ${axis(input.orientation)} suit one family, not both`,
        detail: `This orientation suits the ${dPositions > 0 ? 'cantilever strip' : 'pallet racking'}. `
          + `Running them ${axis(other)} would trade about `
          + `${Math.abs(dLinear).toLocaleString()} linear feet of arm for `
          + `${Math.abs(dPositions).toLocaleString()} pallet positions, in the ${gains}'s favour. `
          + `Both families have to share one orientation, so this is a choice, not a fault.`,
      });
    }
  }

  // The strip's own shortfall flag is written for a building given over to
  // cantilever, and measures against a capped strip. Here the mixed flag above
  // says the same thing with the pallet racking in the frame, so the customer
  // gets one account of the shortfall rather than two that disagree.
  const stripFlags = cantileverChecks(mixedStripInput(input), layout.strip)
    .filter((f) => !(layout.shortFt > 0 && f.category === 'capacity'));

  return [...out, ...stripFlags];
}

/**
 * One bill, two sections.
 *
 * Each family's parts are counted by its own solver; this only files them under
 * a heading and re-totals. A pallet type whose material is rails or carts has
 * no countable bill, so its section is left out and the caller shows the dealer
 * hand-off in its place — the cantilever parts are still countable either way.
 */
export function mixedBom(cantilever: Bom, pallets: Bom | null): Bom {
  const file = (b: Bom, group: string): BomLine[] =>
    b.lines.map((l) => ({ ...l, group, item: l.item, description: l.description }));

  const lines = [
    ...file(cantilever, 'Cantilever'),
    ...(pallets ? file(pallets, 'Pallet racking') : []),
  ];
  const totalWeightLb = lines.reduce((s, l) => s + l.totalWeightLb, 0);
  return {
    lines,
    totalWeightLb,
    truckloads: Math.max(1, Math.ceil(totalWeightLb / TRUCK_PAYLOAD_LB)),
  };
}

/** True where the pallet family in play has a countable bill. */
export function palletBomIsCountable(kind: RackKind): boolean {
  return rackType(kind).standardBom;
}
