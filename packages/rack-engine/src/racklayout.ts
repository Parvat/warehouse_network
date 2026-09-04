import {
  AVAILABLE_THREE_QUARTERS, BUILDING_COLUMN_IN, COLUMN_FACE_ZONE_FT, COLUMN_PENALTY,
  COLUMN_WIDTH_IN, CROSS_AISLE_WIDTH_FT, crossAislesFor,
  BUILDING_FT, CROSS_AISLE_SEGMENT_FT, LANE_CLEARANCE_IN, DOCK_APRON_FT, FLUE_IN, GRID_SEARCH_STEP_FT,
  type ColumnWhere,
} from './constants.js';
import { crossAisleSpans, fillSegments } from './crossaisles.js';
import { rackType, type RackKind, type RackType } from './racktypes.js';
import type { Flag } from './types.js';

/** Which way the rows run relative to the building. */
export type Orientation = 'length' | 'width';

/** How much of the footprint racking may use. */
export type Availability =
  | { mode: 'all' }
  | { mode: 'fraction'; fraction?: number }
  | { mode: 'area'; sqFt: number };

/** A building column, in building feet from the left and top walls. */
export interface RackColumn {
  xFt: number;
  yFt: number;
  /** What it is standing in, which is what decides whether it matters. */
  where: ColumnWhere;
  /** True only for a column in a flue: everything else costs something. */
  absorbed: boolean;
  /** Which row band and bay it killed, where it killed one. */
  row?: number;
  bay?: number;
}

export interface RackLayoutInput {
  buildingLengthFt: number;
  buildingWidthFt: number;
  /** Beam clear span, in — with pallet width this gives pallets per bay. */
  beamLengthIn: number;
  palletsPerBay: number;
  /**
   * Pallet width, in. What a drive-in lane is measured by: there is no beam in
   * one, so beam length says nothing about how many fit across.
   */
  palletWidthIn?: number;
  /** Pallet levels including the floor level. */
  levels: number;
  /** Upright frame depth, in. */
  frameDepthIn: number;
  aisleWidthFt: number;
  wallClearanceFt: number;
  orientation: Orientation;
  /** Overrides the type's default lane depth, clamped to its range. */
  deep?: number;
  /**
   * Building walls bounding the across axis. Two for a whole building; one
   * where the zone's other edge is an aisle it shares with something else —
   * that edge is reached from the aisle, so it takes a full back-to-back pair
   * rather than the single row a wall forces.
   */
  wallsAcross?: 1 | 2;
  /**
   * How much of the footprint is actually free for racking. A building holds
   * staging, shipping, offices and charging as well as racking, and the whole
   * footprint is the optimistic case, not the usual one. Defaults to all of it.
   */
  available?: Availability;
  /** Column grid, ft. Absent is a clear floor. */
  gridXFt?: number;
  gridYFt?: number;
  /** Overrides the cross aisles Trace works out from the run length. */
  crossAisles?: number;
}

export interface RackLayout {
  deep: number;
  bays: number;
  /** Individual rack rows. A lane block of N deep counts as N rows. */
  rows: number;
  /** Lane blocks — zero for aisle-picked types. */
  blocks: number;
  wallRows: number;
  positions: number;
  bayLengthFt: number;
  /**
   * Width of one lane, ft, where the type is drive-in or drive-through.
   * Undefined for everything picked from an aisle, which is measured by its
   * beam.
   */
  laneWidthFt?: number;
  /** Lanes across one block, for the types that have them. */
  lanesPerBlock?: number;
  alongFt: number;
  acrossFt: number;
  usedFt: number;
  spareFt: number;
  /** Fixed, not asked for: the pallet overhangs the frame either side. */
  flueIn: number;

  /* ── what the footprint actually gave up ─────────────────────────────── */

  /** Along-axis feet racking may use, after the availability rule. */
  usableAlongFt: number;
  /** Along-axis feet set aside at the dock end. Drawn hatched, never filled. */
  unavailableAlongFt: number;

  /* ── the column grid the racking was laid out around ─────────────────── */

  /** Offsets chosen so the fewest bays are lost to columns, ft. */
  alongOffsetFt: number;
  acrossOffsetFt: number;
  columns: readonly RackColumn[];
  columnsAbsorbed: number;
  /** Bays a column landed in and killed. */
  baysLostToColumns: number;
  /** Columns the search could not clear, by where they ended up. */
  columnsInAisles: number;
  columnsOnFaces: number;
  /** What this placement cost against a clear floor, in the search's own units. */
  columnPenalty: number;

  /* ── circulation ─────────────────────────────────────────────────────── */

  crossAisles: number;
  crossAisleWidthFt: number;
  /** Along-axis feet from the wall line to each cross aisle. */
  crossAisleAtFt: readonly number[];
  /**
   * Where every bay starts along the run, in envelope feet. The drawing renders
   * from this rather than working the spans out again, so a bay the count
   * dropped cannot appear on the plan.
   */
  bayStartsFt: readonly number[];
  /** Bays each row gives up to the cross aisles. */
  baysLostToCrossAisles: number;
}

/**
 * Fills a building with one rack type.
 *
 *   along  — the axis rows run down, where bays are counted
 *   across — the axis stacked with aisles
 *
 * Two families, and the difference is where the truck stands:
 *
 *   pick 'aisle'  loaded from the row face, so rows sit back to back in pairs
 *                 with a flue between. The row against each wall must be
 *                 SINGLE — nobody can reach the far side of a pair at a wall.
 *
 *   pick 'lane'   the truck enters the end of the lane, so a block is `deep`
 *                 rows thick and needs a clear aisle at one end (drive-in) or
 *                 at both (drive-through, pallet flow), which costs floor.
 *
 * Three things happen before a position is counted, and all three lower it.
 * They are applied to the *envelope*, never to the answer: scaling a finished
 * total would leave the drawing showing racking in floor the customer told us
 * was unavailable.
 *
 *   1. **The rackable envelope shrinks** to whatever share of the footprint is
 *      actually free. A 240 × 120 shed is not 28,800 sq ft of racking.
 *
 *   2. **The block is aligned to the column grid.** Columns are not a deduction
 *      applied afterwards — they are the constraint the layout is designed
 *      around. A designer slides the rows until the columns fall in flues and
 *      aisles, where they cost nothing, and only the ones that cannot be
 *      absorbed kill a bay. That is a search over offsets, and it is what this
 *      does.
 *
 *   3. **Cross aisles come out of the run.** A 240 ft row needs one for
 *      circulation and egress; drawing it unbroken overstates the count and
 *      would not pass inspection.
 */
export function layoutRack(kind: RackKind, input: RackLayoutInput): RackLayout {
  const R: RackType = rackType(kind);
  const deep = Math.max(R.minDeep, Math.min(R.maxDeep, input.deep ?? R.defaultDeep));

  const alongFullFt =
    (input.orientation === 'length' ? input.buildingLengthFt : input.buildingWidthFt) -
    input.wallClearanceFt * 2 - DOCK_APRON_FT;
  const acrossFt =
    (input.orientation === 'length' ? input.buildingWidthFt : input.buildingLengthFt) -
    input.wallClearanceFt * 2;

  // 1 ── the envelope, before anything is laid in it
  const usableAlongFt = availableAlongFt(alongFullFt, acrossFt, input.available);
  const unavailableAlongFt = Math.max(0, alongFullFt - usableAlongFt);

  // 3 ── circulation comes off the run before bays are counted
  const crossAisles = Math.max(0, Math.round(input.crossAisles ?? crossAislesFor(usableAlongFt)));
  // A cross aisle is a gap: the racking stops at its edge and starts again on
  // the far side, so the run loses its width outright.
  const alongForBaysFt = Math.max(0, usableAlongFt - crossAisles * CROSS_AISLE_WIDTH_FT);

  // A drive-in lane is one pallet wide plus the room the truck needs either
  // side of it, because the truck drives inside the rack and the pallet rests
  // on rails rather than on a beam. Beam length does not come into it.
  const lanes = R.onePalletLanes === true;
  const bayLengthFt = lanes
    ? laneWidthFt(input.palletWidthIn ?? 40)
    : (input.beamLengthIn + COLUMN_WIDTH_IN) / 12;
  const fd = input.frameDepthIn / 12;
  const flue = FLUE_IN / 12;
  const aisle = input.aisleWidthFt;

  // 2 ── the offsets that lose fewest bays to the columns
  const grid = gridOf(input);
  const columnsRaw = grid ? gridColumns(input, grid) : [];
  const pitchFt = R.pick === 'aisle' ? deep * fd * 2 + flue + aisle : deep * fd + aisle;

  let best = trial(0, 0);
  if (columnsRaw.length > 0) {
    for (let ac = 0; ac < pitchFt - 1e-9; ac += GRID_SEARCH_STEP_FT) {
      for (let al = 0; al < bayLengthFt - 1e-9; al += GRID_SEARCH_STEP_FT) {
        const t = trial(+al.toFixed(3), +ac.toFixed(3));
        // Bays kept, less what the columns cost where they landed — so an
        // offset that clears an aisle is worth losing several bays for, and one
        // that drops a whole row is not worth clearing one column.
        if (t.score > best.score
          || (t.score === best.score
            && t.alongOffsetFt + t.acrossOffsetFt < best.alongOffsetFt + best.acrossOffsetFt)) {
          best = t;
        }
      }
    }
  }

  // A lane holds one pallet across; a bay holds what the beam carries, and an
  // aisle-picked type holds that at every pallet of depth.
  const perBay = lanes ? 1 : input.palletsPerBay * (R.pick === 'aisle' ? deep : 1);
  const positions = Math.round(best.netBays * input.levels * perBay);

  return {
    deep, bays: best.bays, rows: best.rows, blocks: best.blocks, wallRows: best.wallRows,
    positions, bayLengthFt,
    laneWidthFt: lanes ? bayLengthFt : undefined,
    lanesPerBlock: lanes ? best.bays : undefined,
    alongFt: alongFullFt, acrossFt, usedFt: best.usedFt,
    spareFt: acrossFt - best.usedFt - best.acrossOffsetFt,
    usableAlongFt, unavailableAlongFt,
    alongOffsetFt: best.alongOffsetFt, acrossOffsetFt: best.acrossOffsetFt,
    columns: best.columns,
    columnsAbsorbed: best.columns.filter((c) => c.absorbed).length,
    columnsInAisles: best.columns.filter((c) => c.where === 'aisle').length,
    columnsOnFaces: best.columns.filter((c) => c.where === 'face').length,
    columnPenalty: best.penalty,
    baysLostToColumns: best.baysLost,
    crossAisles, crossAisleWidthFt: CROSS_AISLE_WIDTH_FT,
    crossAisleAtFt: best.crossAisleAtFt, bayStartsFt: best.bayStartsFt,
    baysLostToCrossAisles: Math.max(0,
      Math.floor(usableAlongFt / bayLengthFt) - Math.floor(alongForBaysFt / bayLengthFt)),
    flueIn: FLUE_IN,
  };

  /** One candidate placement, scored by the bays it ends up with. */
  function trial(alongOffsetFt: number, acrossOffsetFt: number) {
    const across = acrossFt - acrossOffsetFt;
    const { rows, blocks, wallRows, usedFt, bands, flues } = stack(across, acrossOffsetFt);
    // Bays are counted from what the segments actually hold: nothing straddles
    // a cross aisle, so a segment's remainder is spare floor rather than a bay.
    const { bayStartsFt, crossAisleAtFt, bays } =
      runSpans(usableAlongFt, bayLengthFt, crossAisles, alongOffsetFt);
    const columns = columnsRaw.map((c) => absorb(c, bands, flues, bayStartsFt));
    // one column can only kill the bay it stands in, and two in the same bay
    // kill it once. A column in an aisle or against a face costs access rather
    // than a bay, and must not be counted here.
    const killed = new Set<string>();
    for (const c of columns) if (c.where === 'bay') killed.add(`${c.row}:${c.bay}`);
    const baysLost = killed.size;
    const penalty = columns.reduce((sum, c) => sum + COLUMN_PENALTY[c.where], 0);
    const netBays = Math.max(0, rows * bays - baysLost);
    return {
      alongOffsetFt, acrossOffsetFt, bays, rows, blocks, wallRows, usedFt,
      columns, baysLost, bayStartsFt, crossAisleAtFt, penalty,
      netBays, score: netBays - penalty,
    };
  }

  /** The row bands across the building, in envelope feet from the wall line. */
  function stack(across: number, acrossOffsetFt: number) {
    const bands: { start: number; depth: number }[] = [];
    const flues: { start: number; depth: number }[] = [];
    let rows = 0, blocks = 0, wallRows = 0, usedFt = 0;
    let c = acrossOffsetFt;

    if (R.pick === 'aisle') {
      const single = deep * fd;
      const pair = deep * fd * 2 + flue;
      if (input.wallsAcross === 1) {
        // wall, aisle, [pair, aisle] … — the last pair faces the shared aisle,
        // which belongs to whatever is on the other side of it, not to this zone
        const pairs = Math.max(0, Math.floor((across - single) / (pair + aisle)));
        wallRows = across >= single ? 1 : 0;
        rows = wallRows + pairs * 2;
        usedFt = single * wallRows + pairs * (pair + aisle);
        if (wallRows > 0) { bands.push({ start: c, depth: single }); c += single + aisle; }
        for (let i = 0; i < pairs; i++) {
          bands.push({ start: c, depth: deep * fd });
          flues.push({ start: c + deep * fd, depth: flue });
          bands.push({ start: c + deep * fd + flue, depth: deep * fd });
          c += pair + aisle;
        }
      } else {
        const left = across - single * 2 - aisle * 2;
        const pairs = Math.max(0, Math.floor((left + aisle) / (pair + aisle)));
        wallRows = across >= single * 2 + aisle ? 2 : across >= single ? 1 : 0;
        rows = wallRows + pairs * 2;
        usedFt = single * wallRows + pairs * pair + (pairs + 1) * aisle;
        if (wallRows > 0) { bands.push({ start: c, depth: single }); c += single + aisle; }
        for (let i = 0; i < pairs; i++) {
          bands.push({ start: c, depth: deep * fd });
          flues.push({ start: c + deep * fd, depth: flue });
          bands.push({ start: c + deep * fd + flue, depth: deep * fd });
          c += pair + aisle;
        }
        if (wallRows > 1) bands.push({ start: c, depth: single });
      }
    } else {
      const block = deep * fd;
      if (R.openEnds === 1) {
        blocks = Math.max(0, Math.floor((across + aisle) / (block + aisle)));
        usedFt = blocks * block + Math.max(0, blocks - 1) * aisle;
      } else {
        blocks = Math.max(0, Math.floor((across - aisle) / (block + aisle)));
        usedFt = blocks * block + (blocks + 1) * aisle;
        c += aisle;
      }
      for (let i = 0; i < blocks; i++) { bands.push({ start: c, depth: block }); c += block + aisle; }
      rows = blocks * deep;
    }
    return { rows, blocks, wallRows, usedFt, bands, flues };
  }

  /**
   * Where a column is standing, which is what decides whether it matters.
   *
   * Only the flue absorbs one outright: the back-to-back pair is pushed apart
   * around it, which is what a designer does. In a bay it costs that bay. In
   * the aisle it is worse than either — against a rack face it blocks the
   * pallets behind it, and out in the middle it splits the aisle so the truck
   * cannot get past.
   *
   * A column in a cross aisle is clear of everything, and so is one on a bay
   * line where the upright already stands.
   */
  function absorb(
    c: RackColumn, bands: { start: number; depth: number }[],
    flues: { start: number; depth: number }[],
    spans: readonly number[],
  ): RackColumn {
    const { along, across } = toEnvelope(c, input);
    const half = BUILDING_COLUMN_IN / 24;

    // Where the column stands along the row decides as much as where it stands
    // across it: a flue runs between two rows and stops where they stop, so a
    // column beyond the last bay of a segment is in the cross aisle, not in a
    // flue that has already ended.
    const inRacking = spans.some(
      (s) => along > s - half && along < s + bayLengthFt + half);

    if (!inRacking) {
      const inZone = flues.some((f) => across > f.start - half && across < f.start + f.depth + half)
        || bands.some((b) => across > b.start - half && across < b.start + b.depth + half);
      // In line with the racking but past the end of a segment: a cross aisle,
      // or the spare at the end of the row. Clear floor either way.
      if (inZone) return { ...c, where: 'clear', absorbed: true };
    } else if (flues.some((f) => across > f.start - half && across < f.start + f.depth + half)) {
      return { ...c, where: 'flue', absorbed: true };
    }

    const band = bands.findIndex((b) => across > b.start - half
      && across < b.start + b.depth + half);
    if (band >= 0 && inRacking) {
      const bay = bayAt(along, spans, bayLengthFt);
      // standing on a bay line, which carries the upright and loses nothing
      if (bay < 0) return { ...c, where: 'flue', absorbed: true };
      return { ...c, where: 'bay', absorbed: false, row: band, bay };
    }

    // It is in the aisle. Whether that blocks a pick face or the truck's own
    // path depends only on how close it is to the racking either side.
    const nearFace = bands.some((b) =>
      (across > b.start - COLUMN_FACE_ZONE_FT && across < b.start)
      || (across > b.start + b.depth && across < b.start + b.depth + COLUMN_FACE_ZONE_FT));
    // A column in the truck aisle but level with a break in the racking — a
    // cross aisle, a bay line, or past the end of the row — blocks nothing. It
    // is clear floor, and calling it a flue was the same mistake as above.
    if (bands.length > 0 && bayAt(along, spans, bayLengthFt) < 0 && !nearFace) {
      return { ...c, where: 'clear', absorbed: true };
    }
    return { ...c, where: nearFace ? 'face' : 'aisle', absorbed: false };
  }
}

/* ── the envelope ────────────────────────────────────────────────────────── */

function availableAlongFt(alongFt: number, acrossFt: number, a?: Availability): number {
  if (!a || a.mode === 'all') return alongFt;
  if (a.mode === 'fraction') {
    const f = Math.min(1, Math.max(0.05, a.fraction ?? AVAILABLE_THREE_QUARTERS));
    return alongFt * f;
  }
  // An area is fitted by shortening the run, so what is given up is one strip
  // at the dock end rather than a slice off every row.
  if (!Number.isFinite(a.sqFt) || a.sqFt <= 0 || acrossFt <= 0) return alongFt;
  return Math.min(alongFt, a.sqFt / acrossFt);
}

/* ── the column grid ─────────────────────────────────────────────────────── */

function gridOf(input: RackLayoutInput): { xFt: number; yFt: number } | null {
  const x = input.gridXFt, y = input.gridYFt;
  if (!x || !y || !Number.isFinite(x) || !Number.isFinite(y) || x < 5 || y < 5) return null;
  return { xFt: x, yFt: y };
}

/** Grid intersections inside the building, in building feet. */
export function gridColumns(
  input: Pick<RackLayoutInput, 'buildingLengthFt' | 'buildingWidthFt'>,
  grid: { xFt: number; yFt: number },
): RackColumn[] {
  const out: RackColumn[] = [];
  for (let x = grid.xFt; x < input.buildingLengthFt - 1e-9; x += grid.xFt) {
    for (let y = grid.yFt; y < input.buildingWidthFt - 1e-9; y += grid.yFt) {
      out.push({ xFt: +x.toFixed(3), yFt: +y.toFixed(3), where: 'flue', absorbed: true });
    }
  }
  return out;
}

/** A column's position in the rack envelope's own (along, across) feet. */
function toEnvelope(c: RackColumn, input: RackLayoutInput) {
  const alongBuilding = input.orientation === 'length' ? c.xFt : c.yFt;
  const acrossBuilding = input.orientation === 'length' ? c.yFt : c.xFt;
  return {
    along: alongBuilding - input.wallClearanceFt - DOCK_APRON_FT,
    across: acrossBuilding - input.wallClearanceFt,
  };
}

/**
 * Where the bays and the cross aisles fall along the run.
 *
 * One function, because the count, the absorption test and the drawing all have
 * to agree about which foot of floor is a bay: a cross aisle drawn somewhere
 * the count did not put it is a drawing that contradicts its own total.
 */
/**
 * How wide one drive-in lane is, ft.
 *
 * The pallet, plus the clearance the truck needs to get past it on both sides.
 * Nothing here comes from a beam: a beam across this lane would be in the
 * truck's way, so there is not one.
 */
export function laneWidthFt(palletWidthIn: number): number {
  return (Math.max(24, palletWidthIn) + LANE_CLEARANCE_IN) / 12;
}

export function runSpans(
  usableAlongFt: number, bayLengthFt: number, crossAisles: number, offsetFt: number,
): { bayStartsFt: number[]; crossAisleAtFt: number[]; bays: number } {
  // The aisles come from the building, not from this zone's bay count — that
  // is what puts them at the same feet as the cantilever strip's. Grouping bays
  // instead put each zone's aisles wherever its own module happened to land.
  const spans = crossAisleSpans(usableAlongFt, crossAisles);
  const bayStartsFt = fillSegments(spans, bayLengthFt, bayLengthFt, offsetFt);
  return { bayStartsFt, crossAisleAtFt: [...spans.atFt], bays: bayStartsFt.length };
}

/**
 * Which bay a point along the run falls in, or -1 where it falls on a bay line
 * or in a cross aisle. Bay lines carry the upright frames, so a column there is
 * built around rather than lost.
 */
function bayAt(along: number, starts: readonly number[], bayLengthFt: number): number {
  const tol = BUILDING_COLUMN_IN / 24;            // it has to clear the bay line, not touch it
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    if (along > start + tol && along < start + bayLengthFt - tol) return i;
  }
  return -1;
}

/** Every type laid out in the same building, densest first. */
export function compareRackTypes(input: RackLayoutInput) {
  return (['selective','doubledeep','pushback','drivein','drivethru','flow'] as RackKind[])
    .map((kind) => ({ kind, type: rackType(kind), layout: layoutRack(kind, input) }))
    .sort((a, b) => b.layout.positions - a.layout.positions);
}

/**
 * What the customer should know about the floor we assumed, rather than the
 * racking we drew on it. Every one of these is a check: each is a reasonable
 * assumption that a real building may contradict, and none of them stops a
 * layout being useful.
 */
/**
 * What a building at the planner's ceiling needs saying about it.
 *
 * Raised where a dimension has been clamped, so the customer knows the figure
 * on screen is not the one they typed.
 */
export function buildingSizeCheck(lengthFt: number, widthFt: number): Flag | null {
  const at = [
    lengthFt >= BUILDING_FT.max ? 'length' : null,
    widthFt >= BUILDING_FT.max ? 'width' : null,
  ].filter(Boolean);
  if (at.length === 0) return null;
  return {
    severity: 'check', category: 'envelope',
    title: `This building is at the planner's limit`,
    detail: `${BUILDING_FT.max} ft is the largest building this planner sizes, and the `
      + `${at.join(' and ')} ${at.length > 1 ? 'have' : 'has'} been held there. `
      + `Beyond that a designer would split the floor into zones and size each one, `
      + `so lay out the zone you are working on rather than the whole shed.`,
  };
}

export function envelopeChecks(
  layout: RackLayout,
  opts: { available: Availability['mode']; columns: 'none' | 'grid' | 'later' },
): Flag[] {
  const out: Flag[] = [];

  if (opts.available === 'all') {
    out.push({
      severity: 'check', category: 'area',
      title: 'This assumes the whole footprint is available',
      detail: `All ${Math.round(layout.usableAlongFt * layout.acrossFt).toLocaleString()} sq ft `
        + `inside the walls is counted as rackable. Staging, shipping, offices and charging `
        + `areas typically take 20–30% of a building — set Available for rack to about 75% or `
        + `enter your own figure to see what that costs.`,
    });
  }

  if (opts.columns === 'later') {
    out.push({
      severity: 'check', category: 'columns',
      title: 'The layout assumes a clear floor',
      detail: 'No column grid was given, so every bay is drawn as buildable. Columns landing in '
        + 'rack bays cost positions, and where they fall decides where the rows go — mark them '
        + 'before this layout is quoted.',
    });
  }

  if (layout.columnsInAisles + layout.columnsOnFaces > 0) {
    out.push({
      severity: 'check', category: 'columns',
      title: 'Some columns land where the truck needs to be',
      detail: `${layout.columnsInAisles} ${layout.columnsInAisles === 1 ? 'column stands' : 'columns stand'} `
        + `in an aisle and ${layout.columnsOnFaces} `
        + `${layout.columnsOnFaces === 1 ? 'blocks a pick face' : 'block a pick face'}. `
        + `A column in an aisle splits it in two, and one against a face leaves the pallets `
        + `behind it out of reach — neither bay is usable where it stands. The rows have already `
        + `been slid to the offset that clears the most of them; a designer will shift rows `
        + `further or vary an aisle by a foot to clear the rest.`,
    });
  }

  if (layout.crossAisles > 0) {
    out.push({
      severity: 'check', category: 'egress',
      title: `${layout.crossAisles} cross ${layout.crossAisles === 1 ? 'aisle' : 'aisles'} assumed`,
      detail: `A ${layout.usableAlongFt.toFixed(0)} ft row is cut into `
        + `${layout.crossAisles + 1} segments of about `
        + `${(layout.usableAlongFt / (layout.crossAisles + 1)).toFixed(0)} ft by `
        + `${layout.crossAisles} cross ${layout.crossAisles === 1 ? 'aisle' : 'aisles'} of `
        + `${layout.crossAisleWidthFt} ft, costing ${layout.baysLostToCrossAisles} bays per row. `
        + `Trace cuts a row every ${CROSS_AISLE_SEGMENT_FT} ft, which is an assumption: fire code `
        + `requirements vary by jurisdiction, commodity and storage height — confirm with the AHJ.`,
    });
  }

  return out;
}

/** What the drawing says about the columns, in a sentence. */
export function columnNote(layout: RackLayout, grid: { xFt: number; yFt: number }): string {
  const lost = layout.baysLostToColumns;
  const positions = lost * layout.positions / Math.max(1, layout.rows * layout.bays - lost);
  const shifted = layout.acrossOffsetFt > 0 || layout.alongOffsetFt > 0
    ? ` Rows shifted ${[layout.acrossOffsetFt && `${layout.acrossOffsetFt} ft off the wall`,
      layout.alongOffsetFt && `${layout.alongOffsetFt} ft along`]
      .filter(Boolean).join(' and ')} to align.`
    : ' No shift was needed to clear them.';
  const blocked = layout.columnsInAisles + layout.columnsOnFaces;
  return `${layout.columns.length} columns on a ${grid.xFt} × ${grid.yFt} grid. `
    + `${layout.columnsAbsorbed} are clear of the racking. `
    + (lost === 0
      ? 'None land in rack bays. '
      : `${lost} land in rack ${lost === 1 ? 'bay' : 'bays'}, costing about `
        + `${Math.round(positions)} positions. `)
    + (blocked === 0 ? '' : `${layout.columnsInAisles} `
      + `${layout.columnsInAisles === 1 ? 'stands' : 'stand'} in aisles and `
      + `${layout.columnsOnFaces} ${layout.columnsOnFaces === 1 ? 'blocks' : 'block'} a pick `
      + `face — a designer will shift rows or vary an aisle by a foot to clear these. `)
    + shifted.trim();
}
