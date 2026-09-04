/**
 * Long products — pipe, tube, bar, lumber, sheet — and the model that
 * recommends a system for them.
 *
 * This is a parallel family to `racktypes.ts`, not an extension of it. Nothing
 * in the pallet model applies: there is no pallet, so pallet depth, width,
 * loaded height and weight are all meaningless; there is no bay of pallets and
 * no flue; and capacity is linear feet of arm, not pallet positions. Scoring a
 * cantilever against selective would produce a number that means nothing.
 *
 * Pure data and arithmetic — no DOM, no framework.
 */

export type LongKind =
  | 'cantilever-rf' | 'cantilever-str' | 'cantilever-wall'
  | 'vertical' | 'stackrack';

export interface LongType {
  kind: LongKind;
  name: string;
  /** Arms on one face or both. Two-sided rows are free-standing. */
  sides: 1 | 2;
  /** Reach of one arm, in — how far the material can overhang. */
  armLengthIn: number;
  /** Vertical gap between arm levels, in. Zero where material stands on end. */
  levelPitchIn: number;
  /** Distance between uprights along the row, ft. */
  columnPitchFt: number;
  /** Rated load on a single arm, lb. */
  capacityPerArmLb: number;
  /** Rated for weather without extra treatment. */
  outdoor: boolean;
  badge: string;
  blurb: string;
  bestFor: string;
  benefits: readonly string[];
}

export const LONG_TYPES: readonly LongType[] = [
  {
    kind: 'cantilever-rf', name: 'Cantilever, roll-formed',
    sides: 2, armLengthIn: 36, levelPitchIn: 24, columnPitchFt: 4,
    capacityPerArmLb: 1200, outdoor: false,
    badge: 'Most versatile',
    blurb: 'Formed steel arms on both faces. The general-purpose long-goods system for indoor stock.',
    bestFor: 'Indoor lumber, trim, light tube and bar of mixed lengths',
    benefits: ['Arms on both faces of every row', 'Adjusts without tools as stock changes',
               'Cheapest per linear foot indoors', 'Open front — no upright blocks the load'],
  },
  {
    kind: 'cantilever-str', name: 'Cantilever, structural',
    sides: 2, armLengthIn: 48, levelPitchIn: 30, columnPitchFt: 5,
    capacityPerArmLb: 4000, outdoor: true,
    badge: 'Heaviest duty',
    blurb: 'Hot-rolled structural columns and arms. Takes the heaviest bundles and stands outside.',
    bestFor: 'Heavy pipe, structural steel, long bundles, outdoor yards',
    benefits: ['4,000 lb on a single arm', 'Rated for outdoor yards',
               'Longest arms carry the longest stock', 'Shrugs off forklift contact'],
  },
  {
    kind: 'cantilever-wall', name: 'Cantilever, single-sided',
    sides: 1, armLengthIn: 36, levelPitchIn: 24, columnPitchFt: 4,
    capacityPerArmLb: 1200, outdoor: false,
    badge: 'Wall runs',
    blurb: 'Arms on one face, braced back to the wall. Uses a run of wall that is otherwise dead.',
    bestFor: 'Perimeter walls and narrow buildings with no room for a free-standing row',
    benefits: ['Braces against the wall', 'Half the floor depth of a two-sided row',
               'Needs one aisle, not two', 'Turns dead perimeter into storage'],
  },
  {
    kind: 'vertical', name: 'Vertical rack',
    sides: 1, armLengthIn: 24, levelPitchIn: 0, columnPitchFt: 3,
    capacityPerArmLb: 800, outdoor: false,
    badge: 'Smallest footprint',
    blurb: 'Material stands on end in divided bays. The least floor per foot of stock held.',
    bestFor: 'Short bar, trim, moulding and offcuts picked by hand',
    benefits: ['Stock stands on end, not stacked', 'The least floor of any system',
               'Picked by hand without a truck', 'Only suits stock a person can lift'],
  },
  {
    kind: 'stackrack', name: 'Portable stack racks',
    sides: 1, armLengthIn: 48, levelPitchIn: 36, columnPitchFt: 4,
    capacityPerArmLb: 3000, outdoor: true,
    badge: 'Moves with the work',
    blurb: 'Free-standing frames that stack on each other and travel by forklift. No install.',
    bestFor: 'Seasonal volume, yards, and stock that moves between buildings',
    benefits: ['Stacks three or four high', 'Moves by forklift, no anchors',
               'Nests away flat when empty', 'Rated for outdoor use'],
  },
] as const;

export const longType = (kind: LongKind): LongType =>
  LONG_TYPES.find((t) => t.kind === kind) ?? LONG_TYPES[0]!;

// ── the wizard ───────────────────────────────────────────────────────────

/** Weight of a single piece or bundle as handled. */
export type PieceWeight = 'light' | 'medium' | 'heavy' | 'unknown';
/** Where the material lives. A hard constraint, not a preference. */
export type StoredWhere = 'indoor' | 'outdoor' | 'unknown';
/** Longest stock held: under 8 ft, 8–12, 12–20, over 20. */
export type PieceLength = 'short' | 'mid' | 'long' | 'xlong' | 'unknown';
/** Free floor or a run of wall. */
export type Placement = 'open' | 'wall' | 'unknown';

export interface LongAnswers {
  pieceWeight?: PieceWeight;
  where?: StoredWhere;
  pieceLength?: PieceLength;
  placement?: Placement;
}

export interface LongScore {
  type: LongType;
  /** Shown to the customer. Indicative only. */
  score: number;
  /** Unclamped, for ordering and for tests. */
  raw: number;
}

/**
 * Weighted, in order of influence:
 *  1 piece weight  — decides roll-formed against structural outright
 *  2 where stored  — outdoors is a hard constraint, not a preference
 *  3 piece length  — long stock rules vertical racks out entirely
 *  4 placement     — a wall run wants single-sided, open floor wants both
 */
export function scoreLongType(kind: LongKind, a: LongAnswers): number {
  const T = longType(kind);
  const rf = kind === 'cantilever-rf';
  const str = kind === 'cantilever-str';
  const wall = kind === 'cantilever-wall';
  const vert = kind === 'vertical';
  const stack = kind === 'stackrack';
  let s = 50;

  switch (a.pieceWeight) {
    case 'heavy':
      s += str ? 40 : stack ? 22 : vert ? -45 : -25;
      break;
    case 'medium':
      s += rf ? 22 : wall ? 18 : str ? 8 : stack ? 6 : -8;
      break;
    case 'light':
      s += vert ? 20 : rf ? 18 : wall ? 16 : str ? -10 : -6;
      break;
  }

  if (a.where === 'outdoor') s += T.outdoor ? 30 : -45;
  else if (a.where === 'indoor') s += str ? -4 : stack ? -6 : 8;

  switch (a.pieceLength) {
    case 'xlong': s += str ? 26 : stack ? 10 : rf ? 4 : wall ? 2 : -40; break;
    case 'long':  s += str ? 18 : rf ? 6 : stack ? 6 : wall ? 4 : -28; break;
    case 'mid':   s += rf ? 10 : wall ? 8 : str ? 6 : stack ? 6 : 2; break;
    case 'short': s += vert ? 32 : rf ? 4 : wall ? 4 : stack ? -4 : -8; break;
  }

  if (a.placement === 'wall') s += T.sides === 1 ? 18 : -16;
  else if (a.placement === 'open') s += T.sides === 2 ? 16 : -10;

  // Two hard constraints. Weather and length are not preferences that enough
  // suitability can outweigh — a system that cannot stand outside must never
  // read as a middling option, and neither must a rack the stock will not fit.
  if (a.where === 'outdoor' && !T.outdoor) s = Math.min(s, 30);
  if (a.pieceLength === 'xlong' && vert) s = Math.min(s, 12);
  if (a.pieceLength === 'long' && vert) s = Math.min(s, 22);

  // Fractional and unique per system, so two never land on the same raw score.
  // Too small to change any ranking the weights above intend.
  const nudge: Record<LongKind, number> = {
    'cantilever-str': 0.5, 'cantilever-rf': 0.3, 'cantilever-wall': 0.1,
    stackrack: -0.2, vertical: -0.4,
  };
  return s + nudge[kind];
}

/**
 * Every system, best first, no ties.
 *
 * Ordering uses the raw score, because clamping first would flatten genuinely
 * different options onto the ceiling and let a tie-breaker decide instead of
 * the weights. The displayed figure is clamped afterwards and stepped down
 * where two would collide — and the step is allowed to fall below the display
 * floor, or several poor options all read as the same number.
 */
export function rankLongTypes(a: LongAnswers): LongScore[] {
  const ranked = LONG_TYPES
    .map((type) => ({ type, raw: scoreLongType(type.kind, a) }))
    .sort((x, y) => y.raw - x.raw);

  let previous = Infinity;
  return ranked.map(({ type, raw }) => {
    let score = Math.max(6, Math.min(99, Math.round(raw)));
    if (score >= previous) score = previous - 1;
    previous = score;
    return { type, raw, score };
  });
}

/** The wizard can recommend once weight and where-stored are answered. */
export const canRecommendLong = (a: LongAnswers): boolean =>
  !!a.pieceWeight && !!a.where;
