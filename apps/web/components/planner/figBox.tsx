'use client';

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
export function FigBoxEl({ aspect, className, head, children, foot }: {
  aspect: number; className?: string; head?: React.ReactNode;
  children: React.ReactNode; foot?: React.ReactNode;
}) {
  return (
    // Five places, not three: the row hands out width in proportion to these,
    // and two figures that should be the same height came out a fraction of a
    // pixel apart on three — enough to show as different scales.
    <div className={['figbox', className].filter(Boolean).join(' ')}
      style={{ ['--aspect' as string]: aspect.toFixed(5) }}>
      {head}
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

