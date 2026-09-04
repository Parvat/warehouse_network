/**
 * Rack types and the model that recommends one.
 *
 * Pure data and arithmetic — no DOM, no framework. The wizard UI renders
 * whatever `rankRackTypes` returns; it never decides anything itself.
 */

export type RackKind =
  | 'selective' | 'doubledeep' | 'pushback'
  | 'drivein' | 'drivethru' | 'flow';

/** Where the truck stands to reach a pallet. Decides how a block is laid out. */
export type PickSide = 'aisle' | 'lane';

export type Rotation = 'Any' | 'LIFO' | 'FIFO';

export interface RackType {
  kind: RackKind;
  name: string;
  /** Pallets stored one behind another in a single row or lane. */
  defaultDeep: number;
  minDeep: number;
  maxDeep: number;
  pick: PickSide;
  /** Open ends a lane needs: 1 for drive-in, 2 for drive-through and flow. */
  openEnds: 0 | 1 | 2;
  rotation: Rotation;
  /** Share of pallets reachable without moving another. */
  selectivity: string;
  /** True where the material really is frames + beam pairs + wire decks. */
  standardBom: boolean;
  /**
   * True where a lane holds one pallet across, on rails, with no beam.
   *
   * The truck drives inside the rack, so a beam spanning the lane would be in
   * its path: the pallet rests on rails along the inside face of each upright
   * instead. Beam length therefore says nothing about how much these hold, and
   * the capacity comes from the pallet's own width.
   *
   * Push-back is not one of these. Its carts run two pallets wide on beams, and
   * it is picked from an aisle like selective.
   */
  onePalletLanes?: true;
  /**
   * True where a section through the row is worth drawing: the frame depth, the
   * pallets front to back, the overhang past the frame and the flue behind it.
   *
   * That is a row reached from an aisle. A lane system is defined by its depth
   * rather than described by it — its elevation already shows the lane — so a
   * second view of the same thing is a control that does nothing useful.
   */
  depthSection?: true;
  badge: string;
  blurb: string;
  bestFor: string;
  benefits: readonly string[];
}

export const RACK_TYPES: readonly RackType[] = [
  {
    kind: 'selective', name: 'Selective', defaultDeep: 1, minDeep: 1, maxDeep: 1,
    pick: 'aisle', openEnds: 0, rotation: 'Any', selectivity: '100%', standardBom: true,
    depthSection: true,
    badge: 'Most versatile',
    blurb: 'Direct access to every pallet. Best for a wide variety of SKUs and operations.',
    bestFor: 'General warehousing, distribution, retail, 3PL, mixed inventory',
    benefits: ['Direct access to every pallet', 'Works with standard sit-down trucks',
               'Cheapest per frame, easy to expand', 'Copes with heavy daily traffic'],
  },
  {
    kind: 'doubledeep', name: 'Double-deep', defaultDeep: 2, minDeep: 2, maxDeep: 2,
    pick: 'aisle', openEnds: 0, rotation: 'Any', selectivity: '50%', standardBom: false,
    depthSection: true,
    badge: 'Fewer aisles',
    blurb: 'Two pallets deep on each side. Half the aisles, so more floor goes to stock.',
    bestFor: 'Medium SKU counts where floor space is tight',
    benefits: ['A third more pallets than selective', 'Half the aisles, more floor for stock',
               'Needs a double-reach truck', 'One pallet sits behind another'],
  },
  {
    kind: 'pushback', name: 'Push-back', defaultDeep: 3, minDeep: 2, maxDeep: 6,
    pick: 'aisle', openEnds: 0, rotation: 'LIFO', selectivity: '~50%', standardBom: false,
    badge: 'High density',
    blurb: 'Multiple pallets deep on sloped carts. Last-in, first-out operation.',
    bestFor: 'Medium SKU count with multiple pallets per SKU',
    benefits: ['Carts nest two to six deep per lane', 'Loaded and picked from one aisle',
               'Much faster to fill than drive-in', 'Newest pallet comes out first'],
  },
  {
    kind: 'drivein', name: 'Drive-in', defaultDeep: 6, minDeep: 2, maxDeep: 10,
    pick: 'lane', openEnds: 1, rotation: 'LIFO', selectivity: '~15%', standardBom: false,
    onePalletLanes: true,
    badge: 'Maximum density',
    blurb: 'Forklift drives into the rack structure. Ideal for large quantities of the same SKU.',
    bestFor: 'Fewer SKUs with large quantities per SKU',
    benefits: ['The most pallets per square foot', 'Truck drives into the lane',
               'Impact damage is common in lanes', 'Best where few products dominate'],
  },
  {
    kind: 'drivethru', name: 'Drive-through', defaultDeep: 6, minDeep: 2, maxDeep: 10,
    pick: 'lane', openEnds: 2, rotation: 'FIFO', selectivity: '~15%', standardBom: false,
    onePalletLanes: true,
    badge: 'FIFO friendly',
    blurb: 'Access from both sides of the rack. Supports FIFO inventory flow.',
    bestFor: 'FIFO operations with bulk quantities and few SKUs',
    benefits: ['Dense storage that still rotates', 'Loaded one end, picked the other',
               'Needs clear aisles at both ends', 'Fewer pick faces than selective'],
  },
  {
    kind: 'flow', name: 'Pallet flow', defaultDeep: 10, minDeep: 4, maxDeep: 30,
    pick: 'lane', openEnds: 2, rotation: 'FIFO', selectivity: '~15%', standardBom: false,
    badge: 'FIFO high throughput',
    blurb: 'Gravity-fed lanes move pallets forward for smooth FIFO flow.',
    bestFor: 'High volume FIFO operations, perishable or time-sensitive goods',
    benefits: ['Gravity carries pallets to the picker', 'Deep lanes with true rotation',
               'Highest throughput when dense', 'The most expensive per position'],
  },
] as const;

export const rackType = (kind: RackKind): RackType =>
  RACK_TYPES.find((r) => r.kind === kind) ?? RACK_TYPES[0]!;

// ── the wizard ───────────────────────────────────────────────────────────

/** Distinct products held. */
export type SkuBand = 'few' | 'some' | 'many' | 'lots' | 'unknown';
/** Pallets held of the same product — the answer that decides the most. */
export type DepthBand = '1' | '3' | '6' | '10' | 'unknown';
export type RotationNeed = 'fifo' | 'any' | 'unknown';
export type Throughput = 'low' | 'mid' | 'high' | 'unknown';
export type TruckKind = 'counterbalance' | 'reach' | 'vna' | 'none';

/** Narrowest aisle each truck can work in, ft. */
export const TRUCK_AISLE_FT: Record<TruckKind, number> = {
  counterbalance: 12, reach: 9, vna: 6, none: 12,
};

/**
 * The aisle each truck actually works in, ft.
 *
 * `AISLE: 12.5` means nothing to somebody who has never specified racking, but
 * everybody knows which truck is in their building. The truck sets the aisle;
 * it does not lock it, because a designer may still trim a foot to clear a
 * column. "None yet" is priced as a counterbalance, which is what a building
 * without a truck usually ends up buying.
 */
export const TRUCK_AISLE_RANGE_FT: Record<TruckKind, { min: number; max: number }> = {
  counterbalance: { min: 12, max: 13 },
  reach: { min: 9, max: 11 },
  vna: { min: 6, max: 7 },
  // "Not sure" is priced at a plain twelve feet: a round number a customer can
  // check against their own building, and what a counterbalance works in.
  none: { min: 12, max: 12 },
};

export const TRUCK_LABEL: Record<TruckKind, string> = {
  counterbalance: 'Counterbalance',
  reach: 'Reach truck',
  vna: 'VNA / turret',
  none: 'Not sure',
};

/** The figure Trace picks for a truck: the middle of its range. */
export function truckAisleFt(truck: TruckKind): number {
  const r = TRUCK_AISLE_RANGE_FT[truck];
  return +((r.min + r.max) / 2).toFixed(2);
}

export function isTruckKind(v: string | undefined): v is TruckKind {
  return v === 'counterbalance' || v === 'reach' || v === 'vna' || v === 'none';
}

/**
 * An aisle the chosen truck cannot work in. Named as a check rather than a
 * block because the customer may know something we do not — a different truck
 * is coming, or the row is stocked from one end only.
 */
export function truckAisleCheck(
  truck: TruckKind, aisleFt: number,
): { severity: 'check'; category: string; title: string; detail: string } | null {
  const r = TRUCK_AISLE_RANGE_FT[truck];
  if (!Number.isFinite(aisleFt) || (aisleFt >= r.min && aisleFt <= r.max + 4)) return null;
  const label = TRUCK_LABEL[truck].toLowerCase();
  return aisleFt < r.min
    ? {
      severity: 'check', category: 'truck',
      title: `A ${aisleFt} ft aisle is too narrow for this truck`,
      detail: `A ${aisleFt} ft aisle will not work with a ${label}. That truck needs about `
        + `${r.min}–${r.max} ft to turn and place a pallet. Widen the aisle, or pick the truck `
        + `that suits the aisle you have.`,
    }
    : {
      severity: 'check', category: 'truck',
      title: `A ${aisleFt} ft aisle is wider than this truck needs`,
      detail: `A ${label} works in about ${r.min}–${r.max} ft, so ${aisleFt} ft is `
        + `${(aisleFt - r.max).toFixed(1)} ft of floor per aisle that could hold racking. `
        + `Narrow it, or keep the room if you are planning for a bigger truck.`,
    };
}

export interface RackAnswers {
  skuCount?: SkuBand;
  palletsPerSku?: DepthBand;
  rotation?: RotationNeed;
  throughput?: Throughput;
  truck?: TruckKind;
}

export interface RackScore {
  type: RackType;
  /** 6–99, shown to the customer. Indicative only. */
  score: number;
  /** Unclamped, for ordering and for tests. */
  raw: number;
}

/**
 * Weighted, in order of influence:
 *  1 pallets per SKU — decides whether stock can sit behind stock at all
 *  2 rotation        — strict FIFO rules the last-in-first-out systems out
 *  3 throughput      — deep lanes have few pick faces, so traffic pulls back
 *  4 SKU count       — many products need many faces, few reward depth
 *  5 truck owned     — a sit-down cannot reach the back of a double-deep bay
 *
 * The two answers that carry it are `palletsPerSku` and `rotation`; the rest
 * refine. Tie-breakers are applied AFTER the clamp so no two types ever show
 * the same figure.
 */
export function scoreRackType(kind: RackKind, a: RackAnswers): number {
  const deepT = kind === 'drivein' || kind === 'drivethru' || kind === 'flow';
  const midT = kind === 'pushback' || kind === 'doubledeep';
  const sel = kind === 'selective';
  let s = 50;

  switch (a.palletsPerSku) {
    case '1':  s += sel ? 45 : midT ? -25 : -40; break;
    case '3':  s += sel ? 18 : midT ? 30 : -18; break;
    case '6':  s += sel ? -6 : midT ? 22 : 26; break;
    case '10': s += sel ? -18 : midT ? 8 : 38; break;
  }

  if (a.rotation === 'fifo') {
    if (kind === 'drivein' || kind === 'pushback') s -= 48;
    if (kind === 'doubledeep') s -= 22;              // the back pallet is stranded
    if (kind === 'drivethru' || kind === 'flow') s += 12;
  } else if (a.rotation === 'any') {
    if (kind === 'drivein' || kind === 'pushback') s += 14;
    if (kind === 'flow') s -= 8;                     // paying for rotation you do not need
  }

  if (a.throughput === 'high') {
    if (sel) s += 26;
    if (deepT) s -= 34;
    if (kind === 'pushback') s -= 10;
    if (kind === 'doubledeep') s -= 8;
    if (kind === 'flow') s += 12;                    // the dense system built for throughput
    if (kind === 'drivein') s -= 12;                 // the truck travels the lane every time
  } else if (a.throughput === 'low' && deepT) s += 10;

  if (a.skuCount === 'lots') s += sel ? 20 : deepT ? -24 : -8;
  else if (a.skuCount === 'many') s += sel ? 14 : deepT ? -16 : -4;
  else if (a.skuCount === 'few') s += deepT ? 16 : sel ? -10 : 0;

  if (a.truck === 'counterbalance' && kind === 'doubledeep') s -= 26;
  if (a.truck === 'vna' && sel) s += 6;

  // Rotation is a hard constraint, not a preference. If stock must leave
  // oldest-first, no amount of suitable depth rescues a last-in-first-out
  // system — cap it so it can never read as a middling option.
  if (a.rotation === 'fifo') {
    if (rackType(kind).rotation === 'LIFO') s = Math.min(s, 18);
    if (kind === 'doubledeep') s = Math.min(s, 34);   // the back pallet is stranded
  }

  // Fractional, unique per type, so two systems never land on exactly the same
  // raw score. Too small to change any ranking the weights above intend.
  const nudge: Record<RackKind, number> = {
    selective: 0, flow: 0.5, drivethru: 0.4, doubledeep: -0.1, drivein: -0.2, pushback: -0.3,
  };
  return s + nudge[kind];
}

/**
 * Every type, best first, no ties.
 *
 * Ordering uses the raw score, because clamping first would flatten genuinely
 * different options onto the ceiling and let a tie-breaker decide instead of
 * the weights. The displayed figure is clamped afterwards and stepped down
 * where two would collide.
 */
export function rankRackTypes(a: RackAnswers): RackScore[] {
  const ranked = RACK_TYPES
    .map((type) => ({ type, raw: scoreRackType(type.kind, a) }))
    .sort((x, y) => y.raw - x.raw);

  let previous = Infinity;
  return ranked.map(({ type, raw }) => {
    let score = Math.max(6, Math.min(99, Math.round(raw)));
    if (score >= previous) score = previous - 1;
    previous = score;
    return { type, raw, score: Math.max(6, score) };
  });
}

/** The wizard can recommend once these two are answered. */
export const canRecommend = (a: RackAnswers): boolean =>
  !!a.palletsPerSku && !!a.rotation;
