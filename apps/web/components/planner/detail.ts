/**
 * How much of a drawing to draw.
 *
 * Around 750 ft on a side is where full detail stops being worth drawing:
 * about 38 rows of 90 bays, some ten thousand shapes, each bay landing at
 * about six pixels in a figure six hundred wide. There is no longer a size
 * the planner refuses — a floor can be any size a customer's building is —
 * so this decides how much of one to draw, at whatever size it comes.
 *
 * Two levels, not three. The third existed to collapse rows into a plain
 * band, and that was worse than drawing every bay plainly.
 *
 * Draw less, never softer. A blurred or faded technical drawing reads as
 * broken; a banded one reads as a summary, and says so underneath.
 *
 * The level is a *drawing* decision and nothing else. Every count on the sheet
 * comes from the solver, so simplifying the picture can never move a number.
 */

export type DetailLevel = 'full' | 'banded';

export interface Detail {
  level: DetailLevel;
  /** Rendered pixels one foot of building gets. */
  pxPerFt: number;
  /** Rendered pixels one bay gets, which is what the level is chosen from. */
  pxPerBay: number;
  /** Bay ticks, per-bay frames and the flue strip. */
  bays: boolean;
  /** A label against each row, and each aisle dimensioned where it falls. */
  perRowLabels: boolean;
  /** Columns drawn one by one, rather than as guide lines. */
  columnsIndividually: boolean;
  /** Shapes full detail would have emitted, which is what the ceiling caps. */
  estimatedElements: number;
  /** True where anything at all was left out. */
  simplified: boolean;
}

/** Below this many pixels a bay is not worth ticking. */
const BAY_FULL_PX = 6;
/** Columns closer together than this on screen are drawn as a grid, not marks. */
const COLUMN_PX = 4;

/**
 * Past this many shapes, a label beside every row stops being worth drawing.
 *
 * This used to cap what a figure could emit at all: past it, every row
 * collapsed into one plain band. That collapse is gone — a bay is a fixed
 * thing, an upright, a beam pair and the pallets between them, and drawing
 * fewer of them than are actually there was worse than drawing them all
 * plainly (see the note at the top of this file). Every bay is real, at any
 * size a customer can enter, and a 750 ft building painted in well under a
 * hundred milliseconds even at its heaviest — drive-in, 27,642 shapes — so
 * there was never a paint-speed case for holding a shape count down.
 *
 * What is still true past this many shapes is that a caption beside every
 * row becomes noise a reader cannot use, the way a ruler marked in
 * thousandths is not more precise to someone reading it by eye. So this still
 * decides that one thing — see `perRowLabels` below — and `simplifiedNote`
 * says so by name rather than the drawing going quiet about what it left out.
 */
export const ELEMENT_CEILING = 2500;

/**
 * Shapes a full-detail plan would emit.
 *
 * Per bay: the bay itself, an upright at its end, and a dashed line for each
 * extra pallet of depth. Near enough — it decides a threshold, not a layout.
 */
export function estimateElements(a: {
  /** Bands the drawing puts down — a row each for selective, a block each for
   *  drive-in, whose depth is dashed divisions inside one band. */
  bands: number;
  /** Modules along each band: bays for a beam type, lanes for a drive-in. */
  bays: number;
  deep: number;
}): number {
  return Math.max(0, a.bands) * Math.max(0, a.bays) * (2 + Math.max(0, a.deep - 1));
}

/**
 * The level this drawing gets, from the room it has and the size it would come
 * to. `renderedWidthPx` is what the figure occupies on screen, so the same
 * building drawn into a wider column gets more of itself back.
 */
export function detailFor(a: {
  renderedWidthPx: number;
  buildingLengthFt: number;
  bayLengthFt: number;
  /** Bands drawn, not rows stored: see `estimateElements`. */
  bands: number;
  bays: number;
  deep: number;
  columnSpacingFt?: number;
}): Detail {
  const pxPerFt = a.renderedWidthPx / Math.max(1, a.buildingLengthFt);
  const pxPerBay = pxPerFt * Math.max(0.1, a.bayLengthFt);
  const elements = estimateElements(a);
  /*
   * The bays are always drawn.
   *
   * A row used to collapse to a plain band once a bay fell under a few pixels,
   * and the figure said so underneath. But a band is a different drawing: it
   * says a row is continuous racking, where a bay is the unit the building is
   * actually made of and the unit every count on the sheet is in. A reader
   * comparing two buildings was comparing a picture of bays with a picture of
   * bands, and the bay is a fixed thing — an upright, a beam pair and the
   * pallets between them — so a longer building holds more of them, never
   * smaller ones.
   *
   * `level` still says how much room there was, because the column marks and
   * the per-row labels do still stand down when there is none.
   */
  const level: DetailLevel =
    pxPerBay >= BAY_FULL_PX && elements <= ELEMENT_CEILING ? 'full' : 'banded';
  const columnsIndividually = pxPerFt * (a.columnSpacingFt ?? 40) >= COLUMN_PX;
  return {
    // `bays` has nowhere left to be false — see `ELEMENT_CEILING` above — but
    // the field stays, because `PlanFigure` still branches on it and a type
    // this literal is the honest way to say a lever is retired without
    // deleting the branch a future tier might want back.
    level, pxPerFt, pxPerBay,
    bays: true,
    perRowLabels: level === 'full',
    columnsIndividually,
    estimatedElements: elements,
    // Row labels dropping is as much a simplification as the column grid
    // collapsing — it used to go unmentioned because nothing checked `level`
    // here, so a large building's plan went quiet about every row caption it
    // had silently dropped.
    simplified: !columnsIndividually || level === 'banded',
  };
}

/**
 * What was left out, in a sentence.
 *
 * Named counts, because "simplified" on its own tells a customer nothing about
 * what they are looking at.
 */
export function simplifiedNote(d: Detail, a: {
  rows: number; bays: number; columns: number;
  /** What a module along a band is called here: a bay, or a drive-in lane. */
  unit?: 'bay' | 'lane';
}): string | null {
  if (!d.simplified) return null;
  // The rows are drawn as bays at every size now, so there is no longer a band
  // to own up to. Two things can still stand down: the label beside each row,
  // once there are too many rows for one to be legible against the next, and
  // the column grid, once the marks would land on top of one another.
  const parts: string[] = [];
  if (!d.perRowLabels) {
    parts.push(`${a.rows.toLocaleString()} row labels dropped past `
      + `${d.estimatedElements.toLocaleString()} shapes`);
  }
  if (!d.columnsIndividually && a.columns > 0) {
    parts.push(`${a.columns.toLocaleString()} columns drawn as a grid`);
  }
  return `Simplified for scale — ${parts.join(', ')}. `
    + 'Every figure on this sheet is counted from the layout, not from the drawing.';
}

/**
 * The closest two columns come to each other, in feet.
 *
 * Whether columns can be told apart on the page is decided by the tightest
 * spacing in the grid, not by an assumed bay.
 */
export function columnSpacingFt(
  columns: readonly { xFt: number; yFt: number }[],
): number | undefined {
  if (columns.length < 2) return undefined;
  const gap = (vs: number[]) => {
    const u = [...new Set(vs)].sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < u.length; i++) min = Math.min(min, u[i]! - u[i - 1]!);
    return min;
  };
  const g = Math.min(gap(columns.map((c) => c.xFt)), gap(columns.map((c) => c.yFt)));
  return Number.isFinite(g) ? g : undefined;
}
