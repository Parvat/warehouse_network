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
export function fitViewBox(e: Extent, pad = FIG_PAD, lockY?: { y0: number; y1: number }): {
  viewBox: string; w: number; h: number; aspect: number;
} {
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
  const y0 = lockY ? lockY.y0 - grow(lockY.y0 - (b.y - pad)) : b.y - pad;
  const y1 = lockY ? lockY.y1 + grow(b.y + b.h + pad - lockY.y1) : b.y + b.h + pad;
  const h = Math.max(1, y1 - y0);
  const w = Math.max(1, b.w + pad * 2);
  return {
    viewBox: `${(b.x - pad).toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`,
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
 * own share of the row. The building's own ratio is close enough to the
 * drawing's — the margins round it are small and even.
 */
export const elBox = (
  buildingLengthFt: number, buildingWidthFt: number, mixed = false,
): FigBox => {
  // The plan draws its building to a fixed size — its longest side is always the
  // same number of units — inside margins that barely move. So its shape is the
  // building's, flattened by those margins, and the bare L/W ratio overstates
  // it: a 400 x 100 shed draws at about 2.8, not 4.
  const longest = Math.max(1, buildingLengthFt, buildingWidthFt);
  const w = (470 * buildingLengthFt) / longest + 90;
  const h = (470 * buildingWidthFt) / longest + 64;
  // On a mixed floor the other elevation shares the row too.
  return {
    kind: 'row', rowPx: FIG_ROW_PX,
    sibling: Math.max(0.3, w / h) + (mixed ? EL_ASPECT : 0),
  };
};

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

export interface FittedFigure<T> {
  /** What the drawing emitted, at the settled font size. */
  drawn: T;
  viewBox: string;
  /** The shape the container should take, so the drawing fills it exactly. */
  aspect: number;
  /** The font size that was used, in viewBox units. */
  font: number;
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
  targetPx = FIG_TEXT.anno,
  /** Fixes the vertical range, for figures that have to stay comparable. */
  lockY?: (font: number) => { y0: number; y1: number },
): FittedFigure<T> {
  let font = 12, fitted = { viewBox: '0 0 100 100', w: 100, h: 100, aspect: 1 };
  let drawn = undefined as T;

  let widthPx = boxWidthPx(box, 1);
  for (let pass = 0; pass < 3; pass++) {
    const ext = newExtent();
    drawn = draw(font, ext, widthPx);
    fitted = fitViewBox(ext, FIG_PAD, lockY?.(font));
    // The shape decides the width, the width decides the units a pixel is
    // worth, and the units decide the labels — which move the shape. Three
    // passes settle it; the third moves the font by well under a per cent.
    widthPx = boxWidthPx(box, fitted.aspect);
    font = +Math.max(0.1, (Math.max(9, targetPx) * fitted.w) / widthPx).toFixed(2);
  }
  return { drawn: drawn as T, viewBox: fitted.viewBox, aspect: fitted.aspect, font };
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
  // Below the floor: the beam dimension at FL+35 and its pad. Set clear of
  // both so neither elevation has to grow its frame and part company with the
  // other on scale.
  return { y0: spY - Math.ceil(need / LOCK_STEP) * LOCK_STEP, y1: EL_FRAME.FL + 48 };
}

/** Pixels per inch, from the clear height alone, so both elevations agree. */
export function elevationPpi(clearHeightFt: number): number {
  return (EL_FRAME.FL - EL_FRAME.topPad) / Math.max(1, clearHeightFt * 12);
}
