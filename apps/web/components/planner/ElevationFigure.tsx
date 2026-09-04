'use client';

import { memo } from 'react';
import { FigBoxEl } from './figBox';
import {
  EL_FRAME, FIG_TEXT, elevationFrameY, elevationPpi, elBox, fitFigure, type Extent, type FigBox,
} from './figText';
import type { RackSpec } from '@trace/rack-engine';

/**
 * Fig. 2 — elevation, one bay.
 *
 * Ported from `drawElev` in docs/a3-sizing-sheet.html. Frames with their
 * bracing zig-zag, a beam pair per level above the floor, pallets in kraft on
 * every level, the sprinkler clearance band and the dimension callouts.
 *
 * The clearance band is drawn last so a frame breaking into the sprinkler zone
 * reads as a breach rather than being painted over.
 */

const PINE = '#14392B', INK = '#1A1D1B', LINE = '#DAD7CE', MUT = '#6B726C',
      BLUE = '#1B4FD8', RED = '#A8341C', KRAFT = '#E8DCC2', KRAFT_2 = '#C9A870',
      KRAFT_EDGE = '#B08F52', YELLOW = '#F2C230', GOLD = '#C9B27A';

export interface ElevationFigureProps {
  /** The figure's heading, rendered inside the box it sizes. */
  head?: React.ReactNode;
  /** Which of the row's boxes this is. */
  boxClass?: string;
  spec: RackSpec;
  clearHeightFt: number;
  palletWidthIn: number;
  palletLoadHeightIn: number;
  /** The box this is fitted into, so the text can be sized for the screen. */
  box?: FigBox;
  /** False on the right of a pair: the clear height is labelled once. */
  labelClearHeight?: boolean;
}

function ElevationFigure({
  spec, clearHeightFt, palletWidthIn, palletLoadHeightIn, box,
  labelClearHeight = true, head, boxClass,
}: ElevationFigureProps) {
  const { FL, CX } = EL_FRAME;
  const colIn = 3;
  const beam = spec.beamLengthIn, ppb = spec.palletsPerBay;

  // One scale, taken from the clear height, so this elevation and a cantilever
  // beside it stand on the same floor and under the same roof.
  const ppi = elevationPpi(clearHeightFt);
  const colPx = Math.max(3.5, colIn * ppi);
  const spanPx = beam * ppi;
  const X0 = CX - spanPx / 2, X1 = CX + spanPx / 2;
  const gapIn = (beam - ppb * palletWidthIn) / (ppb + 1);

  const spY = FL - clearHeightFt * 12 * ppi;          // sprinkler line
  const clY = FL - spec.usableHeightIn * ppi;         // top of storable height
  const topY = FL - spec.frameHeightIn * ppi;         // top of the frame

  const fit = fitFigure(box ?? elBox(2, 1), (fAnno, ext) => {
  const fDim = fAnno, fTiny = fAnno;

  // The floor, the sprinkler line and the clearance band run the full width of
  // the figure — but the figure's width is not known until everything else has
  // been drawn. So they are over-drawn well past any plausible edge and left to
  // the viewBox to clip, which is what full-bleed means here. They are not
  // measured: a mark that defines the edge cannot also be sized by it.
  const BLEED = 600;
  // Labels that read along those lines hang off the left of the content, which
  // is the frame's dimension line and its own label.
  const CL = X0 - colPx - 26 - fAnno * 1.1;

  // The assertion, before anything is drawn. A beam whose face runs past the
  // top of its own upright is not a rack anybody can build, so it is not a
  // thing to draw carefully — it is a bug, and it says so on the figure. It
  // should never fire: the engine derives the frame from the beam count.
  const invalid = !spec.topBeamFits;

  const shell: React.ReactNode[] = [];
  const levels: React.ReactNode[] = [];
  const frames: React.ReactNode[] = [];
  const dims: React.ReactNode[] = [];
  let key = 0;

  // floor, hatched below, and the sprinkler line above
  ext.add(CX - spanPx / 2 - colPx, topY, spanPx + colPx * 2, FL - topY);
  ext.add(CX, FL, 0, 11);                                  // the floor and its hatching
  shell.push(<line key={key++} x1={CX - BLEED} y1={FL} x2={CX + BLEED} y2={FL}
    stroke={INK} strokeWidth={3} />);
  for (let h = CX - BLEED; h < CX + BLEED; h += 26) {
    shell.push(<line key={key++} x1={h} y1={FL} x2={h - 11} y2={FL + 11} stroke={LINE} strokeWidth={1} />);
  }
  shell.push(<line key={key++} x1={CX - BLEED} y1={spY} x2={CX + BLEED} y2={spY}
    stroke={INK} strokeWidth={1.5} strokeDasharray="9 5" />);
  if (labelClearHeight) {
    ext.text({
      x: CL, y: spY - 7, size: fAnno,
      text: `CLEAR HEIGHT ${clearHeightFt}'-0"`,
    });
    shell.push(<text key={key++} x={CL} y={spY - 7}
      fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>
      CLEAR HEIGHT {clearHeightFt}&#39;-0&#34;</text>);
  } else {
    ext.add(CL, spY - 7);
  }

  for (let i = 0; i < spec.levels; i++) {
    const baseY = FL - i * spec.levelPitchIn * ppi;
    const ph = palletLoadHeightIn * ppi;
    // The engine puts the top beam's upper face exactly at the top of the
    // frame, so the drawing must not add to it: at a small scale the 4 px
    // minimum thickness is deeper than the section really is, and the beam
    // would stand above its own upright. The face comes from the spec — a
    // number typed in here is how the drawing and the frame came apart before.
    const bTop = Math.max(topY, baseY - Math.max(4, spec.beamFaceIn * ppi));
    const bh = baseY - bTop;
    // the floor level carries no beams
    if (i > 0) {
      levels.push(<rect key={key++} x={X0} y={bTop} width={spanPx} height={bh} fill={PINE} />);
    }
    for (let p = 0; p < ppb; p++) {
      const px = X0 + (gapIn + p * (palletWidthIn + gapIn)) * ppi;
      const pwPx = palletWidthIn * ppi;
      const deck = Math.max(3, 4 * ppi);
      levels.push(<rect key={key++} x={px} y={baseY - ph} width={pwPx} height={ph - deck}
        fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={1} />);
      levels.push(<rect key={key++} x={px} y={baseY - deck} width={pwPx} height={deck}
        fill={KRAFT_2} stroke={KRAFT_EDGE} strokeWidth={1} />);
    }
    ext.text({ x: X1 + colPx + 8, y: baseY - ph / 2 + 3, size: fTiny, text: `L${i + 1}` });
    levels.push(<text key={key++} x={X1 + colPx + 8} y={baseY - ph / 2 + 3}
      fontFamily="JetBrains Mono" fontSize={fTiny} fill={MUT}>L{i + 1}</text>);
  }

  for (const fx of [X0 - colPx, X1]) {
    frames.push(<rect key={key++} x={fx} y={topY} width={colPx} height={FL - topY} fill={PINE} />);
    let zz = '', d = true;
    const cxm = fx + colPx / 2;
    for (let y = topY + 12; y < FL - 10; y += 26) {
      zz += d
        ? `M${cxm - colPx * 0.4} ${y.toFixed(1)}L${cxm + colPx * 0.4} ${(y + 26).toFixed(1)}`
        : `M${cxm + colPx * 0.4} ${y.toFixed(1)}L${cxm - colPx * 0.4} ${(y + 26).toFixed(1)}`;
      d = !d;
    }
    frames.push(<path key={key++} d={zz} stroke={PINE} strokeWidth={1.4} fill="none" opacity={0.65} />);
    frames.push(<rect key={key++} x={fx - 6} y={FL - 5} width={colPx + 12} height={5} fill={INK} />);
  }

  const dx = X0 - colPx - 26;
  dims.push(<line key={key++} x1={dx} y1={topY} x2={dx} y2={FL} stroke={BLUE} strokeWidth={1} />);
  dims.push(<line key={key++} x1={dx - 5} y1={topY} x2={dx + 5} y2={topY} stroke={BLUE} />);
  dims.push(<line key={key++} x1={dx - 5} y1={FL} x2={dx + 5} y2={FL} stroke={BLUE} />);
  ext.text({
    x: dx - 9, y: (topY + FL) / 2, size: fDim, anchor: 'middle', rotate: -90,
    text: `FRAME ${(spec.frameHeightIn / 12).toFixed(0)}'-0"`,
  });
  dims.push(<text key={key++} transform={`translate(${(dx - 9).toFixed(1)},${((topY + FL) / 2).toFixed(1)}) rotate(-90)`}
    textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fDim} fill={BLUE}>
    FRAME {(spec.frameHeightIn / 12).toFixed(0)}&#39;-0&#34;</text>);

  if (spec.levels > 1) {
    const p0 = FL, p1 = FL - spec.levelPitchIn * ppi, px2 = X1 + colPx + 52;
    dims.push(<line key={key++} x1={px2} y1={p1} x2={px2} y2={p0} stroke={BLUE} />);
    dims.push(<line key={key++} x1={px2 - 5} y1={p1} x2={px2 + 5} y2={p1} stroke={BLUE} />);
    dims.push(<line key={key++} x1={px2 - 5} y1={p0} x2={px2 + 5} y2={p0} stroke={BLUE} />);
    ext.text({
      x: px2 + 29, y: p0 - 3, size: fDim, anchor: 'start', rotate: -90,
      text: `${spec.levelPitchIn}"`,
    });
    dims.push(<text key={key++}
      transform={`translate(${(px2 + 29).toFixed(1)},${(p0 - 3).toFixed(1)}) rotate(-90)`}
      textAnchor="start" fontFamily="JetBrains Mono" fontSize={fDim} fill={BLUE}>
      {spec.levelPitchIn}&#34;</text>);
  }

  ext.add(X0, FL + 35);
  dims.push(<line key={key++} x1={X0} y1={FL + 30} x2={X1} y2={FL + 30} stroke={BLUE} />);
  dims.push(<line key={key++} x1={X0} y1={FL + 25} x2={X0} y2={FL + 35} stroke={BLUE} />);
  dims.push(<line key={key++} x1={X1} y1={FL + 25} x2={X1} y2={FL + 35} stroke={BLUE} />);
  // last, so a frame breaking into the sprinkler zone reads as a breach
  const breach = topY < clY - 0.5;
  dims.push(<rect key={key++} x={CX - BLEED} y={spY} width={BLEED * 2} height={clY - spY}
    fill={breach ? RED : YELLOW} opacity={breach ? 0.26 : 0.22} />);
  dims.push(<line key={key++} x1={CX - BLEED} y1={clY} x2={CX + BLEED} y2={clY}
    stroke={breach ? RED : GOLD} strokeWidth={1} strokeDasharray="5 3" />);
  const clearText = breach ? 'FRAME BREAKS CLEARANCE' : `CLEARANCE ${spec.topClearanceIn}"`;
  ext.text({ x: CL, y: (spY + clY) / 2 + 3, size: fAnno, text: clearText });
  dims.push(<text key={key++} x={CL} y={(spY + clY) / 2 + 3}
    fontFamily="JetBrains Mono" fontSize={fAnno} fill={breach ? RED : MUT}>
    {clearText}</text>);

    return (
      <>
        <g>{shell}</g><g>{levels}</g><g>{frames}</g><g>{dims}</g>
        {invalid && (
          <text x={CX} y={spY - 22} textAnchor="middle" fontFamily="JetBrains Mono"
            fontSize={fAnno} fill={RED}>
            LAYOUT INVALID — TOP BEAM {(spec.beamLevels * spec.levelPitchIn + spec.beamFaceIn)
              .toFixed(0)}&#34; ON A {spec.frameHeightIn.toFixed(0)}&#34; FRAME
          </text>
        )}
      </>
    );
  }, FIG_TEXT.anno, (font) => elevationFrameY(spY, font));

  return (
    <FigBoxEl aspect={fit.aspect} className={boxClass} head={head}>
      <svg viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`One rack bay: ${spec.levels} levels on a ${(spec.frameHeightIn / 12).toFixed(0)} foot frame`}>
        {fit.drawn}
      </svg>
      {/* The summary reads as body text rather than as a drawing annotation,
          and out here it stays legible however narrow the figure gets. */}
      <p className="figsum">
        BEAM {beam}&#34; · {ppb}P · {spec.beamCapacityLb.toLocaleString()} LB
      </p>
    </FigBoxEl>
  );
}

export default memo(ElevationFigure);
