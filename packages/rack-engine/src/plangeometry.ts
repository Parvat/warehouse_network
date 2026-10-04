import { DOCK_APRON_FT } from './constants.js';
import type { CantileverRunLayout } from './cantileverruns.js';
import type { MixedLayout } from './mixedlayout.js';
import type { Orientation, RackLayout } from './racklayout.js';
import { rackType, type RackKind } from './racktypes.js';
import { laneFrameHeightIn } from './spec.js';
import type { RackSpec } from './types.js';

/**
 * Where everything on a plan stands, in the building's own feet.
 *
 * The solvers say how many rows, bays, runs and towers there are and where
 * each starts within its own zone. The plan drawings and the 3D view both need
 * the same thing one step further on: every band, aisle, flue, column line and
 * arm set placed in the building. That step used to be taken three times, once
 * in each plan figure, each with its own cursor walking across the floor — and
 * a fourth copy for 3D would have been a fourth chance to disagree. It is taken
 * once, here.
 *
 * Two axes, named the way the drawings name them:
 *
 * - **along** (`aFt`) runs the way the rows run, from the wall the dock doors
 *   are on. Racking starts at `alongStartFt`, past the wall clearance and the
 *   dock apron.
 * - **across** (`cFt`) runs across the rows, from the inside of the wall the
 *   first row stands against.
 *
 * Which building axis each is follows the orientation: rows along the length
 * put along on the length; rows across the width put along on the width.
 */

/**
 * The dock doors, as fractions of the wall they stand on: where each starts
 * and how long each is. One place, so the plan's door marks and the 3D doors
 * stand in the same spots.
 */
export const DOCK_DOORS = { starts: [0.18, 0.5, 0.82], length: 0.11 } as const;

/** A strip across the building, from `cFt` for `depthFt`. */
export interface AcrossSpan {
  cFt: number;
  depthFt: number;
}

/** A band of pallet racking: one row, or one lane block. */
export interface GeomRackBand extends AcrossSpan {
  /** Pallets deep in this band. */
  deep: number;
  /**
   * Which ends of a drive-in or drive-through block a truck drives into, in
   * building terms: `near` is the end at the lower `cFt`. Empty for every
   * other type — a flow lane is loaded at one end and picked at the other, and
   * a push-back row is worked from its face.
   */
  openEnds: readonly ('near' | 'far')[];
  /**
   * A pallet-flow block: the end it is loaded from and the end it is picked
   * from. Pallets roll from load to pick.
   */
  flow?: { load: 'near' | 'far'; pick: 'near' | 'far' };
  /**
   * A push-back row: the side facing its aisle, where it is both loaded and
   * picked — pallets push back from there, and come forward to it.
   */
  face?: 'near' | 'far';
}

/** How the lanes of a zone are reached, so the plan can key what it draws. */
export type LaneAccess = 'entry' | 'flow' | 'face';

export interface GeomPalletZone {
  kind: RackKind;
  /** Lanes rather than beam bays: no beam crosses where the truck drives. */
  lanes: boolean;
  /** How this zone's lanes are reached; absent for selective and double-deep. */
  access?: LaneAccess;
  bands: readonly GeomRackBand[];
  flues: readonly AcrossSpan[];
  aisles: readonly AcrossSpan[];
  /** Where each bay (or lane) starts, along. */
  bayStartsFt: readonly number[];
  bayLengthFt: number;
  /** Pallets side by side in one bay or lane. */
  palletsAcross: number;
  layout: RackLayout;
}

/** One row of cantilever. */
export interface GeomCantRow extends AcrossSpan {
  sides: 1 | 2;
  /** The column line. */
  colCFt: number;
  /** The reach of the arms across the row, low to high. */
  armFromCFt: number;
  armToCFt: number;
  /** Which way the arms point across: -1 towards lower `cFt`, +1 higher. */
  armDirs: readonly (-1 | 1)[];
  /** Runs this row carries — the last row of a strip may stop short. */
  runs: number;
}

export interface GeomCantZone {
  rows: readonly GeomCantRow[];
  aisles: readonly AcrossSpan[];
  /** Where each run starts, along: the run is the product, ends overhanging. */
  runStartsFt: readonly number[];
  runLengthFt: number;
  overhangFt: number;
  towersPerRun: number;
  towerCentresFt: number;
  spanFt: number;
  layout: CantileverRunLayout;
}

/** The heights a 3D view needs, from the same spec the elevation draws. */
export interface PalletHeights {
  /** Where a pallet rests at each level, floor first. */
  levelFt: readonly number[];
  /** A beam's face: it sits under each level above the floor. */
  beamFaceFt: number;
  frameHeightFt: number;
  /** The load: width along the bay, depth across it, height. */
  palletWidthFt: number;
  palletDepthFt: number;
  loadHeightFt: number;
}

export interface CantileverHeights {
  towerHeightFt: number;
  baseHeightFt: number;
  /** The top of each arm, bottom first. Product also rests on the base. */
  armTopFt: readonly number[];
  armLengthFt: number;
  /** Bracing sets up a tower's height. */
  braceSets: number;
}

export interface PlanGeometry {
  buildingLengthFt: number;
  buildingWidthFt: number;
  orientation: Orientation;
  wallClearanceFt: number;
  /** Racking starts here along, past the clearance and the dock apron. */
  alongStartFt: number;
  dockApronFt: number;
  /** The building's extent along and across. */
  alongFt: number;
  acrossFt: number;
  pallets?: GeomPalletZone;
  cantilever?: GeomCantZone;
  /** The aisle a cantilever strip shares with the pallet zone. */
  sharedAisle?: AcrossSpan;
  /** Where each cross aisle starts along, and how wide it is. */
  crossAisles: readonly { aFt: number; widthFt: number }[];
}

export interface PlanFrame {
  buildingLengthFt: number;
  buildingWidthFt: number;
  wallClearanceFt: number;
  orientation: Orientation;
}

function base(frame: PlanFrame): Omit<PlanGeometry, 'crossAisles'> {
  const alongIsLength = frame.orientation === 'length';
  return {
    buildingLengthFt: frame.buildingLengthFt,
    buildingWidthFt: frame.buildingWidthFt,
    orientation: frame.orientation,
    wallClearanceFt: frame.wallClearanceFt,
    alongStartFt: frame.wallClearanceFt + DOCK_APRON_FT,
    dockApronFt: DOCK_APRON_FT,
    alongFt: alongIsLength ? frame.buildingLengthFt : frame.buildingWidthFt,
    acrossFt: alongIsLength ? frame.buildingWidthFt : frame.buildingLengthFt,
  };
}

/**
 * A pallet zone's bands in building feet.
 *
 * `place` maps a span the solver measured from the zone's own near edge to the
 * building: straight on for a zone that starts at a wall, mirrored for one laid
 * in from the far wall. `nearIsFront` says whether the solver's "front" end of
 * a lane block is the building's near end after that mapping. `sharedAisles`
 * are aisles this zone faces that it does not own — on a mixed floor, the one
 * it shares with the strip.
 */
function palletZone(
  kind: RackKind, L: RackLayout, alongStartFt: number,
  place: (s: { start: number; depth: number }) => AcrossSpan, nearIsFront: boolean,
  sharedAisles: readonly AcrossSpan[] = [],
): GeomPalletZone {
  const R = rackType(kind);
  const lane = R.pick === 'lane';
  const access: LaneAccess | undefined = kind === 'flow' ? 'flow'
    : lane ? 'entry' : kind === 'pushback' ? 'face' : undefined;
  const front = nearIsFront ? 'near' : 'far', back = nearIsFront ? 'far' : 'near';
  const aisles = L.aislesFt.map(place);
  const all = [...aisles, ...sharedAisles];
  const touches = (x: number) => all.some((a) => Math.abs(a.cFt - x) < 0.01 || Math.abs(a.cFt + a.depthFt - x) < 0.01);

  const bands: GeomRackBand[] = L.bandsFt.map((b, i) => {
    const span = place(b);
    const band: GeomRackBand = {
      ...span,
      deep: L.deep,
      openEnds: access !== 'entry' ? []
        : R.openEnds === 2 ? ['near', 'far']
          : [L.blockAccess[i] === 'back' ? back : front],
    };
    if (access === 'flow') {
      /*
       * Neighbouring flow blocks run opposite ways, so each pair picks into
       * the aisle between them and loads from the aisles either side: one pick
       * face for two blocks, which is how flow lanes are laid out. The first
       * block, from the solver's near edge, picks at its back.
       */
      const pickBack = i % 2 === 0;
      band.flow = { load: pickBack ? front : back, pick: pickBack ? back : front };
    }
    if (access === 'face') {
      // the side that touches an aisle — not the flue it is paired across, nor a wall
      const nearOpen = touches(span.cFt), farOpen = touches(span.cFt + span.depthFt);
      if (nearOpen || farOpen) band.face = farOpen && !nearOpen ? 'far' : 'near';
    }
    return band;
  });
  return {
    kind, lanes: lane, access, bands,
    flues: L.fluesFt.map(place),
    aisles,
    bayStartsFt: L.bayStartsFt.map((b) => alongStartFt + b),
    bayLengthFt: L.bayLengthFt,
    palletsAcross: L.palletsAcross,
    layout: L,
  };
}

/** A cantilever strip's rows in building feet; see `palletZone` for `place`. */
function cantZone(
  S: CantileverRunLayout, alongStartFt: number,
  place: (s: { start: number; depth: number }) => AcrossSpan, mirrored: boolean,
): GeomCantZone {
  const armFt = S.armLengthIn / 12;
  const rows: GeomCantRow[] = S.rowSides.map((sides, r) => {
    const span = place(S.bandsFt[r] ?? { start: 0, depth: 0 });
    /*
     * A wall row is reached only from the aisle, so its column stands on the
     * wall side and its arms reach away from the wall.
     *
     * The solver lays its first single row against the near wall and only ever
     * puts a second single at the far wall, as a last resort — so a single row
     * is at the far wall when it is the last of several, never when it is the
     * only one. Mirrored, the near wall of the zone is the building's far side.
     */
    const atFarOfZone = sides === 1 && r > 0 && r === S.rows - 1;
    const wallAtHigh = atFarOfZone !== mirrored;
    const colCFt = sides === 2 ? span.cFt + span.depthFt / 2
      : wallAtHigh ? span.cFt + span.depthFt : span.cFt;
    const armDirs: (-1 | 1)[] = sides === 2 ? [-1, 1] : wallAtHigh ? [-1] : [1];
    return {
      ...span, sides, colCFt,
      armFromCFt: armDirs.includes(-1) ? colCFt - armFt : colCFt,
      armToCFt: armDirs.includes(1) ? colCFt + armFt : colCFt,
      armDirs,
      runs: r === S.rows - 1 ? S.runsInLastRow : S.runsPerRow,
    };
  });
  return {
    rows,
    aisles: S.aislesFt.map(place),
    runStartsFt: S.runStartsFt.map((x) => alongStartFt + x),
    runLengthFt: S.runLengthFt,
    overhangFt: S.overhangFt,
    towersPerRun: S.towersPerRun,
    towerCentresFt: S.towerCentresFt,
    spanFt: S.spanFt,
    layout: S,
  };
}

const crossAislesOf = (alongStartFt: number, atFt: readonly number[], widthFt: number) =>
  atFt.map((a) => ({ aFt: alongStartFt + a, widthFt }));

/** A floor of pallet racking and nothing else. */
export function palletPlanGeometry(kind: RackKind, L: RackLayout, frame: PlanFrame): PlanGeometry {
  const g = base(frame);
  const place = (s: { start: number; depth: number }) =>
    ({ cFt: frame.wallClearanceFt + s.start, depthFt: s.depth });
  return {
    ...g,
    pallets: palletZone(kind, L, g.alongStartFt, place, true),
    crossAisles: crossAislesOf(g.alongStartFt, L.crossAisleAtFt, L.crossAisleWidthFt),
  };
}

/** A floor of cantilever and nothing else. */
export function cantileverPlanGeometry(S: CantileverRunLayout, frame: PlanFrame): PlanGeometry {
  const g = base(frame);
  const place = (s: { start: number; depth: number }) =>
    ({ cFt: frame.wallClearanceFt + s.start, depthFt: s.depth });
  return {
    ...g,
    cantilever: cantZone(S, g.alongStartFt, place, false),
    crossAisles: crossAislesOf(g.alongStartFt, S.crossAisleAtFt, S.crossAisleWidthFt),
  };
}

/**
 * A strip of cantilever down one wall, the aisle it shares, and pallet racking
 * filling the rest — walked in from the strip's wall, as the solver lays it.
 */
export function mixedPlanGeometry(kind: RackKind, M: MixedLayout, frame: PlanFrame): PlanGeometry {
  const g = base(frame);
  const mirrored = M.wall !== 'top';
  const acrossEndFt = g.acrossFt - frame.wallClearanceFt;
  // From the strip's wall, in either direction.
  const fromWall = (offsetFt: number) => (s: { start: number; depth: number }): AcrossSpan => (mirrored
    ? { cFt: acrossEndFt - (offsetFt + s.start + s.depth), depthFt: s.depth }
    : { cFt: frame.wallClearanceFt + offsetFt + s.start, depthFt: s.depth });
  const shared = fromWall(0)({ start: M.stripDepthFt, depth: M.sharedAisleFt });
  return {
    ...g,
    cantilever: cantZone(M.strip, g.alongStartFt, fromWall(0), mirrored),
    sharedAisle: shared,
    // The zone's first rows face the aisle it shares with the strip.
    pallets: palletZone(kind, M.pallets, g.alongStartFt, fromWall(M.stripTotalDepthFt), !mirrored, [shared]),
    // Both zones break at the same feet; the pallet zone's are the floor's.
    crossAisles: crossAislesOf(g.alongStartFt, M.pallets.crossAisleAtFt, M.pallets.crossAisleWidthFt),
  };
}

/** The heights of pallet racking, as the elevation draws them. */
export function palletHeights(kind: RackKind, spec: RackSpec, pallet: {
  widthIn: number; depthIn: number; loadHeightIn: number;
}): PalletHeights {
  const lane = rackType(kind).pick === 'lane';
  const frameIn = lane
    ? laneFrameHeightIn({ levels: spec.levels, levelPitchIn: spec.levelPitchIn, loadHeightIn: pallet.loadHeightIn })
    : spec.frameHeightIn;
  return {
    levelFt: Array.from({ length: spec.levels }, (_, i) => (i * spec.levelPitchIn) / 12),
    beamFaceFt: spec.beamFaceIn / 12,
    frameHeightFt: frameIn / 12,
    palletWidthFt: pallet.widthIn / 12,
    palletDepthFt: pallet.depthIn / 12,
    loadHeightFt: pallet.loadHeightIn / 12,
  };
}

/** The heights of a cantilever tower, as its elevation draws them. */
export function cantileverHeights(S: CantileverRunLayout): CantileverHeights {
  const baseFt = S.baseHeightIn / 12;
  const pitchFt = S.armPitchIn / 12;
  const towerFt = S.towerHeightIn / 12;
  const armTopFt: number[] = [];
  for (let i = 0; i < S.levels; i++) {
    const y = baseFt + (i + 1) * pitchFt;
    if (y > towerFt + 1e-6) break;
    armTopFt.push(y);
  }
  return {
    towerHeightFt: towerFt,
    baseHeightFt: baseFt,
    armTopFt,
    armLengthFt: S.armLengthIn / 12,
    braceSets: S.braceSetsPerBay,
  };
}
