/**
 * How much of a drawing to draw.
 *
 * The largest building this planner sizes is 750 ft on a side, and that is
 * almost exactly where full detail stops being worth drawing: about 38 rows of
 * 90 bays, some ten thousand shapes, each bay landing at about six pixels in a
 * figure six hundred wide. So there are two levels, not three — the third
 * existed for buildings that can no longer be entered.
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
 * The most shapes one figure may emit.
 *
 * A backstop rather than the main mechanism: with the building clamped at
 * 750 ft the pixel rule should catch everything first. It exists because a
 * deep-lane type at a small bay length can still run the count up, and a
 * figure that takes a second to paint is worse than one that says less.
 */
export const ELEMENT_CEILING = 2500;

/**
 * Shapes a full-detail plan would emit.
 *
 * Per bay: the bay itself, an upright at its end, and a dashed line for each
 * extra pallet of depth. Near enough — it decides a threshold, not a layout.
 */
export function estimateElements(a: {
  rows: number; bays: number; deep: number;
}): number {
  return Math.max(0, a.rows) * Math.max(0, a.bays) * (2 + Math.max(0, a.deep - 1));
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
  rows: number;
  bays: number;
  deep: number;
  columnSpacingFt?: number;
}): Detail {
  const pxPerFt = a.renderedWidthPx / Math.max(1, a.buildingLengthFt);
  const pxPerBay = pxPerFt * Math.max(0.1, a.bayLengthFt);
  const elements = estimateElements(a);
  const level: DetailLevel =
    pxPerBay >= BAY_FULL_PX && elements <= ELEMENT_CEILING ? 'full' : 'banded';
  const columnsIndividually = pxPerFt * (a.columnSpacingFt ?? 40) >= COLUMN_PX;
  return {
    level, pxPerFt, pxPerBay,
    bays: level === 'full',
    perRowLabels: level === 'full',
    columnsIndividually,
    estimatedElements: elements,
    simplified: level !== 'full' || !columnsIndividually,
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
}): string | null {
  if (!d.simplified) return null;
  const parts: string[] = [];
  if (d.level === 'banded') {
    parts.push(`${a.rows.toLocaleString()} rows drawn as bands, `
      + `${a.bays.toLocaleString()} bays each`);
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
