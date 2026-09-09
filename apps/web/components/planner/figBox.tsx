'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The box a figure fills.
 *
 * The aspect ratio is the drawing's own, measured from what it drew, and the
 * row divides its width in proportion to the ratios in it — so every box comes
 * out the same height without anything being told what that height is, and no
 * drawing is fitted into a box of the wrong shape.
 *
 * The figures are static: they redraw when an input changes and do nothing
 * else. There is no view state to keep in step with the inputs and no pointer
 * handler on any drawing. A plan that is unreadable at scale is a drawing
 * problem, and it is answered by drawing less — see `detail.ts` — rather than
 * by handing the reader a canvas to fight with.
 */
export function FigBoxEl({ aspect, className, head, info, children, foot }: {
  aspect: number; className?: string; head?: React.ReactNode;
  /** A control in the figure's top-right corner — see `FigExpand`. */
  info?: React.ReactNode;
  children: React.ReactNode; foot?: React.ReactNode;
}) {
  return (
    // Five places, not three: the row hands out width in proportion to these,
    // and two figures that should be the same height came out a fraction of a
    // pixel apart on three — enough to show as different scales.
    <div className={['figbox', className].filter(Boolean).join(' ')}
      style={{ ['--aspect' as string]: aspect.toFixed(5) }}>
      {head}
      {/* Outside the heading rather than in it: the heading is clipped to a
          fixed height, so a panel opened from inside it would be cut off at
          the first line. */}
      {info && <div className="figtool">{info}</div>}
      {children}
      {foot && <div className="figfoot">{foot}</div>}
    </div>
  );
}

/**
 * One entry in a plan's key: a swatch, and the thing it stands for.
 *
 * The swatch is drawn into a 10 x 6 viewBox in the figure's own colours, so a
 * key entry and the mark it explains cannot drift apart.
 */
export interface LegendItem {
  swatch: React.ReactNode;
  label: string;
}

/**
 * Fig. 1's heading: what the figure is, and the key to what is in it.
 *
 * The key used to be drawn inside the SVG, below the building at bottom left.
 * There it was measured into the viewBox like any other mark, so it took scale
 * away from the drawing it was explaining — and it sat furthest from the
 * heading a reader looks at first. Up here it is HTML at a fixed size, read
 * before the drawing rather than after it, and the building gets the whole box.
 */
export function PlanHead({ title = 'Fig. 1 — Building plan', lengthFt, widthFt, legend }: {
  title?: string; lengthFt: number; widthFt: number; legend: LegendItem[];
}) {
  return (
    <div className="fighead">
      <span className="t">{title}</span>
      {/* Centred on the heading, which had the room for it: a title at one end
          and the key at the other, and the whole middle empty. */}
      <span className="figsize mono">{lengthFt} &#215; {widthFt} ft</span>
      <span className="r mono figlegend">
        {legend.map((it) => (
          <span className="legitem" key={it.label}>
            <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">{it.swatch}</svg>
            {it.label}
          </span>
        ))}
      </span>
    </div>
  );
}


/**
 * The same drawing, filling the screen, behind an icon in its corner.
 *
 * A view aid and nothing else. The figure keeps the whole building fitted to
 * its own box, which at a big building is small; this is that same drawing at
 * the size of the window instead. It computes nothing — the children are the
 * figure's own marks, handed here a second time — so what the reader magnifies
 * is what the sheet says, never a second answer to it.
 *
 * Fitted, not panned: the point of it is to see the whole building at once.
 */
export function FigExpand(props: {
  label: string;
  viewBox: string;
  /** The drawing's own shape, so the overlay fits it without distorting it. */
  aspect: number;
  children: React.ReactNode;
}) {
  const { label, viewBox, aspect, children } = props;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  return (
    <>
      <button type="button" className="figexpandbtn" aria-label={label} aria-expanded={open}
        onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.5 4.5h5v5" /><path d="M9.5 19.5h-5v-5" />
          <path d="M19.5 4.5l-6.5 6.5" /><path d="M4.5 19.5l6.5-6.5" />
        </svg>
      </button>
      {open && (
        /* Anywhere off the drawing closes it, as do the control and Escape. */
        <div className="figoverlay" role="dialog" aria-modal="true" aria-label={label}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="figoverlaybox">
            <div className="figoverlaybar">
              <span className="mono">{label}</span>
              <button type="button" className="figoverlayx" aria-label="Close"
                onClick={() => setOpen(false)}>&#215;</button>
            </div>
            <div className="figoverlayfit">
              <svg viewBox={viewBox} style={{ aspectRatio: String(aspect) }}
                preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                {children}
              </svg>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
