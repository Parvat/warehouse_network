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
