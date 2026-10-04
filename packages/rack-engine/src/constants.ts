/** Standard upright frame heights, ft. */
export const FRAME_HEIGHTS_FT = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40] as const;

/** Standard beam clear spans, in. */
export const BEAM_LENGTHS_IN = [96, 108, 120, 144, 168] as const;

/** Upright column face width, in. */
export const COLUMN_WIDTH_IN = 3;

/** Pallet overhang front and back of the frame, in — frame depth = pallet depth - 2 x this. */
export const PALLET_OVERHANG_IN = 3;

/** Vertical clearance above a load before the next beam, in. */
export const LIFT_CLEARANCE_IN = 6;

/**
 * Beam face height, in — the depth of the section itself.
 *
 * It was 5, which made a 52 in load a 63 in module and put the top beam an inch
 * past the top of a 16 ft upright. A level is beamFace plus load plus lift, and
 * beam is counted *at* its level rather than as a gap below it, so a wrong face
 * here is a beam drawn outside the frame that carries it.
 */
export const BEAM_FACE_IN = 4;

/**
 * Upright above the top beam's connector, in.
 *
 * A beam hangs off a connector, and the connector needs column above it. So the
 * levels a given upright carries come from `(frameHeight - connector) / module`,
 * not from the bare height.
 */
export const BEAM_CONNECTOR_IN = 3;

/** @deprecated The face is the figure that matters; kept so nothing breaks. */
export const BEAM_HEIGHT_IN = BEAM_FACE_IN;

/** Storage must stop this far below the sprinklers, in. */
export const SPRINKLER_CLEARANCE_IN = { ceiling: 36, 'in-rack': 18 } as const;

/** Clear space assumed between the dock wall and the first rack row, ft. */
export const DOCK_APRON_FT = 12;

/**
 * Rack to wall, ft: 3 in at most. A row against a wall stands against it — the
 * gap is what it takes to stand a frame square to the wall, not a walkway —
 * on every wall, whichever way the rows run, on a floor of racking alone or a
 * mixed one, cantilever as well as pallet. Confirmed; see docs/open-questions.md.
 */
export const WALL_CLEARANCE_FT = 0.25;

/** Headroom above the top arm of a cantilever row, in. */
export const LONG_HEAD_CLEARANCE_IN = 24;

/** Cantilever upright column depth, in — added to the arms for row depth. */
export const CANTILEVER_COLUMN_IN = 6;

/** Minimum aisle any truck can turn and place a pallet in, ft. */
export const MIN_WORKING_AISLE_FT = 5.5;

/** Typical usable payload of a flatbed, lb — for truckload estimates only. */
export const TRUCK_PAYLOAD_LB = 40_000;

/** Material may hang this far past the end tower before it deflects, ft.
    Towers are added until the overhang is within it. */
export const CANTILEVER_MAX_OVERHANG_FT = 3;

/** Clear access between one run of towers and the next, ft. */
export const CANTILEVER_RUN_GAP_FT = 3;

/**
 * Flue between back-to-back rows, in.
 *
 * Not asked for, because it is not a preference. A 42 in frame carrying a 48 in
 * pallet leaves three inches hanging off each side, so the frames have to stand
 * further apart than their own depth suggests. Nine inches covers the overhang
 * either side and the transverse flue most authorities expect.
 */
export const FLUE_IN = 9;

/** Standard vertical gap between cantilever arms, in. */
export const CANTILEVER_ARM_PITCH_IN = 24;

/**
 * Load sat on the top arm, in, and the clearance kept above it.
 *
 * A tower does not stop at its top arm: the material lying on that arm has to
 * go somewhere, so the column runs past it. Drawing an arm flush with the top
 * of the column shows a rack that cannot be loaded.
 */
export const CANTILEVER_TOP_MATERIAL_IN = 12;
export const CANTILEVER_TOP_CLEARANCE_IN = 6;

/** Arm spacings a customer chooses between, in. */
export const CANTILEVER_ARM_SPACINGS_IN = [18, 24, 30, 36, 48] as const;

/**
 * Height of the base section itself, in.
 *
 * It matters twice: product rests on the base, so it is a storage level, and
 * the base stands under the first arm, so it takes height off the tower.
 */
export const CANTILEVER_BASE_HEIGHT_IN = 6;

/** Arm reaches a customer chooses between, in. Base length matches. */
export const CANTILEVER_ARM_LENGTHS_IN = [36, 48, 60, 72] as const;

/** Widest tower spacing that gets built, ft. Never exceeded. */
export const CANTILEVER_MAX_CENTRES_FT = 6;

/** Typical vertical spacing of a brace set up the tower, ft. */
export const CANTILEVER_BRACE_PITCH_FT = 4;

/**
 * Narrowest aisle that serves a cantilever row, ft.
 *
 * A truck handling 20 ft stock needs more room to turn than one handling
 * pallets, so where a cantilever strip shares an aisle with pallet racking the
 * wider figure has to win. Typical for a counterbalance truck on long loads;
 * a sideloader needs less, which is a dealer's call, not ours.
 */
export const CANTILEVER_AISLE_MIN_FT = 14;

/**
 * The building this planner will size, ft on a side.
 *
 * The maximum is a sanity bound, not a working limit. It used to be 750 —
 * held there because a floor that size costs a designer a zoning decision,
 * and because the packing search cost time proportional to the *area* of the
 * building, so a big floor with a column grid on it took seconds to solve and
 * a very big one took minutes. The second reason is gone: the search now
 * works each axis once per distinct column position rather than once per
 * column, so a 10,000 ft floor solves in about two seconds where it used to
 * take over two and a half minutes.
 *
 * The first reason was never a limit, only advice, and it is given as advice
 * now — see `buildingSizeCheck`, which says a designer would zone a floor
 * this size and leaves the customer to decide. What is left here stops a
 * mistyped dimension allocating a grid of columns big enough to take the tab
 * down with it: 10,000 ft on a side is about 2,300 acres, some forty times
 * the largest warehouse ever built, so nothing real is being refused.
 *
 * The floor is a positivity floor and nothing more. It was forty feet, and a
 * customer who typed five watched the box rewrite itself to forty — a silent
 * clamp on a number they had just measured, and the one kind of answer a
 * schedule must never give. A small building is a real building; it draws
 * small. What is refused is only a dimension that is not a length at all,
 * because the layout divides by it.
 */
export const BUILDING_FT = { min: 1, max: 10_000 } as const;

/**
 * The floor above which a designer stops sizing one layout, ft on a side.
 *
 * Past about this a floor is split into zones and each is sized on its own,
 * so a single layout over the whole thing is not the drawing anybody would
 * work from. Trace draws it anyway — it is the customer's building — and says
 * what a designer would do with it.
 */
export const BUILDING_ZONE_ADVICE_FT = 750;

/** Cantilever rows a wall strip can hold. */
export const MIXED_CANT_ROWS = { min: 1, max: 4, fallback: 1 } as const;

/** Product a cantilever run is sized for, ft. */
export const CANTILEVER_PRODUCT_FT = { min: 4, max: 60, fallback: 20 } as const;

/* ── what a building holds besides racking ─────────────────────────────── */

/**
 * Share of the footprint left for racking when the customer says "about 75%".
 *
 * Staging, shipping, offices, battery charging and dock circulation take
 * 20–30% of a typical building. The whole footprint is the optimistic case.
 */
export const AVAILABLE_THREE_QUARTERS = 0.75;

/**
 * The longest continuous rack row before it has to be broken, ft.
 *
 * Read as segments rather than as a limit: a row is cut into as many equal
 * pieces as it takes to keep each one under this, so a 240 ft row gets one
 * cross aisle in the middle and a 300 ft row gets two, not one aisle at 120 ft
 * and a short leftover.
 */
export const CROSS_AISLE_SEGMENT_FT = 120;
export const CROSS_AISLE_WIDTH_FT = 10;

/** Cross aisles a run of this length needs. */
export function crossAislesFor(runLengthFt: number): number {
  if (!Number.isFinite(runLengthFt) || runLengthFt <= 0) return 0;
  return Math.max(0, Math.ceil(runLengthFt / CROSS_AISLE_SEGMENT_FT) - 1);
}

/**
 * Arm reach a dealer would start from, in.
 *
 * Not asked for: nobody buying racking knows what arm they want, and the answer
 * follows the stock. Longer material is heavier at the tip and stacked deeper,
 * so it needs more arm under it. The dealer sizes it properly against a
 * deflection chart; this is the figure to start that conversation from.
 */
export function armLengthForProduct(productLengthFt: number): number {
  if (!Number.isFinite(productLengthFt)) return 48;
  if (productLengthFt >= 40) return 72;
  if (productLengthFt >= 24) return 60;
  if (productLengthFt >= 12) return 48;
  return 36;
}

/**
 * A building column's own size, in.
 *
 * It matters because a column has to *clear* a rack row, not merely miss its
 * centre line: one standing against a row's face blocks the bay just as surely
 * as one in the middle of it. Without a width the offset search happily parks
 * columns exactly on the band edge and calls them absorbed.
 */
export const BUILDING_COLUMN_IN = 12;

/**
 * The upright's own section along the run, in.
 *
 * What a bay line is actually made of. A frame is two uprights the frame depth
 * apart, braced together: `frameDepthIn` is how far it reaches front to back,
 * and this is how much of the run it occupies — a few inches of steel, not a
 * couple of feet.
 *
 * It matters because a building column standing at a bay line is only taken
 * round by the upright if it fits inside it, and a 12 in column does not fit
 * inside a 3 in section. See `bayAt`.
 */
export const UPRIGHT_SECTION_IN = 3;

/**
 * How badly a column lands, and what that costs the search.
 *
 * A column in the flue is free — the pair is pushed apart around it. One in a
 * bay costs that bay and nothing else. The two that were missed are worse than
 * either: a column against a pick face leaves the rack standing but the pallets
 * behind it unreachable, and a column in an aisle splits the aisle in two and
 * the truck cannot get past. A designer will lose a bay before blocking an
 * aisle, and these weights make the search do the same.
 */
/**
 * Where a building column ends up once the racking is laid around it.
 *
 * `clear` is a column standing past the end of the racking along the row — in
 * a cross aisle, or in the spare at the far end. It costs nothing and blocks
 * nothing, but it is not in a flue, and saying so mattered: the flue test
 * looked only at how far *across* the building a column was, so one standing in
 * a cross aisle was reported as absorbed into a flue that stops short of it.
 */
export type ColumnWhere = 'flue' | 'clear' | 'bay' | 'face' | 'aisle';
export const COLUMN_PENALTY: Record<ColumnWhere, number> = {
  flue: 0, clear: 0, bay: 1, face: 3, aisle: 5,
};

/**
 * Clearance across a drive-in lane, in — total, both sides together.
 *
 * The truck drives inside the rack, so the lane has to hold a pallet and leave
 * the mast room either side of it. Eight inches is the working figure; it is an
 * assumption, and `docs/open-questions.md` records it as one.
 */
export const LANE_CLEARANCE_IN = 8;

/**
 * Upright above the top rail of a drive-in lane, in.
 *
 * A beam frame stops at its top beam, because the load above it needs nothing
 * holding it. A drive-in upright does not: the top load sits between the
 * uprights, and they carry on past it to the tie that braces the two sides
 * together. Twelve inches is the working figure — another assumption, and
 * `docs/open-questions.md` records it as one.
 */
export const LANE_TIE_IN = 12;

/** How close to a rack face a column has to be to block the pallets behind it, ft. */
export const COLUMN_FACE_ZONE_FT = 2;

/** Column grid a customer who does not know theirs is offered, ft. */
export const DEFAULT_GRID_FT = 40;

/** Step the rack block is slid by when hunting for the offset that clears columns, ft. */
export const GRID_SEARCH_STEP_FT = 0.5;
