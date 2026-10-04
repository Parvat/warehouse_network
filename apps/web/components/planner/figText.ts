/**
 * How a figure is sized.
 *
 * The old way round: draw at fixed constants — `maxW = 470, maxH = 210` — wrap
 * the result in a viewBox padded by fixed amounts, and let the SVG scale the
 * whole padded box down to fit. The drawing came out the same size whatever
 * room it had, the padding was magnified along with it, and every change to a
 * container moved the scale factor instead of the drawing. That is where the
 * empty margins came from, and why the layout shifted after every edit.
 *
 * This way round: draw at whatever internal scale is convenient, record the
 * true bounds of everything emitted, fit the viewBox to those bounds plus a
 * small uniform pad, and hand the container the aspect ratio that came out.
 * The SVG then fills its box exactly — no letterboxing, because the box and
 * the drawing are the same shape by construction — and the drawing scales with
 * the container instead of being scaled down inside it.
 *
 * SVG text is written in viewBox units, so a font size means nothing until the
 * scale is known, and the scale is not known until the text has been laid out.
 * `fitFigure` closes that loop by iterating: three passes settle it.
 */

/* ── extents ──────────────────────────────────────────────────────────── */

/**
 * Metrics for JetBrains Mono, which is every callout on every figure.
 *
 * A monospaced face has one advance width, so a label's box is arithmetic
 * rather than measurement — which matters because the viewBox has to be known
 * on the server, where nothing can be measured.
 */
export const MONO = { advance: 0.6, ascent: 0.78, descent: 0.22 } as const;

export interface Rect { x: number; y: number; w: number; h: number }

/** What a figure actually covers. Fed by the drawing as it goes. */
export interface Extent {
  /** A rectangle, or a point when width and height are left out. */
  add(x: number, y: number, w?: number, h?: number): void;
  /** A label, boxed from the mono metrics and its anchor. */
  text(a: {
    x: number; y: number; size: number; text: string;
    anchor?: 'start' | 'middle' | 'end';
    /** Degrees, as passed to `rotate()`. Only 0 and -90 occur on the sheet. */
    rotate?: 0 | -90;
  }): void;
  /** The box everything landed in, or null where nothing was drawn. */
  box(): Rect | null;
}

export function newExtent(): Extent {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number, w = 0, h = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x, x + w); x1 = Math.max(x1, x, x + w);
    y0 = Math.min(y0, y, y + h); y1 = Math.max(y1, y, y + h);
  };
  return {
    add,
    text({ x, y, size, text, anchor = 'start', rotate = 0 }) {
      const w = text.length * MONO.advance * size;
      const asc = MONO.ascent * size, desc = MONO.descent * size;
      // The anchor slides the run along its own baseline; the rotation then
      // turns that baseline. Getting this wrong crops a label off an edge,
      // which is the one failure a viewBox fitted to its contents can still
      // have — so both cases are written out rather than approximated.
      const lead = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
      if (rotate === -90) add(x - asc, y - lead - w, asc + desc, w);
      else add(x + lead, y - asc, w, asc + desc);
    },
    box() {
      if (!Number.isFinite(x0)) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
  };
}

/** The uniform pad around a fitted drawing, in viewBox units. */
export const FIG_PAD = 8;

/**
 * The step a locked frame is rounded to.
 *
 * Two elevations shown together must share a scale, and their scale comes from
 * the height of the frame they are drawn in. Rounding to a step means a couple
 * of units' difference in what each needs collapses to the same frame.
 */
const LOCK_STEP = 4;

/**
 * A viewBox from an extent, with the pad added on every side alike.
 *
 * `lockY` fixes the vertical range instead of fitting it. Two elevations shown
 * together have to be comparable — one floor line, one clear height, one scale
 * — and a box fitted to each drawing's own height gives none of that: the
 * taller tower simply gets a taller box and a smaller scale. Locking the
 * vertical range to the frame they share, and fitting only the width, keeps
 * them in step while still letting each be as wide as it needs.
 */
export function fitViewBox(
  e: Extent,
  pad = FIG_PAD,
  lockY?: { y0: number; y1: number },
  lockX?: { x0: number; x1: number },
  /**
   * Puts this x at the middle of the fitted box, by growing whichever side of
   * it is the shorter. A drawing whose annotation hangs further off one side
   * than the other is otherwise centred on its labels rather than on itself,
   * which reads as the drawing having slid across its frame.
   */
  centreX?: number,
  /**
   * Puts this figure's floor at `fraction` of the box height, by growing the
   * box on whichever side of it is short. See `floorFraction`.
   */
  floorAt?: { y: number; fraction: number },
): { viewBox: string; w: number; h: number; aspect: number } {
  const b = e.box() ?? { x: 0, y: 0, w: 100, h: 100 };
  // A locked range still has to contain what was drawn: a label that rises
  // above it is cropped along its top edge, and a cropped annotation on a
  // technical drawing reads as a fault in the drawing. So the lock is a
  // minimum, quantised so that two figures needing slightly different room
  // still land on the same frame and keep their scales in step.
  // The expansion is measured from the lock, not from zero, so two figures
  // that both need a little more room grow by the same step and keep the same
  // frame height — and two that need none stay exactly equal.
  const grow = (over: number) => Math.ceil(Math.max(0, over) / LOCK_STEP) * LOCK_STEP;
  let y0 = lockY ? lockY.y0 - grow(lockY.y0 - (b.y - pad)) : b.y - pad;
  let y1 = lockY ? lockY.y1 + grow(b.y + b.h + pad - lockY.y1) : b.y + b.h + pad;
  // The same for the width, where a figure has two views to show: a box fitted
  // to whichever is on screen would resize and re-centre the drawing every time
  // the reader switched, which is a layout jumping about rather than a drawing
  // being looked at from a second angle.
  let x0 = lockX ? lockX.x0 - grow(lockX.x0 - (b.x - pad)) : b.x - pad;
  let x1 = lockX ? lockX.x1 + grow(b.x + b.w + pad - lockX.x1) : b.x + b.w + pad;
  if (centreX !== undefined) {
    const reach = Math.max(centreX - x0, x1 - centreX);
    x0 = centreX - reach; x1 = centreX + reach;
  }
  // The floor last, because it moves the vertical range and nothing else may
  // move it afterwards. Only ever grows: the range already contains everything
  // that was drawn, and cropping a drawing to line it up with another one is
  // not lining them up.
  if (floorAt && y1 > y0) {
    const f = Math.min(0.999, Math.max(0.001, floorAt.fraction));
    const at = (floorAt.y - y0) / (y1 - y0);
    if (at > f) y1 = y0 + (floorAt.y - y0) / f;            // room under the floor
    else if (at < f) y0 = (floorAt.y - f * y1) / (1 - f);  // room over it
  }
  const h = Math.max(1, y1 - y0);
  const w = Math.max(1, x1 - x0);
  return {
    viewBox: `${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`,
    w, h, aspect: w / h,
  };
}

/* ── the loop between the font size and the box it lives in ───────────── */

/**
 * How wide this figure's container will be, in CSS pixels.
 *
 * Two arrangements, because the CSS has two. In a row the width is handed out
 * in proportion to the drawings' aspect ratios, so a figure's share is its own
 * ratio over the row's total — which means the width cannot be a constant when
 * the building can be 400 x 100 or 150 x 150. In a row of fixed height the
 * width simply follows: height times ratio.
 *
 * Guessing this wrong is what made the type shrink on unusual buildings, so it
 * is computed from the same ratios the layout uses rather than estimated.
 */
export type FigBox =
  /** Sharing a row: this figure's width is its share of it. */
  | { kind: 'row'; rowPx: number; sibling: number }
  /** A row of fixed height: the width follows the drawing's own shape. */
  | { kind: 'height'; heightPx: number };

/** The container width a fitted drawing of this shape will get. */
function boxWidthPx(box: FigBox, aspect: number): number {
  return box.kind === 'height'
    ? box.heightPx * aspect
    : box.rowPx * (aspect / Math.max(0.01, aspect + box.sibling));
}

/**
 * Reference widths, in CSS pixels at a 1440 viewport.
 *
 * 1280 wrap, less 24 px padding each side, the sheet's 2 px border, the stage's
 * 16 px padding and the 24 px gap: 1172 px of row. Type is sized against this
 * and scales with the viewport from there.
 */
export const FIG_ROW_PX = 1172;

/**
 * The drawing area of the elevation row, in CSS pixels.
 *
 * That row fixes its height rather than following it: a portrait drawing handed
 * half of a twelve-hundred-pixel row would stand a thousand pixels tall. Mirror
 * of `.a3 .elpair > .figbox` in sheet.css, less the heading and the pad.
 */
export const EL_ROW_PX = 492;

/**
 * An elevation's shape, near enough.
 *
 * The plan's ratio changes with the building; an elevation's does not — it
 * comes off the clear height and the frame, which are the same building to
 * building. So the plan can be told what shares the row with it, and only the
 * elevation needs telling what it is sharing with.
 */
export const EL_ASPECT = 0.55;

/** The arrangements the sheet actually uses. */
export const FIG_BOX = {
  /** Fig. 1 on a row of its own, which is what a mixed floor gives it. */
  planWide: { kind: 'row', rowPx: FIG_ROW_PX, sibling: 0 },
  /** Two elevations on their own row, at the height that row fixes. */
  elPair: { kind: 'height', heightPx: EL_ROW_PX },
} as const satisfies Record<string, FigBox>;

/**
 * Fig. 1 beside the elevations that belong with it.
 *
 * A mixed floor puts two elevations on the row, so the plan is sharing with
 * twice as much portrait drawing and gets a correspondingly smaller share.
 */
export const planBox = (mixed = false): FigBox =>
  ({ kind: 'row', rowPx: FIG_ROW_PX, sibling: EL_ASPECT * (mixed ? 2 : 1) });

/**
 * An elevation beside the plan, told the plan's shape so it can work out its
 * own share of the row.
 */
export const elBox = (mixed = false): FigBox => ({
  kind: 'row', rowPx: FIG_ROW_PX,
  // On a mixed floor the other elevation shares the row too.
  sibling: PLAN_ASPECT + (mixed ? EL_ASPECT : 0),
});

/**
 * The shape Fig. 1 comes out, which no longer depends on the building.
 *
 * The plan is drawn in a fixed frame and the building is fitted inside it, so
 * its box is one shape whatever is on the floor. This is what the elevation is
 * told it shares the row with.
 *
 * It used to be handed the building's own ratio, which meant the elevation's
 * share — and so its type size, and so the extent its labels came to, and so
 * its own shape — moved every time the footprint did. The plan's box then moved
 * with it, because a row divides its width between the shapes in it: Fig. 1 had
 * a fixed shape of its own and still changed size, because Fig. 2 beside it did
 * not. The figures still share the row and still come out one height; what is
 * gone is the building reaching into the estimate.
 */
export const PLAN_ASPECT = 1.87;

/**
 * The frame Fig. 1 is drawn in, whatever sheet it is on and whatever building.
 *
 * The building used to set the shape of its own box — its longest side was
 * always the same number of units, so a square floor drew a square box and the
 * whole figure grew a third taller than the same sheet with a long shed on it.
 * A reader flicking between two buildings watched the paper change size rather
 * than the building.
 *
 * Fixed, the way `elevationFrameY` fixes an elevation's: the frame is the same
 * and the building is fitted into it. A long shed fills it across; a square
 * floor draws smaller and square inside the same frame, letterboxed either
 * side.
 */
export const PLAN_FRAME = { x: 74, y: 40, w: 470, h: 260 } as const;

/** A building fitted into that frame: the scale, and where it lands in it. */
export function planFit(buildingLengthFt: number, buildingWidthFt: number): {
  sc: number; w: number; h: number; px: number; py: number;
} {
  // Whichever of the two runs out first, so the whole building is inside.
  const sc = Math.min(
    PLAN_FRAME.w / Math.max(1, buildingLengthFt),
    PLAN_FRAME.h / Math.max(1, buildingWidthFt),
  );
  const w = buildingLengthFt * sc, h = buildingWidthFt * sc;
  return {
    sc, w, h,
    // Centred across the frame, and stood on its floor rather than centred down
    // it: the back wall is the line the elevations beside this stand on, so it
    // has to be in the same place whatever shape the building is.
    px: PLAN_FRAME.x + (PLAN_FRAME.w - w) / 2,
    py: PLAN_FRAME.y + (PLAN_FRAME.h - h),
  };
}

/**
 * The locks that hold the frame open, whatever is drawn in it.
 *
 * Fitted to its contents the box would follow the building again by another
 * route: a square floor puts its dimension lines and its margin labels in
 * different places from a long one, and the box closes around them. These are
 * set past the furthest any callout reaches, plus the uniform pad — a lock is a
 * minimum, and a range the contents overrun is grown a step.
 */
export function planFrameX(): { x0: number; x1: number } {
  return { x0: PLAN_FRAME.x - 76, x1: PLAN_FRAME.x + PLAN_FRAME.w + 70 };
}

/** And down, with the back wall landing where the elevations put their floor. */
export function planFrameY(font: number): { y0: number; y1: number } {
  const y0 = PLAN_FRAME.y - 44;
  return { y0, y1: y0 + (PLAN_FRAME.y + PLAN_FRAME.h - y0) / floorFraction(font) };
}

/**
 * What every figure aims for, in rendered pixels.
 *
 * One size for every callout on every figure — plan and elevation, label and
 * dimension and level marker alike. They are all read the same way, by someone
 * checking a number against a drawing, and a hierarchy of sizes only invites
 * the reader to think some of them matter less. The figure caption above each
 * drawing is the exception: it is body text, and it sits outside the SVG.
 */
export const FIG_TEXT = { anno: 10, tiny: 10, dim: 10 } as const;

/**
 * A cantilever tower's mark in plan, screen pixels: the column section — a
 * slim post the arms stand out from, not the base under them.
 *
 * Held in the proportion to the arms the marks had in 31d72d7 (3.2 × 5.2 units
 * beside 0.9-unit arms). The mark itself never changed size; the arms went to
 * a fixed 0.75 px with the rest of the strokes, and the towers were left
 * looking heavy beside them. In pixels like the strokes, so the expanded view
 * keeps the same proportion.
 */
export const TOWER_MARK_PX = { along: 2.7, across: 4.3 } as const;

/**
 * Line weights, in screen pixels, by what the line is.
 *
 * Every figure stroke is drawn with `vector-effect: non-scaling-stroke` (set
 * once in sheet.css), so these are pixels on the screen rather than units of
 * the drawing. Sized in drawing units they grew with the figure — heavy on the
 * sheet and twice as heavy in the expanded view — while the type beside them
 * stayed put. Fixed in pixels, a plan reads the same weight at any size, and
 * the order of weights is what tells one kind of line from another: the wall
 * heaviest, then the racking, then its members, dividers lightest.
 */
export const STROKE = {
  /** The building's wall, and the floor an elevation stands on. */
  wall: 1.75,
  /** The outline of racking: a row's faces, a tower's spine, a frame. */
  rack: 1,
  /** A member inside the racking: a beam, a flue, an arm, bracing. */
  beam: 0.75,
  /** Between bays, and between pallets in depth. */
  divider: 0.5,
  /** Dimension lines, their ticks and their extension lines. */
  dim: 0.75,
  /** Dashed lines: staging, cross aisles, the shared aisle, clear height. */
  dash: 0.75,
} as const;

/**
 * How much larger the building's own overall dimension reads than everything
 * else on the sheet.
 *
 * Every other callout is one size — see `FIG_TEXT` above — because they are
 * all read the same way. The building's own length and width are not another
 * callout: they are the headline figure the whole plan sizes itself to, and a
 * drawing where that number reads the same size as an aisle width buries it
 * in the detail it should stand above.
 */
export const BUILDING_DIM_SCALE = 1.3;

/**
 * The ways a figure can be constrained beyond its own contents.
 *
 * An object rather than a tail of positional arguments: there are six of them,
 * every figure uses two or three, and passing `undefined` four times to reach
 * the one that matters is how a call site stops saying what it means.
 */
export interface FitOptions {
  /** The size a callout should land at on screen, in CSS pixels. */
  targetPx?: number;
  /** Fixes the vertical range, for figures that have to stay comparable. */
  lockY?: (font: number) => { y0: number; y1: number };
  /** Fixes the horizontal range, for a figure with more than one view. */
  lockX?: (font: number) => { x0: number; x1: number };
  /**
   * Draws the figure's other views into the same extent, for their bounds only.
   * A figure that can be looked at two ways has to be boxed for both, or the
   * box resizes when the reader switches — and the drawing slides across the
   * page instead of turning on the spot.
   */
  measureAlso?: (font: number, ext: Extent, widthPx: number) => void;
  /** Centres the fitted box on this x, as `fitViewBox` describes. */
  centreX?: number;
  /** Puts this figure's floor on the sheet's baseline. See `floorFraction`. */
  floorAt?: (font: number) => { y: number; fraction: number };
}

export interface FittedFigure<T> {
  /** What the drawing emitted, at the settled font size. */
  drawn: T;
  viewBox: string;
  /** The fitted box, in viewBox units — what a pixel scale is measured against. */
  w: number;
  h: number;
  /** The shape the container should take, so the drawing fills it exactly. */
  aspect: number;
  /** The font size that was used, in viewBox units. */
  font: number;
  /**
   * The same drawing fitted to another box — the expanded view's. Drawn again
   * rather than magnified, so type stays the sheet's size on screen and every
   * label that decides whether it fits decides at the scale it is shown at.
   *
   * Fitted to its own bounds, not the sheet's frame. The frame is there so the
   * figures on a row agree with each other — one floor line across the sheet —
   * and the expanded view shows one figure alone, with nothing beside it to
   * agree with. Held to the frame, a long shed sat at the foot of the window
   * under a band of empty paper. The figure on the sheet keeps its frame.
   */
  refit: (box: FigBox) => FittedFigure<T>;
}

/**
 * Draw, measure, resize the type, draw again.
 *
 * The font size is in viewBox units but is chosen for the pixels it lands at,
 * and the viewBox is not known until the labels have been placed — so the two
 * chase each other. Three passes is plenty: the labels move the box by a few
 * per cent at most, and the font by less each time.
 *
 * Nothing goes below 9 px, which is the floor for a drawing callout.
 */
export function fitFigure<T>(
  box: FigBox,
  /**
   * Draws the figure. `widthPx` is the room it will actually get on screen,
   * which is what decides how much detail is worth drawing — and it grows with
   * the zoom, so detail comes back as the customer magnifies.
   */
  draw: (font: number, ext: Extent, widthPx: number) => T,
  {
    targetPx = FIG_TEXT.anno, lockY, lockX, measureAlso, centreX, floorAt,
  }: FitOptions = {},
): FittedFigure<T> {
  let font = 12, fitted = { viewBox: '0 0 100 100', w: 100, h: 100, aspect: 1 };
  let drawn = undefined as T;

  let widthPx = boxWidthPx(box, 1);
  for (let pass = 0; pass < 3; pass++) {
    const ext = newExtent();
    drawn = draw(font, ext, widthPx);
    measureAlso?.(font, ext, widthPx);
    fitted = fitViewBox(ext, FIG_PAD, lockY?.(font), lockX?.(font), centreX, floorAt?.(font));
    // The shape decides the width, the width decides the units a pixel is
    // worth, and the units decide the labels — which move the shape. Three
    // passes settle it; the third moves the font by well under a per cent.
    widthPx = boxWidthPx(box, fitted.aspect);
    font = +Math.max(0.1, (Math.max(9, targetPx) * fitted.w) / widthPx).toFixed(2);
  }
  return {
    drawn: drawn as T, viewBox: fitted.viewBox,
    w: fitted.w, h: fitted.h, aspect: fitted.aspect, font,
    refit: (other) => fitFigure(other, draw, { targetPx, measureAlso }),
  };
}

/* ── the elevation's shared frame ─────────────────────────────────────── */

/**
 * The frame both elevations share.
 *
 * Shown side by side they have to be comparable, and that means one floor line,
 * one scale and one clear height across both. Each figure drawn to its own
 * scale puts the two floors at different heights on the page, which is the one
 * thing a reader is entitled to compare directly.
 *
 * The floor is the datum: everything is measured up from `FL`. The half width
 * is gone — the viewBox is fitted to what each drawing covers now, and a pair
 * is kept in step by being handed the same box rather than the same margins.
 */
export const EL_FRAME = {
  FL: 548,
  CX: 280,
  /** Headroom above the floor for the drawing itself. */
  topPad: 90,
} as const;

/**
 * The vertical range every elevation is drawn in.
 *
 * From the clear-height label down past the floor to the dimensions under it.
 * Both elevations compute it from the same clear height, so both get the same
 * frame — which is what puts their floors on one line and their scales in step,
 * without either needing to know the other exists.
 */
export function elevationFrameY(spY: number, font: number): { y0: number; y1: number } {
  // Room for the clear-height label, which sits seven units above the sprinkler
  // line and rises by its own cap height from there. A fixed sixteen units was
  // enough for a small figure and cropped the label on a large one. Rounding to
  // the lock step keeps two elevations on one frame, and so on one scale.
  // Seven units above the sprinkler line, the cap height above that, and the
  // uniform pad above that again — the three things between the label and the
  // top edge. Ten was the offset and the cap height only, which left the pad
  // to be found by growing the frame a step.
  const need = 7 + font * MONO.ascent + FIG_PAD;
  // Below the floor: the width rule at FL+15 with its ticks to FL+20, the label
  // the section puts under it at FL+29, and the uniform pad beneath that — 40
  // units, and the section lands at 39.2 of them.
  //
  // Set clear of the lot, and it has to stay clear: `floorFraction` reads this
  // range to place the floor, but `fitViewBox` grows a lock that its contents
  // overrun. A range a hair under what the section draws would be grown a whole
  // step for that view alone, and the plan — fitted to the range as written —
  // would part company with the elevation it is supposed to stand level with.
  //
  // No clearer either: every spare unit is empty floor between the drawing and
  // whatever is written beneath the figure.
  return { y0: spY - Math.ceil(need / LOCK_STEP) * LOCK_STEP, y1: EL_FRAME.FL + 40 };
}

/**
 * Where the floor stands in a figure's box, as a fraction of its height.
 *
 * Every drawing on the sheet is of one building, and they are read across it —
 * so the floor has to be at one height on the page rather than at whatever
 * height each drawing's own contents happen to put it. Fitted separately they
 * come out ragged: the elevation reserves room under its floor for the width
 * dimension and the label naming it, the plan reserves none under its back
 * wall, and the two floors land a good thirty pixels apart.
 *
 * The elevation is the figure with the real constraint below the floor, so the
 * fraction is taken from its frame and everything else is fitted to match. It
 * is derived once, here, rather than each figure choosing its own origin.
 *
 * The sprinkler line is the datum the elevation's frame is built from, and it
 * is always `topPad`: `elevationPpi` divides the room above the floor by the
 * clear height, so the clear height always measures back to the same place.
 */
export function floorFraction(font: number): number {
  const { y0, y1 } = elevationFrameY(EL_FRAME.topPad, font);
  return (EL_FRAME.FL - y0) / (y1 - y0);
}

/** Pixels per inch, from the clear height alone, so both elevations agree. */
export function elevationPpi(clearHeightFt: number): number {
  return (EL_FRAME.FL - EL_FRAME.topPad) / Math.max(1, clearHeightFt * 12);
}

/* ── one rule for a label that names a row from outside the building ────── */

/**
 * An aisle width, past the building rather than inside the gap — the fallback
 * `insideAisleLabel` reaches for once `aisleLabelFits` says the gap has no
 * room left for it on screen. Never inside the building, never over the
 * racking, on the axis the rows stack on: the right margin when that axis
 * runs left to right, the margin past the *top* wall once the racking has
 * turned to run down the page.
 *
 * A cantilever row's own "2 sides" used to be called out from here too. It
 * is gone rather than moved: which rows are armed from both sides is already
 * on the placard ("Sides armed"), and a run of many interior rows put one
 * of these in the margin for every row it drew — the same cost paid once per
 * aisle below, now paid once per row, on a strip long enough to still change
 * the sheet's scale between orientations even after aisle labels moved
 * inside. There is no equivalent "inside" for a row's own label the way an
 * aisle has a gap to sit in, so it had nowhere left to go.
 *
 * Top, not bottom, for what does still land here — this was tried below the
 * building first, and it silently scaled the whole sheet. Fig. 1 and Fig. 2
 * share a row whose width each gets in proportion to its own aspect ratio,
 * and Fig. 1's aspect is locked to Fig. 2's floor line, which `floorAt` holds
 * at floorFraction() of the frame — about 92% of it, because a section has so
 * little to say below its floor. Content added *below* the plan's floor has
 * to be matched by growing the room *above* it by roughly
 * floorFraction / (1 - floorFraction) to hold that 92:8 split — about 12
 * units for every 1 added below. A row of labels only needed about 30 units
 * below the wall, and that alone bloated the plan's fitted box by twelve
 * times as much again, on one orientation and not the other — which is what
 * made every figure on the sheet visibly larger the moment the racking was
 * turned to run down the page. Above the floor that same content only has to
 * be matched in the other direction, at roughly 1:1, so it costs the frame
 * what it actually is and no more.
 *
 * The label reads along the row it names either way: normal text in the right
 * margin, rotated so the running direction still matches once the racking
 * has turned with the orientation.
 */
export function outsideRowLabel(ext: Extent, a: {
  vertical: boolean;
  /** The building's screen box, in the same units as `acrossPx`. */
  px: number; py: number; w: number; h: number;
  /** The row's own position on the axis rows stack on, in screen units from
   *  the same origin as `px`/`py` — already multiplied by scale. */
  acrossPx: number;
  text: string;
  size: number;
  fill: string;
}): { x?: number; y?: number; transform?: string; textAnchor?: 'start' | 'middle' | 'end' } {
  if (a.vertical) {
    // Above, clear of the building-length dimension and its (deliberately
    // larger — see BUILDING_DIM_SCALE) label, which together reach to about
    // `py - 34`, and this label's own rotated half-length reaching up from
    // its anchor besides. Kept to the minimum that clears them: every unit
    // added here is a unit the whole sheet grows by relative to the other
    // orientation (see the note above), so generous padding here is not free.
    const w = a.text.length * MONO.advance * a.size;
    const y = a.py - 34 - 3 - w / 2;
    ext.text({ x: a.px + a.acrossPx, y, size: a.size, text: a.text, anchor: 'middle', rotate: -90 });
    return {
      transform: `translate(${(a.px + a.acrossPx).toFixed(1)} ${y.toFixed(1)}) rotate(-90)`,
      textAnchor: 'middle',
    };
  }
  const x = a.px + a.w + 6, y = a.py + a.acrossPx + 3;
  ext.text({ x, y, size: a.size, text: a.text });
  return { x, y };
}

/**
 * An aisle width, read inside the gap it dimensions rather than past the
 * building — the position is the caller's (each plan already has its own
 * along/across mapping to place it with), this standardises only how it
 * reads once placed: centred on the point given, rotated to keep reading
 * along the aisle once the racking turns to run down the page.
 *
 * Outside the wall was tried first. It works for one orientation only: the
 * building never rotates, so a label added past the wall on the axis rows
 * stack on costs that plan real height in one orientation and real width in
 * the other — never the same amount, on a building that is not square, and
 * Fig. 1 and Fig. 2 share a row whose split follows Fig. 1's own aspect. So
 * turning the racking changed how much of the row Fig. 2 got, which read as
 * the whole sheet being redrawn at another size rather than turned on the
 * spot. Inside the gap costs nothing outside what the building already
 * occupies, in either orientation, which is what actually holds the two
 * figures to one scale.
 */
export function insideAisleLabel(ext: Extent, a: {
  vertical: boolean;
  /** Where the label centres, in the same screen units the caller draws in. */
  x: number; y: number;
  text: string;
  size: number;
}): { x?: number; y?: number; transform?: string; textAnchor: 'middle' } {
  if (a.vertical) {
    ext.text({ x: a.x, y: a.y, size: a.size, text: a.text, anchor: 'middle', rotate: -90 });
    return {
      transform: `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(-90)`,
      textAnchor: 'middle',
    };
  }
  ext.text({ x: a.x, y: a.y, size: a.size, text: a.text, anchor: 'middle' });
  return { x: a.x, y: a.y, textAnchor: 'middle' };
}

/**
 * Whether an aisle this wide on screen actually has room for its own label.
 *
 * A very large building can shrink the same aisle width to a few pixels on
 * screen, and a label does not get smaller with it — every callout on the
 * sheet is one size (see `FIG_TEXT`). Rotated or not, the label's own text
 * length always ends up running *along* the row it names, where there is
 * always room — that is the length of the whole rackable floor. What has to
 * fit *across*, into the aisle gap itself, is only ever one line's thickness:
 * ascent plus descent, the short axis whichever way the text is turned.
 * Below that, `insideAisleLabel` would not sit in the gap so much as print
 * over the row on either side of it, which is worse than the scale cost of
 * falling back to the margin for this one label — see `outsideRowLabel`.
 */
export function aisleLabelFits(a: { aisleFt: number; sc: number; size: number }): boolean {
  const need = a.size * (MONO.ascent + MONO.descent) + 4;
  return a.aisleFt * a.sc >= need;
}

/**
 * Where a cross aisle actually sits, once the floor either side of it is
 * accounted for.
 *
 * The solver places it flush against the segment that follows: `atFt` is
 * where that segment's own arithmetic starts counting from, and nothing
 * before it matters to that arithmetic. But a segment rarely divides evenly
 * into whole modules, so the last one before the gap often falls short of its
 * nominal edge — and flush against one true rack face, short of the other, is
 * not centred in the gap a reader can actually see.
 *
 * The aisle keeps its true, engineered width — this changes nothing a
 * customer is quoted — it is only recentred in whatever floor is actually
 * free between the two real rack faces either side of it. Which faces those
 * are is the caller's to say: a plan with one zone passes its own bay ends and
 * starts, and a mixed floor passes both zones' — a cantilever run and a
 * pallet bay do not divide a segment the same way, so the nearer real face on
 * each side can come from either one.
 */
export function centeredCrossAisleFt(a: {
  atFt: number;
  widthFt: number;
  /** Where a real rack face ends, for every module that could be the one
   *  immediately before this gap. */
  endsBeforeFt: readonly number[];
  /** Where a real rack face starts, for every module that could be the one
   *  immediately after this gap. */
  startsAfterFt: readonly number[];
}): number {
  const before = a.endsBeforeFt.filter((e) => e <= a.atFt + 0.02);
  const after = a.startsAfterFt.filter((s) => s >= a.atFt + a.widthFt - 0.02);
  if (before.length === 0 || after.length === 0) return a.atFt;
  const rackEndA = Math.max(...before);
  const rackStartB = Math.min(...after);
  return (rackEndA + rackStartB) / 2 - a.widthFt / 2;
}
