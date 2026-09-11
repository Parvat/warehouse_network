'use client';

import type { RackColumn } from '@trace/rack-engine';

/**
 * The building's columns, marked for what each one is standing in.
 *
 * One renderer for all three Fig. 1 drawings, because a column standing in a
 * forklift aisle is the same fact on a pallet floor, a cantilever strip and a
 * mixed one — and it was only ever marked on the first of those. The
 * judgement itself is the engine's (`classifyColumn`), made against whatever
 * racking is actually on that floor; nothing here decides anything, it only
 * draws what it was told.
 *
 * This is the honesty layer and not a solver: a column in an aisle is flagged
 * where it stands, and the layout is left exactly as the engine returned it.
 * Designing the racking around it is the drawing app's job, and the notice
 * says so.
 */

const RED = '#A8341C', AMBER = '#C8891E', BLUE = '#1B4FD8';

export interface ColumnMarkProps {
  columns: readonly RackColumn[];
  /** The drawing's origin and scale, in the figure's own units. */
  px: number; py: number; sc: number;
  /**
   * False where the columns are drawn as a guide grid instead of a mark each,
   * because at that density individual marks are a dotted mess. The ones
   * standing in an aisle are still drawn: they are the reason a reader is
   * looking, and a mark that disappears exactly when the building gets big
   * enough to have the problem is worse than no mark at all.
   */
  individually: boolean;
  /** Keys continue the caller's own run, which owns the parts array. */
  keyFrom: number;
}

export function columnMarks(a: ColumnMarkProps): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let key = a.keyFrom;

  for (const col of a.columns) {
    const bad = col.where === 'aisle' || col.where === 'face';
    if (!a.individually && !bad) continue;

    const cx = a.px + col.xFt * a.sc, cy = a.py + col.yFt * a.sc;
    // A ring around the ones in an aisle, so they read at a glance on a plan
    // with a hundred columns on it.
    if (col.where === 'aisle') {
      out.push(<circle key={key++} className="colwarn" cx={cx} cy={cy} r={5.4}
        fill="none" stroke={RED} strokeWidth={1.1} />);
    }
    out.push(
      <rect key={key++} className={bad ? 'colwarn' : undefined}
        x={cx - 2.2} y={cy - 2.2} width={4.4} height={4.4}
        fill={col.where === 'aisle' ? RED : col.where === 'face' ? AMBER : BLUE}
        stroke="#fff" strokeWidth={0.5}>
        {bad && (
          <title>
            {col.where === 'aisle' ? 'Column standing in aisle' : 'Column against a pick face'}
          </title>
        )}
      </rect>,
    );
  }
  return out;
}

/**
 * What a column in an aisle means, in the panel that holds everything Trace
 * has to say about this layout.
 *
 * It sat under the drawing until it was read there: a nine-pixel line of mono
 * centred beneath a figure is where a reader's eye has already left, and the
 * figure had to carry 52px of padding to make room for it, which moved every
 * drawing on the sheet. It belongs with the flags, beside the rest of what
 * needs a second look, and it is the one paragraph in that column allowed to
 * be red.
 *
 * Named rather than bare: the number, what it costs, and what to do about it.
 * Trace sizes a building — it does not design the racking around an
 * obstruction, and saying so is more use to a customer than a silent layout
 * that quietly assumes the column is not there. The marks on the drawing say
 * *where*; this says what it means.
 *
 * What it costs is named in the currency of the floor it is standing on. A
 * cantilever strip is measured in linear feet of arm and never in pallet
 * positions, so telling a long-goods customer their pallet positions are at
 * risk would be a figure they do not have.
 */
export function ColumnNotice({ inAisles, holds = 'positions' }: {
  inAisles: number;
  /** What this floor's capacity is counted in. */
  holds?: 'positions' | 'linear' | 'both';
}) {
  if (inAisles < 1) return null;
  const cost = holds === 'linear' ? 'linear feet of arm'
    : holds === 'both' ? 'what this floor holds'
      : 'pallet positions';
  return (
    <p className="aislewarn" aria-live="polite">
      <b>
        {inAisles === 1
          ? 'A column falls in a forklift aisle'
          : `${inAisles} columns fall in a forklift aisle`}
      </b>
      {` — this may reduce ${cost}. For an accurate layout, use the `}
      drawing app or contact your dealer.
    </p>
  );
}
