import {
  AVAILABLE_THREE_QUARTERS, BUILDING_COLUMN_IN, COLUMN_FACE_ZONE_FT, COLUMN_PENALTY,
  UPRIGHT_SECTION_IN,
  COLUMN_WIDTH_IN, CROSS_AISLE_WIDTH_FT,
  BUILDING_ZONE_ADVICE_FT, CROSS_AISLE_SEGMENT_FT, LANE_CLEARANCE_IN, DOCK_APRON_FT, FLUE_IN, GRID_SEARCH_STEP_FT,
  type ColumnWhere,
} from './constants.js';
import { crossAislePlan, crossAisleSpansAt, fillSegments } from './crossaisles.js';
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

/**
 * Which end of a lane block is open — the face a truck drives in at and
 * retrieves from. A drive-in block has exactly one; the other end is closed.
 *
 * Named in the building's terms rather than the block's, so that the solver,
 * the plan and a dealer's override all mean the same end by the same word:
 * `front` is the end at the low side of the across axis — the side the rows are
 * measured out from — and `back` is the end at the high side.
 *
 * It is a property of the block, not a thing to be worked out from what happens
 * to sit next to it. A reader of this field must never re-derive it from wall
 * adjacency: the solver's default does account for the wall, but a dealer can
 * flip it, and a drawing that infers the end instead of reading it would then
 * disagree with the layout it is drawing.
 */
export type AccessEnd = 'front' | 'back';

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
  /**
   * Cross aisles another zone on the same floor already placed, in envelope
   * feet. Wins over `crossAisles`: the positions are the building's.
   */
  crossAisleAtFt?: readonly number[];
  /**
   * Overrides the open end the solver picks for every lane block. A dealer who
   * knows the floor may want the lanes worked from the other side; nothing here
   * stops that, including putting the open end at a wall, because an override
   * is a decision rather than a suggestion.
   */
  accessEnd?: AccessEnd;
}

export interface RackLayout {
  deep: number;
  bays: number;
  /** Individual rack rows. A lane block of N deep counts as N rows. */
  rows: number;
  /** Lane blocks — zero for aisle-picked types. */
  blocks: number;
  /** Single rows against a wall — the far wall always, the near wall alone. */
  wallRows: number;
  /**
   * Single rows that are not against a wall: the one extra row the depth left
   * over takes when it would hold a single and its aisle. Zero or one.
   */
  singleRows: number;
  /** Floor across the zone no row or aisle takes, from the wall line. */
  spareAcrossFt: readonly { start: number; depth: number }[];
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
  /**
   * The open end of each lane block, in order across the building.
   *
   * Empty unless the type is open at exactly one end. Drive-through carries
   * none because both of its ends are open, and an aisle-picked type has no
   * lanes to open. A block is never open at both ends: a rack meant to be
   * entered from either side is drive-through, not drive-in.
   */
  blockAccess: readonly AccessEnd[];
  /** Pallet levels, including the floor. Carried so a figure can report it. */
  levels: number;
  /** Pallets across one lane or bay: one in a drive-in, two on a push-back cart. */
  palletsAcross: number;
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
  /**
   * The rack footprints across the building, in envelope feet from the wall
   * line, and the flues between the back-to-back pairs. A floor that mixes
   * two families has to judge a column against both zones at once, and it
   * cannot do that from a count — see `classifyColumn`.
   */
  bandsFt: readonly { start: number; depth: number }[];
  fluesFt: readonly { start: number; depth: number }[];
  /** The forklift aisles between them, in the same feet. */
  aislesFt: readonly { start: number; depth: number }[];
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

  const alongFullFt =
    (input.orientation === 'length' ? input.buildingLengthFt : input.buildingWidthFt) -
    input.wallClearanceFt * 2 - DOCK_APRON_FT;
  const acrossFt =
    (input.orientation === 'length' ? input.buildingWidthFt : input.buildingLengthFt) -
    input.wallClearanceFt * 2;

  // 1 ── the envelope, before anything is laid in it
  const usableAlongFt = rackUsableAlongFt(input);
  const unavailableAlongFt = Math.max(0, alongFullFt - usableAlongFt);


  // A drive-in lane is one pallet wide plus the room the truck needs either
  // side of it, because the truck drives inside the rack and the pallet rests
  // on rails rather than on a beam. Beam length does not come into it.
  const lanes = R.onePalletLanes === true;
  const bayLengthFt = bayLengthFor(kind, input.beamLengthIn, input.palletWidthIn);
  const fd = input.frameDepthIn / 12;
  const flue = FLUE_IN / 12;
  const aisle = input.aisleWidthFt;

  /*
   * 1b ── how deep the lanes go, which is the building's answer rather than a
   * question to ask.
   *
   * A lane six pallets deep in a building that can only take five is not a
   * layout, it is a wish. So every depth in the type's range is costed against
   * this floor — the blocks it leaves room for once the aisles are placed — and
   * the one that stores most wins. Ties go to the shallower, because depth is
   * bought with selectivity and there is no sense paying for it twice.
   */
  const deep = input.deep !== undefined
    ? Math.max(R.minDeep, Math.min(R.maxDeep, input.deep))
    : bestDeep();

  // 2 ── the offsets that lose fewest bays to the columns
  const grid = gridOf(input);
  const columnsRaw = grid ? gridColumns(input, grid) : [];
  const pitchFt = R.pick === 'aisle' ? deep * fd * 2 + flue + aisle : deep * fd + aisle;

  /*
   * A column's envelope coordinates do not move when the racking does — the
   * building is what it is, and the offsets slide the rows, not the columns.
   * So they are worked out once here rather than once per column per trial,
   * which is a few hundred times over.
   */
  const columnsEnv = columnsRaw.map((c) => toEnvelope(c, {
    orientation: input.orientation, wallClearanceFt: input.wallClearanceFt,
  }, false));

  /*
   * The columns are a grid, so there are far fewer positions than columns: a
   * 250 × 250 grid is 62,500 columns standing on 250 distinct feet along and
   * 250 across. Each axis is judged once per distinct position and the two
   * are combined per column, so the work per trial stops growing with the
   * area of the building and grows with its side instead.
   */
  const alongVals: number[] = [], acrossVals: number[] = [];
  const alongOf = new Map<number, number>(), acrossOf = new Map<number, number>();
  const colAlong = new Int32Array(columnsEnv.length);
  const colAcross = new Int32Array(columnsEnv.length);
  columnsEnv.forEach((c, i) => {
    let a = alongOf.get(c.along);
    if (a === undefined) { a = alongVals.push(c.along) - 1; alongOf.set(c.along, a); }
    let x = acrossOf.get(c.across);
    if (x === undefined) { x = acrossVals.push(c.across) - 1; acrossOf.set(c.across, x); }
    colAlong[i] = a; colAcross[i] = x;
  });

  let best = trial(0, 0);
  if (columnsRaw.length > 0) {
    // Scored, not built. Every trial but the winning one is thrown away, so
    // the search asks only for the number it compares and the full layout is
    // assembled once, at the end, for the offsets that won.
    let bestScore = score(0, 0), bestAl = 0, bestAc = 0;
    for (let ac = 0; ac < pitchFt - 1e-9; ac += GRID_SEARCH_STEP_FT) {
      for (let al = 0; al < bayLengthFt - 1e-9; al += GRID_SEARCH_STEP_FT) {
        const alongOffsetFt = +al.toFixed(3), acrossOffsetFt = +ac.toFixed(3);
        const sc = score(alongOffsetFt, acrossOffsetFt);
        // Bays kept, less what the columns cost where they landed — so an
        // offset that clears an aisle is worth losing several bays for, and one
        // that drops a whole row is not worth clearing one column.
        if (sc > bestScore
          || (sc === bestScore && alongOffsetFt + acrossOffsetFt < bestAl + bestAc)) {
          bestScore = sc; bestAl = alongOffsetFt; bestAc = acrossOffsetFt;
        }
      }
    }
    if (bestAl !== 0 || bestAc !== 0) best = trial(bestAl, bestAc);
  }

  // 3 ── circulation came off the run before the bays were counted, on the
  // bays' own boundaries. A cross aisle is a gap: the racking stops at its edge
  // and starts again on the far side, so the run loses its width outright.
  const crossAisles = best.crossAisleAtFt.length;
  const alongForBaysFt = Math.max(0, usableAlongFt - crossAisles * CROSS_AISLE_WIDTH_FT);

  // A lane holds one pallet across; a bay holds what the beam carries, and an
  // aisle-picked type holds that at every pallet of depth.
  const perBay = lanes ? 1 : input.palletsPerBay * (R.pick === 'aisle' ? deep : 1);
  const positions = Math.round(best.netBays * input.levels * perBay);

  /*
   * Where each block is entered.
   *
   * Drive-in puts an aisle between blocks and none at either end, so the first
   * block backs onto the wall it starts from and is worked from its far end;
   * every other block has an aisle at its near end and is worked from there.
   * A lone block has no aisle at all — the floor beyond it is what it is worked
   * from, and that is its far end too.
   */
  const blockAccess: AccessEnd[] = R.openEnds === 1
    ? Array.from({ length: best.blocks },
      (_, i) => input.accessEnd ?? (i === 0 ? 'back' : 'front'))
    : [];

  return {
    deep, bays: best.bays, rows: best.rows, blocks: best.blocks, wallRows: best.wallRows,
    singleRows: best.singleRows, spareAcrossFt: best.spare,
    blockAccess,
    positions, bayLengthFt,
    laneWidthFt: lanes ? bayLengthFt : undefined,
    levels: input.levels,
    palletsAcross: lanes ? 1 : input.palletsPerBay,
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
    bandsFt: best.bands, fluesFt: best.flues, aislesFt: best.aisles,
    crossAisles, crossAisleWidthFt: CROSS_AISLE_WIDTH_FT,
    crossAisleAtFt: best.crossAisleAtFt, bayStartsFt: best.bayStartsFt,
    baysLostToCrossAisles: Math.max(0,
      Math.floor(usableAlongFt / bayLengthFt) - Math.floor(alongForBaysFt / bayLengthFt)),
    flueIn: FLUE_IN,
  };

  /** One candidate placement, scored by the bays it ends up with. */
  /**
   * What one offset is worth, without building anything it does not need.
   *
   * The same arithmetic `trial` does — the same stack, the same spans, the
   * same penalties — reduced to the one number the search compares. It must
   * stay that: if the score here and the score there ever disagree, the layout
   * returned is not the one that won, and there is a test holding them
   * together.
   */
  function score(alongOffsetFt: number, acrossOffsetFt: number): number {
    const { rows, bands, flues, aisles } = stack(acrossFt - acrossOffsetFt, acrossOffsetFt, deep);
    const { bayStartsFt, bays } = runSpans(usableAlongFt, bayLengthFt, input.crossAisles,
      alongOffsetFt, input.crossAisleAtFt);
    const g: ColumnGround = {
      bands, flues, aisles, moduleStartsFt: bayStartsFt, moduleLengthFt: bayLengthFt,
      orientation: input.orientation, wallClearanceFt: input.wallClearanceFt,
    };
    // A bay is killed once however many columns stand in it, so they are
    // counted by identity — row and bay packed into one number, because a set
    // of strings is the kind of thing that costs a large building minutes.
    const aTab = alongVals.map((v) => alongInfo(v, g));
    const xTab = acrossVals.map((v) => acrossInfo(v, g));
    const killed = new Set<number>();
    let penalty = 0;
    for (let i = 0; i < colAlong.length; i++) {
      const v = verdictFrom(aTab[colAlong[i]!]!, xTab[colAcross[i]!]!);
      penalty += COLUMN_PENALTY[v.where];
      if (v.where === 'bay') killed.add((v.row ?? 0) * (bays + 1) + (v.bay ?? 0));
    }
    return Math.max(0, rows * bays - killed.size) - penalty;
  }

  function trial(alongOffsetFt: number, acrossOffsetFt: number) {
    const across = acrossFt - acrossOffsetFt;
    const { rows, blocks, wallRows, singleRows, usedFt, bands, flues, aisles, spare } = stack(across, acrossOffsetFt, deep);
    // Bays are counted from what the segments actually hold: nothing straddles
    // a cross aisle, so a segment's remainder is spare floor rather than a bay.
    const { bayStartsFt, crossAisleAtFt, bays } =
      runSpans(usableAlongFt, bayLengthFt, input.crossAisles, alongOffsetFt, input.crossAisleAtFt);
    const columns = columnsRaw.map((c) => classifyColumn(c, {
      bands, flues, aisles, moduleStartsFt: bayStartsFt, moduleLengthFt: bayLengthFt,
      orientation: input.orientation, wallClearanceFt: input.wallClearanceFt,
    }));
    // one column can only kill the bay it stands in, and two in the same bay
    // kill it once. A column in an aisle or against a face costs access rather
    // than a bay, and must not be counted here.
    const killed = new Set<string>();
    for (const c of columns) if (c.where === 'bay') killed.add(`${c.row}:${c.bay}`);
    const baysLost = killed.size;
    const penalty = columns.reduce((sum, c) => sum + COLUMN_PENALTY[c.where], 0);
    const netBays = Math.max(0, rows * bays - baysLost);
    return {
      alongOffsetFt, acrossOffsetFt, bays, rows, blocks, wallRows, singleRows, spare, usedFt,
      columns, baysLost, bayStartsFt, crossAisleAtFt, penalty, bands, flues, aisles,
      netBays, score: netBays - penalty,
    };
  }

  /**
   * The depth this floor is worth having.
   *
   * Costed on rows alone: the bays along a row do not change with depth, so
   * whichever depth stacks the most rows across the building stores the most.
   */
  function bestDeep(): number {
    let pick = R.minDeep, most = -1;
    for (let d = R.minDeep; d <= R.maxDeep; d++) {
      const { rows } = stack(acrossFt, 0, d);
      // an aisle-picked row is d pallets deep; a lane block is counted as d
      // rows already, so rows is the comparable figure either way
      const stored = R.pick === 'aisle' ? rows * d : rows;
      if (stored > most) { most = stored; pick = d; }
    }
    return pick;
  }

  /** The row bands across the building, in envelope feet from the wall line. */
  function stack(across: number, acrossOffsetFt: number, deep: number) {
    const bands: { start: number; depth: number }[] = [];
    const flues: { start: number; depth: number }[] = [];
    const aisles: { start: number; depth: number }[] = [];
    /** An aisle taken at `from`, recorded where the cursor spends one. */
    const spend = (from: number) => { aisles.push({ start: from, depth: aisle }); };
    /** Floor across the zone no row or aisle takes — spare, not a wider aisle. */
    const spare: { start: number; depth: number }[] = [];
    let rows = 0, blocks = 0, wallRows = 0, singleRows = 0, usedFt = 0;
    let c = acrossOffsetFt;

    if (R.pick === 'aisle') {
      const single = deep * fd;
      const pair = deep * fd * 2 + flue;
      /*
       * Far wall first, then the near edge, then pairs between, then one more
       * single if the depth left over would hold it.
       *
       * 1. The far wall always gets a single row, hard against it. Laid in
       *    from the near side the rows used to stop wherever the count ran
       *    out, so the far wall stood behind up to twenty feet of nothing.
       * 2. The near edge is a wall on a floor of racking alone, and it gets
       *    its own single row. On a mixed floor it is the aisle shared with
       *    the strip, and the first module faces that aisle directly — the
       *    aisle is already there, and belongs to neither zone.
       * 3. Back-to-back pairs fill between, an aisle after each: two rows for
       *    one aisle, so pairs always beat two singles for the same width.
       * 4. If what is left is an aisle and a single or more, it takes one more
       *    single with its aisle rather than being left empty. Less than that
       *    is spare, recorded as spare in front of the far row — never handed
       *    to an aisle to make it wider than the truck asked for.
       */
      const end = acrossOffsetFt + across;
      const farRow = across >= single;
      const nearRow = input.wallsAcross !== 1 && across >= single * 2 + aisle;
      wallRows = (farRow ? 1 : 0) + (nearRow ? 1 : 0);
      const room = Math.max(0, across - (farRow ? single : 0) - (nearRow ? single + aisle : 0));
      const pairs = farRow ? Math.floor(room / (pair + aisle) + 1e-9) : 0;
      const extra = farRow && room - pairs * (pair + aisle) >= single + aisle - 1e-9;
      singleRows = extra ? 1 : 0;
      rows = wallRows + singleRows + pairs * 2;

      if (nearRow) { bands.push({ start: c, depth: single }); spend(c + single); c += single + aisle; }
      // the extra single sits by the near edge: a wall row's aisle, or the shared one
      if (extra) { bands.push({ start: c, depth: single }); spend(c + single); c += single + aisle; }
      for (let i = 0; i < pairs; i++) {
        bands.push({ start: c, depth: deep * fd });
        flues.push({ start: c + deep * fd, depth: flue });
        bands.push({ start: c + deep * fd + flue, depth: deep * fd });
        spend(c + pair); c += pair + aisle;
      }
      if (farRow) {
        const farStart = end - single;
        if (farStart - c > 1e-9) spare.push({ start: c, depth: farStart - c });
        bands.push({ start: farStart, depth: single });
        usedFt = across - Math.max(0, farStart - c);
      }
    } else {
      const block = deep * fd;
      if (R.openEnds === 1) {
        blocks = Math.max(0, Math.floor((across + aisle) / (block + aisle)));
        usedFt = blocks * block + Math.max(0, blocks - 1) * aisle;
      } else {
        blocks = Math.max(0, Math.floor((across - aisle) / (block + aisle)));
        usedFt = blocks * block + (blocks + 1) * aisle;
        spend(c); c += aisle;
      }
      for (let i = 0; i < blocks; i++) {
        bands.push({ start: c, depth: block }); spend(c + block); c += block + aisle;
      }
      rows = blocks * deep;
    }
    return { rows, blocks, wallRows, singleRows, usedFt, bands, flues, aisles, spare };
  }

}

/* ── where a column is standing ──────────────────────────────────────────── */

/** The floor a column can be standing on, as the classifier is given it. */
export interface ColumnGround {
  /** Rack footprints on the across axis, in envelope feet. */
  bands: readonly { start: number; depth: number }[];
  /** Flues between back-to-back rows. A family without them passes none. */
  flues: readonly { start: number; depth: number }[];
  /**
   * The forklift aisles: the gaps the racking is worked from, as the solver
   * spent them. Not "everything that is not a rack" — a strip of cantilever
   * against one wall leaves most of a building as bare floor, and calling
   * every column out there an obstruction is crying wolf on the ones that
   * really are in the way.
   */
  aisles: readonly { start: number; depth: number }[];
  /** Where each module starts along the run — a bay, or a cantilever run. */
  moduleStartsFt: readonly number[];
  /** One module's length along the run. */
  moduleLengthFt: number;
  /**
   * The upright's section along the run, in. What a column at a bay line has to
   * fit inside to be taken round by it. Defaults to `UPRIGHT_SECTION_IN`.
   */
  uprightIn?: number;
  orientation: Orientation;
  wallClearanceFt: number;
  /** True where the run reserves no dock apron — a strip rather than a floor. */
  noApron?: boolean;
}

/** Where a column is standing, and nothing about the column itself. */
export interface ColumnVerdict {
  where: ColumnWhere;
  absorbed: boolean;
  row?: number;
  bay?: number;
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
 *
 * One definition, for every family that stands racking on a floor with
 * columns in it: pallet rows have flues and bays, a cantilever strip has
 * neither, and a mixed floor has both — but "the truck cannot get past this"
 * means the same thing on all three, and a reader is owed the same mark for
 * it. So the geometry is passed in and the judgement is made here.
 *
 * It is split in two, and this half is the judgement. It takes a pair of
 * envelope coordinates rather than a column so the packing search can ask
 * what an offset costs without building a column object per column per trial:
 * the search tries every offset within one pitch by one bay in half-foot
 * steps, some hundreds of trials, and a large floor has tens of thousands of
 * columns. Those objects were the entire cost of solving a big building — a
 * 10,000 ft floor spent nearly three minutes allocating twenty-eight million
 * of them and throwing all but one trial's away.
 *
 * `classifyColumn` below is this function plus the column it was asked about.
 */
/** What the along axis alone knows: where the column is down the run. */
export interface AlongInfo {
  /** Level with racking that is actually there, rather than past the end of it. */
  inRacking: boolean;
  /** Which bay of a segment, or -1 for standing on the bay line itself. */
  bay: number;
}

/** What the across axis alone knows: what the column is standing between. */
export interface AcrossInfo {
  inFlue: boolean;
  /** Which row band, or -1 for none. */
  band: number;
  nearFace: boolean;
  inAisle: boolean;
}

/**
 * Where the column stands along the row. A flue runs between two rows and
 * stops where they stop, so a column beyond the last bay of a segment is in
 * the cross aisle, not in a flue that has already ended.
 */
export function alongInfo(along: number, g: ColumnGround): AlongInfo {
  const half = BUILDING_COLUMN_IN / 24;
  return {
    inRacking: g.moduleStartsFt.some(
      (s) => along > s - half && along < s + g.moduleLengthFt + half),
    bay: bayAt(along, g.moduleStartsFt, g.moduleLengthFt,
      g.uprightIn ?? UPRIGHT_SECTION_IN),
  };
}

/** Where the column stands across the rows. */
export function acrossInfo(across: number, g: ColumnGround): AcrossInfo {
  const half = BUILDING_COLUMN_IN / 24;
  return {
    inFlue: g.flues.some((f) => across > f.start - half && across < f.start + f.depth + half),
    band: g.bands.findIndex((b) => across > b.start - half
      && across < b.start + b.depth + half),
    // Whether it blocks a pick face depends only on how close it is to the
    // racking either side — a face is a face whatever the floor beside it does.
    nearFace: g.bands.some((b) =>
      (across > b.start - COLUMN_FACE_ZONE_FT && across < b.start)
      || (across > b.start + b.depth && across < b.start + b.depth + COLUMN_FACE_ZONE_FT)),
    inAisle: g.aisles.some((a) => across > a.start - half && across < a.start + a.depth + half),
  };
}

/**
 * The verdict, from what each axis knows.
 *
 * The two axes are independent — nothing in this judgement needs `along` and
 * `across` at the same time, only what each of them found — and the columns
 * are a grid, so a floor with sixty thousand columns on it has only a couple
 * of hundred distinct positions on either axis. The packing search works each
 * axis out once per distinct position and combines them here, which is the
 * difference between solving a very large building and appearing to hang.
 */
export function verdictFrom(a: AlongInfo, x: AcrossInfo): ColumnVerdict {
  if (!a.inRacking) {
    // In line with the racking but past the end of a segment: a cross aisle,
    // or the spare at the end of the row. Clear floor either way.
    if (x.inFlue || x.band >= 0) return { where: 'clear', absorbed: true };
  } else if (x.inFlue) {
    return { where: 'flue', absorbed: true };
  }

  if (x.band >= 0 && a.inRacking) {
    // standing on a bay line, which carries the upright and loses nothing
    if (a.bay < 0) return { where: 'flue', absorbed: true };
    return { where: 'bay', absorbed: false, row: x.band, bay: a.bay };
  }

  if (x.nearFace) return { where: 'face', absorbed: false };

  /*
   * Otherwise it is in the aisle, if it is in one at all — and two things
   * decide that, one on each axis.
   *
   * Across: it has to be inside a real aisle, not merely outside the racking.
   * A cantilever strip down one wall leaves most of a building bare, and a
   * column standing out there is in nobody's way until something is built
   * round it.
   *
   * Along: it has to be level with racking that is actually there. Past the
   * end of the run, or across a cross aisle, the aisle has ended too.
   *
   * What does *not* excuse it is standing on a bay line. That rule belongs to
   * a column inside a band, where the upright really is on that line and takes
   * the load round it — and that case is already answered above. Out in the
   * aisle there is no upright, only a column in the middle of where the truck
   * drives, and applying the band's excuse here let a whole grid off: at a
   * 40 ft column grid on an 8.25 ft bay, every column in the building landed
   * within half a foot of a line, so a plan full of obstructions came back
   * without a mark on it.
   */
  return x.inAisle && a.inRacking
    ? { where: 'aisle', absorbed: false }
    : { where: 'clear', absorbed: true };
}

/** Both axes, for one column, where there is only one to judge. */
export function classifyAt(along: number, across: number, g: ColumnGround): ColumnVerdict {
  return verdictFrom(alongInfo(along, g), acrossInfo(across, g));
}

/**
 * Where a column is standing, which is what decides whether it matters.
 *
 * The wrapper the drawings and the reports use: the verdict above, carried
 * back on the column it was asked about.
 */
export function classifyColumn(c: RackColumn, g: ColumnGround): RackColumn {
  const { along, across } = toEnvelope(c, {
    orientation: g.orientation, wallClearanceFt: g.wallClearanceFt,
  }, g.noApron === true);
  return { ...c, ...classifyAt(along, across, g) };
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
function toEnvelope(
  c: RackColumn,
  input: { orientation: Orientation; wallClearanceFt: number },
  noApron = false,
) {
  const alongBuilding = input.orientation === 'length' ? c.xFt : c.yFt;
  const acrossBuilding = input.orientation === 'length' ? c.yFt : c.xFt;
  return {
    along: alongBuilding - input.wallClearanceFt - (noApron ? 0 : DOCK_APRON_FT),
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

/** The run length left once the building has taken its share, ft. */
export function rackUsableAlongFt(input: RackLayoutInput): number {
  const alongIsLength = input.orientation === 'length';
  const alongFullFt = (alongIsLength ? input.buildingLengthFt : input.buildingWidthFt)
    - input.wallClearanceFt * 2 - DOCK_APRON_FT;
  const acrossFt = (alongIsLength ? input.buildingWidthFt : input.buildingLengthFt)
    - input.wallClearanceFt * 2;
  return availableAlongFt(alongFullFt, acrossFt, input.available);
}

/**
 * The module a row of this type repeats along its length, ft: a bay of beam
 * plus its upright, or a lane where the pallet rides on rails instead.
 */
export function bayLengthFor(kind: RackKind, beamLengthIn: number, palletWidthIn?: number): number {
  return rackType(kind).onePalletLanes === true
    ? laneWidthFt(palletWidthIn ?? 40)
    : (beamLengthIn + COLUMN_WIDTH_IN) / 12;
}

export function runSpans(
  usableAlongFt: number, bayLengthFt: number, crossAisles: number | undefined, offsetFt: number,
  atFt?: readonly number[],
): { bayStartsFt: number[]; crossAisleAtFt: number[]; bays: number } {
  // On this zone's own bay boundaries, unless another zone on the same floor
  // already placed them — then they are taken as given, so a mixed floor's
  // aisles are one route across the building rather than two staggered ones.
  const spans = atFt
    ? crossAisleSpansAt(usableAlongFt, atFt)
    : crossAislePlan({ usableAlongFt, moduleFt: bayLengthFt, offsetFt, crossAisles });
  const bayStartsFt = fillSegments(spans, bayLengthFt, bayLengthFt, atFt ? offsetFt : 0);
  return { bayStartsFt, crossAisleAtFt: [...spans.atFt], bays: bayStartsFt.length };
}

/**
 * Which bay a point along the run falls in, or -1 where the upright takes it.
 *
 * A bay line carries an upright, and a column standing where the upright stands
 * is built around rather than lost. But only if it fits: the question is
 * whether the column's own footprint is inside the upright's, not whether its
 * centre is somewhere near the line.
 *
 * It used to ask the second question, with half a building column as the
 * tolerance — so anything within six inches of a line was waved through. On a
 * grid whose pitch nearly divides by the bay that is most of the building: at a
 * 25 ft grid on an 8.25 ft bay every column lands within a few inches of a
 * line, and a floor full of obstructions came back without a mark on it. Worse,
 * the two halves of a cross-aisle layout have different bay phase, so one read
 * clear and the other did not — the same column, judged two ways.
 *
 * This is the rule the aisle branch of `verdictFrom` already learned: being
 * near a line never excuses a column that is really in the way. A 12 in column
 * does not fit inside a 3 in upright, so it is in the bay — and a deeper
 * section legitimately covers more, which is why the upright is measured rather
 * than assumed.
 */
function bayAt(
  along: number, starts: readonly number[], bayLengthFt: number, uprightIn: number,
): number {
  const colHalf = BUILDING_COLUMN_IN / 24;
  const upHalf = Math.max(0, uprightIn) / 24;
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    // Any overlap with the opening between the two uprights is an obstruction.
    if (along + colHalf > start + upHalf
      && along - colHalf < start + bayLengthFt - upHalf) return i;
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
 * What a very large floor needs saying about it.
 *
 * Advice, not a clamp. Trace used to hold any dimension over 750 ft at 750
 * and tell the customer their building had been shrunk to fit the planner,
 * which is a strange thing to say to somebody who knows how big their own
 * shed is. The layout is now drawn at whatever size is typed; what is still
 * worth saying is what a designer would do with a floor that big, which is
 * zone it — and that is a decision for them, not a limit for us.
 */
export function buildingSizeCheck(lengthFt: number, widthFt: number): Flag | null {
  const over = [
    lengthFt > BUILDING_ZONE_ADVICE_FT ? 'length' : null,
    widthFt > BUILDING_ZONE_ADVICE_FT ? 'width' : null,
  ].filter(Boolean);
  if (over.length === 0) return null;
  const biggest = Math.round(Math.max(lengthFt, widthFt));
  return {
    severity: 'check', category: 'envelope',
    title: 'Bigger than one layout usually covers',
    detail: `At ${biggest} ft the ${over.join(' and ')} `
      + `${over.length > 1 ? 'run' : 'runs'} past about ${BUILDING_ZONE_ADVICE_FT} ft, which is `
      + `where a designer stops sizing one floor and splits it into zones — receiving at one `
      + `end, reserve at the other — sizing each on its own. This layout covers the whole `
      + `floor as a single block, so treat its total as an upper bound and size the zone you `
      + `are actually working on.`,
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
        + `areas typically take 20–30% of a building — set Rack area % to about 75% or `
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
        + `${((layout.bays / (layout.crossAisles + 1)) * layout.bayLengthFt).toFixed(0)} ft by `
        + `${layout.crossAisles} cross ${layout.crossAisles === 1 ? 'aisle' : 'aisles'} of `
        + `${layout.crossAisleWidthFt} ft, costing ${layout.baysLostToCrossAisles} bays per row. `
        + `Trace keeps every continuous run under ${CROSS_AISLE_SEGMENT_FT} ft and puts each aisle `
        + `at the end of a bay, which is an assumption: fire code `
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
