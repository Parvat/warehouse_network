'use client';

import { memo, useState } from 'react';
import { FigBoxEl } from './figBox';
import {
  EL_FRAME, FIG_PAD, FIG_TEXT, elevationFrameY, elevationPpi, elBox, fitFigure, type Extent, type FigBox,
} from './figText';
import {
  LANE_CLEARANCE_IN, laneFrameHeightIn, type RackSpec,
} from '@trace/rack-engine';

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

/**
 * Which way the bay is being looked at.
 *
 * `front` is the pick face: uprights, beams, pallets across. `depth` looks
 * along the row instead — the frame, the pallets front to back, the overhang
 * each side and the flue to the next row. That is the view that shows why a
 * 42 in frame carries a 48 in pallet, which the front elevation cannot.
 */
export type ElevationView = 'front' | 'depth';

export interface ElevationFigureProps {
  /** The figure's heading, rendered inside the box it sizes. */
  head?: React.ReactNode;
  /** Written into the heading, so it can change with the view. */
  title?: string;
  sub?: string;
  /**
   * True for drive-in and drive-through: the truck drives inside the rack, so
   * the lane is one pallet wide and the pallet rests on rails along the
   * uprights. There is no beam to draw, and drawing one would be a lie about
   * where the truck goes.
   */
  lane?: boolean;
  /** False where a section through the row says nothing this type needs. */
  depthSection?: boolean;
  /** Pallets deep in a lane, for the depth view. */
  deep?: number;
  /** Open ends: one for drive-in, two for drive-through. */
  openEnds?: number;
  /** Pallet depth, in — the front-to-back figure the depth view is about. */
  palletDepthIn?: number;
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
  labelClearHeight = true, head, boxClass, title, sub,
  lane = false, deep = 1, openEnds = 0, palletDepthIn = spec.frameDepthIn + 6,
  depthSection = false,
}: ElevationFigureProps) {
  // Which way the bay is being looked at. Presentation state: it belongs to the
  // component, not to the layout and not to the database.
  const [viewState, setView] = useState<ElevationView>('front');
  // A type with no section has no control to leave one with, so the mode must
  // not outlive the type that had it: switching from selective in its depth
  // view to drive-in used to leave the drawing stuck in a section with no way
  // back. Hiding the toggle is not enough — the mode itself has to reset.
  if (!depthSection && viewState !== 'front') setView('front');
  const view: ElevationView = depthSection ? viewState : 'front';
  const { FL, CX } = EL_FRAME;
  const colIn = 3;
  const beam = spec.beamLengthIn, ppb = spec.palletsPerBay;

  // One scale, taken from the clear height, so this elevation and a cantilever
  // beside it stand on the same floor and under the same roof.
  const ppi = elevationPpi(clearHeightFt);
  const colPx = Math.max(3.5, colIn * ppi);
  /*
   * What stands between the two uprights, which is what the whole drawing is
   * about — and it is not the same thing in every view.
   *
   *   front, bay   the beam's clear span, carrying `ppb` pallets across
   *   front, lane  one pallet plus the room the truck needs either side, on
   *                rails: a beam here would be in the truck's path
   *   depth        the frame seen end on, with the pallet overhanging it front
   *                and back — the view that shows why a 42 in frame carries a
   *                48 in pallet
   */
  const laneIn = palletWidthIn + LANE_CLEARANCE_IN;
  const depthAcrossIn = lane ? palletDepthIn * deep : palletDepthIn;
  // A rail is a light section along the inside face of each upright; a beam
  // spans between them. Only one of the two is ever drawn.
  const railPx = Math.max(2.5, 3 * ppi);

  const spY = FL - clearHeightFt * 12 * ppi;          // sprinkler line
  const clY = FL - spec.usableHeightIn * ppi;         // top of storable height
  // A lane's upright is not a beam frame: it runs past the top rail and the
  // load on it to the tie that braces the two sides together, which is where
  // the across bracing goes. A beam frame stops at its top beam.
  const frameIn = lane
    ? laneFrameHeightIn({
      levels: spec.levels, levelPitchIn: spec.levelPitchIn,
      loadHeightIn: palletLoadHeightIn,
    })
    : spec.frameHeightIn;
  const topY = FL - frameIn * ppi;                    // top of the frame

  const render = (v: ElevationView, fAnno: number, ext: Extent) => {
  const spanIn = v === 'depth' ? depthAcrossIn : lane ? laneIn : beam;
  const spanPx = spanIn * ppi;
  const X0 = CX - spanPx / 2, X1 = CX + spanPx / 2;
  // Along a lane there is a pallet at every position down it; along a row
  // there is one, seen end on.
  const across = v === 'depth' ? (lane ? deep : 1) : lane ? 1 : ppb;
  const unitIn = v === 'depth' ? palletDepthIn : palletWidthIn;
  const gapIn = v === 'depth' ? 0 : (spanIn - across * unitIn) / (across + 1);
  const fDim = fAnno, fTiny = fAnno;

  // The floor, the sprinkler line and the clearance band run the full width of
  // the figure — but the figure's width is not known until everything else has
  // been drawn. So they are over-drawn well past any plausible edge and left to
  // the viewBox to clip, which is what full-bleed means here. They are not
  // measured: a mark that defines the edge cannot also be sized by it.
  const BLEED = 600;
  // Labels that read along those lines are the building's, not the racking's:
  // the clear height and the clearance mean the same thing whichever way the
  // bay is being looked at. So they hang off the widest view's edge, which is
  // the same in both, rather than off this view's — which moved them across the
  // figure every time the reader switched.
  // Only where there is a second view to make room for. A drive-in lane is
  // eight pallets long in section and one pallet wide in front, so measuring a
  // section that cannot be reached pushed these labels a lane's length clear of
  // a drawing that was never going to be that wide — which is the dead space
  // the front elevation sat to the right of.
  const widestSpanPx = Math.max(lane ? laneIn : beam,
    depthSection ? depthAcrossIn : 0) * ppi;
  const CL = CX - widestSpanPx / 2 - colPx - 26 - fAnno * 1.1;

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

  // The floor is a storage level. A drive-in truck drives *between* the
  // uprights and puts the first pallet on the slab — it does not drive over
  // anything — so the lane stores at floor level exactly as selective racking
  // does, and as a cantilever stores on its base.
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
    if (lane && i > 0) {
      // Rails, not a beam: what the pallet actually rests on. Seen end on they
      // are a section on the inside face of each upright; seen along the lane
      // they are the continuous run the pallets sit on all the way down it.
      if (v === 'depth') {
        levels.push(<rect key={key++} x={X0 - colPx / 2} y={baseY - railPx}
          width={spanPx + colPx} height={railPx} fill={PINE} />);
      } else {
        for (const rx of [X0, X1 - railPx]) {
          levels.push(<rect key={key++} x={rx} y={baseY - railPx} width={railPx} height={railPx}
            fill={PINE} />);
        }
      }
    } else if (i > 0) {
      // the floor level carries no beams
      levels.push(<rect key={key++} x={X0} y={bTop} width={spanPx} height={bh} fill={PINE} />);
    }
    for (let p = 0; p < across; p++) {
      const px = X0 + (gapIn + p * (unitIn + gapIn)) * ppi;
      const pwPx = unitIn * ppi;
      const deck = Math.max(3, 4 * ppi);
      levels.push(<rect key={key++} x={px} y={baseY - ph} width={pwPx} height={ph - deck}
        fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={1} />);
      levels.push(<rect key={key++} x={px} y={baseY - deck} width={pwPx} height={deck}
        fill={KRAFT_2} stroke={KRAFT_EDGE} strokeWidth={1} />);
    }
    // A lane's levels are its rails, and the floor is not one of them — so it
    // is named for what it is, the way a cantilever's base is.
    const label = lane ? (i === 0 ? 'FLOOR' : `L${i}`) : `L${i + 1}`;
    const lx = X1 + colPx + 8;
    ext.text({ x: lx, y: baseY - ph / 2 + 3, size: fTiny, text: label });
    levels.push(<text key={key++} x={lx} y={baseY - ph / 2 + 3}
      fontFamily="JetBrains Mono" fontSize={fTiny} fill={MUT}>{label}</text>);
  }

  /**
   * Bracing between two uprights: a horizontal tie at each panel line and a
   * diagonal between them, reversing each panel, so every panel reads as a Z.
   * That is what a frame looks like from the side, and it is the detail that
   * makes the depth view worth drawing.
   */
  const zBrace = (x0: number, x1: number, yBottom: number, yTop: number) => {
    const h = yBottom - yTop;
    if (h < 8 || x1 - x0 < 4) return;
    const panels = Math.max(1, Math.round(h / Math.max(18, (x1 - x0) * 1.1)));
    const step = h / panels;
    for (let k = 0; k <= panels; k++) {
      const y = yBottom - k * step;
      frames.push(<line key={key++} x1={x0} y1={y} x2={x1} y2={y}
        stroke={PINE} strokeWidth={1.2} opacity={0.85} />);
    }
    for (let k = 0; k < panels; k++) {
      const y0 = yBottom - k * step, y1 = y0 - step;
      const left = k % 2 === 0;
      frames.push(<line key={key++} x1={left ? x0 : x1} y1={y0} x2={left ? x1 : x0} y2={y1}
        stroke={PINE} strokeWidth={1.2} opacity={0.7} />);
    }
  };

  /*
   * Where the uprights stand, which is not the same in the two views.
   *
   *   front       one either side of the bay or the lane
   *   depth, bay  the frame seen from the side: two uprights a frame depth
   *               apart, with the pallet overhanging both
   *   depth, lane a pair at every pallet position down the lane
   */
  const fdPx = spec.frameDepthIn * ppi;
  const uprights = v === 'front'
    ? [X0 - colPx, X1]
    : lane
      ? Array.from({ length: deep + 1 },
        (_, k) => X0 + k * palletDepthIn * ppi - colPx / 2)
      : [CX - fdPx / 2 - colPx / 2, CX + fdPx / 2 - colPx / 2];

  for (const fx of uprights) {
    frames.push(<rect key={key++} x={fx} y={topY} width={colPx} height={FL - topY} fill={PINE} />);
    // In the front view the frame's own depth bracing is seen edge on, which is
    // a zig-zag inside the upright. In the depth view it is seen square on, and
    // it is drawn properly between the uprights below.
    if (v === 'front') {
      let zz = '', d = true;
      const cxm = fx + colPx / 2;
      for (let y = topY + 12; y < FL - 10; y += 26) {
        zz += d
          ? `M${cxm - colPx * 0.4} ${y.toFixed(1)}L${cxm + colPx * 0.4} ${(y + 26).toFixed(1)}`
          : `M${cxm + colPx * 0.4} ${y.toFixed(1)}L${cxm - colPx * 0.4} ${(y + 26).toFixed(1)}`;
        d = !d;
      }
      frames.push(<path key={key++} d={zz} stroke={PINE} strokeWidth={1.4} fill="none"
        opacity={0.65} />);
    }
    frames.push(<rect key={key++} x={fx - 6} y={FL - 5} width={colPx + 12} height={5} fill={INK} />);
  }

  if (v === 'depth') {
    // The bracing, square on. A bay's frame is braced its full height; a lane's
    // is tied above the top rail, because everything below it is the lane the
    // truck works in.
    const braceBottom = lane
      ? FL - ((spec.levels - 1) * spec.levelPitchIn + palletLoadHeightIn) * ppi
      : FL - 4;
    for (let k = 0; k + 1 < uprights.length; k++) {
      zBrace(uprights[k]! + colPx, uprights[k + 1]!, braceBottom, topY + 2);
    }
  }

  if (v === 'depth' && !lane) {
    // Looking along the row. The frame is narrower than the pallet it carries,
    // which is the whole point of the view: a 42 in frame under a 48 in pallet.
    //
    // The row behind used to be drawn here too — an upright a flue away, with
    // the flue dimensioned between them. It is the flue's own section that
    // shows it, and this view is about one frame under one pallet: a second
    // row's upright standing in it was answering a question the figure was not
    // asking. The flue is on the placard and on the plan, where the gap it
    // leaves between two rows can be seen as a gap.
    const overPx = (palletDepthIn - spec.frameDepthIn) * ppi / 2;
    // Above everything, including the load standing proud of the frame.
    const topLoadY = Math.min(topY,
      FL - ((spec.levels - 1) * spec.levelPitchIn + palletLoadHeightIn) * ppi);

    // the overhang, which is why the frame is the smaller figure
    ext.text({ x: CX, y: topLoadY - 8, size: fTiny, anchor: 'middle',
      text: `FRAME ${spec.frameDepthIn}" · ${(overPx / ppi).toFixed(0)}" OVER EACH SIDE` });
    dims.push(<text key={key++} x={CX} y={topLoadY - 8} textAnchor="middle"
      fontFamily="JetBrains Mono" fontSize={fTiny} fill={MUT}>
      FRAME {spec.frameDepthIn}&#34; · {(overPx / ppi).toFixed(0)}&#34; OVER EACH SIDE</text>);
  }

  if (v === 'depth' && lane) {
    // Along the lane: the pallets one behind another on the rails, and the end
    // the truck comes in at — one for drive-in, both for drive-through.
    const ends = openEnds >= 2 ? [X0, X1] : [X0];
    for (const [i, ex] of ends.entries()) {
      const dir = ex === X0 ? 1 : -1;
      const y = FL - 8;
      dims.push(<path key={key++}
        d={`M${(ex - dir * 16).toFixed(1)} ${y}h${dir * 12}m0 0l${-dir * 4} -3m${dir * 4} 3l${-dir * 4} 3`}
        stroke={RED} strokeWidth={1.2} fill="none" />);
      if (i === 0) {
        ext.text({ x: ex - dir * 18, y: y - 6, size: fTiny, text: 'ENTRY',
          anchor: dir === 1 ? 'end' : 'start' });
        dims.push(<text key={key++} x={ex - dir * 18} y={y - 6}
          textAnchor={dir === 1 ? 'end' : 'start'}
          fontFamily="JetBrains Mono" fontSize={fTiny} fill={RED}>ENTRY</text>);
      }
    }
  }

  if (lane && v === 'front') {
    // Tied across above the top rail, which is where a drive-in structure is
    // braced: everything below is the lane the truck works in. The truck itself
    // drives into the page here, so there is no path to draw across the view —
    // it is the depth section and the plan that show where it goes.
    const braceBottom = FL - (spec.levels - 1) * spec.levelPitchIn * ppi
      - palletLoadHeightIn * ppi;
    zBrace(X0, X1, braceBottom, topY + 2);
  }

  const dx = X0 - colPx - 26;
  dims.push(<line key={key++} x1={dx} y1={topY} x2={dx} y2={FL} stroke={BLUE} strokeWidth={1} />);
  dims.push(<line key={key++} x1={dx - 5} y1={topY} x2={dx + 5} y2={topY} stroke={BLUE} />);
  dims.push(<line key={key++} x1={dx - 5} y1={FL} x2={dx + 5} y2={FL} stroke={BLUE} />);
  ext.text({
    x: dx - 9, y: (topY + FL) / 2, size: fDim, anchor: 'middle', rotate: -90,
    text: `FRAME ${(frameIn / 12).toFixed(0)}'-0"`,
  });
  dims.push(<text key={key++} transform={`translate(${(dx - 9).toFixed(1)},${((topY + FL) / 2).toFixed(1)}) rotate(-90)`}
    textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fDim} fill={BLUE}>
    FRAME {(frameIn / 12).toFixed(0)}&#39;-0&#34;</text>);

  /*
   * The module the elevation repeats on, dimensioned beside the level markers.
   *
   * What was removed from here before was a bare rule floating clear of the
   * frame with nothing tying it to the levels it claimed to measure. This is
   * the dimension proper — extension lines back to the two levels, a tick at
   * each end and the figure between them — drawn in the frame dimension's own
   * style, on the other side of the drawing.
   *
   * On the first level, off the floor. Every module up the frame is the same
   * height, so the dimension says the same thing wherever it is put — and the
   * place to put a figure that reads the same everywhere is where the reader
   * starts, at the bottom, beside L1. Part way up a stack of identical modules
   * it invites the question of what is different about that one.
   */
  if (spec.levels >= 2) {
    const yLow = FL;
    const yHigh = FL - spec.levelPitchIn * ppi;
    // Clear of the level markers, which stand between the rack and this.
    const labelW = (lane ? 5 : 3) * 0.6 * fTiny;
    const px = X1 + colPx + 8 + labelW + 13;
    // Under the markers rather than through them: the extension lines run back
    // to the levels from the drawing's edge, and the labels sit on top.
    for (const y of [yLow, yHigh]) {
      shell.push(<line key={key++} x1={X1 + colPx + 2} y1={y} x2={px + 5} y2={y}
        stroke={LINE} strokeWidth={0.8} />);
    }
    dims.push(<line key={key++} x1={px} y1={yHigh} x2={px} y2={yLow} stroke={BLUE} strokeWidth={1} />);
    dims.push(<line key={key++} x1={px - 5} y1={yHigh} x2={px + 5} y2={yHigh} stroke={BLUE} />);
    dims.push(<line key={key++} x1={px - 5} y1={yLow} x2={px + 5} y2={yLow} stroke={BLUE} />);
    const pitchText = `${spec.levelPitchIn}"`;
    // Clear of its own dimension line. The frame's figure sits nine units off
    // to the left of its line, where the glyphs then grow away from it; the
    // same nine units on the right grows them back over it, because a turned
    // label rises from its baseline towards the line rather than away. So the
    // offset here is the cap height again, and the gap matches by eye.
    const tx = px + 9 + fDim * 0.78;
    ext.text({ x: tx, y: (yLow + yHigh) / 2, size: fDim, anchor: 'middle', rotate: -90,
      text: pitchText });
    dims.push(<text key={key++} transform={`translate(${tx.toFixed(1)},${((yLow + yHigh) / 2).toFixed(1)}) rotate(-90)`}
      textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fDim} fill={BLUE}>
      {pitchText}</text>);
  }

  ext.add(X0, FL + 35);
  dims.push(<line key={key++} x1={X0} y1={FL + 30} x2={X1} y2={FL + 30} stroke={BLUE} />);
  dims.push(<line key={key++} x1={X0} y1={FL + 25} x2={X0} y2={FL + 35} stroke={BLUE} />);
  dims.push(<line key={key++} x1={X1} y1={FL + 25} x2={X1} y2={FL + 35} stroke={BLUE} />);
  // What that dimension is. A lane is measured across; a beam is not there to
  // measure in one, and the depth view is measuring the row, not the bay.
  const acrossText = v === 'depth'
    ? `${lane ? `${deep} × ` : ''}${palletDepthIn}" PALLET`
    : lane ? `LANE ${laneIn}"` : `BEAM ${beam}"`;
  ext.text({ x: CX, y: FL + 44, size: fDim, text: acrossText, anchor: 'middle' });
  dims.push(<text key={key++} x={CX} y={FL + 44} textAnchor="middle"
    fontFamily="JetBrains Mono" fontSize={fDim} fill={BLUE}>{acrossText}</text>);
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
  };

  const fit = fitFigure(
    box ?? elBox(2, 1),
    (fAnno, ext) => render(view, fAnno, ext),
    {
      lockY: (font) => elevationFrameY(spY, font),
      // The other view, for its bounds only — what it draws is thrown away.
      // Where there is only one view there is nothing else to make room for.
      measureAlso: depthSection
        ? (font, ext) => { render(view === 'front' ? 'depth' : 'front', font, ext); }
        : undefined,
      // One view has nothing to stay in step with, so it is centred on the bay
      // rather than on the labels hanging off either side of it.
      centreX: depthSection ? undefined : CX,
    },
  );

  // The caption is the view's, and the way to the other view sits with it. Not
  // a bare chevron: a reader should know what is on the other side of it.
  const what = lane ? 'ONE LANE' : 'ONE BAY';
  const caption = title ?? (view === 'depth'
    ? `Fig. 2 — Section, ${lane ? 'along the lane' : 'through the row'}`
    : `Fig. 2 — Elevation, ${what.toLowerCase()}`);
  const ownHead = (
    <div className="fighead">
      <span className="t">{caption}</span>
      <span className="r mono">{sub}</span>
      {depthSection && (
        <button type="button" className="figview"
          onClick={() => setView(view === 'front' ? 'depth' : 'front')}>
          {/* Short, because the head is only as wide as the drawing and the
              caption beside it already names the view in full. Both labels are
              seven characters, so the control does not resize as it is used. */}
          {view === 'front' ? 'Depth →' : '← Front'}
        </button>
      )}
    </div>
  );

  return (
    <FigBoxEl aspect={fit.aspect} className={boxClass} head={title || sub ? ownHead : head}>
      <svg viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={view === 'depth'
          ? (lane
            ? `A lane seen along its length: ${deep} pallets deep on rails`
            : `A row seen end on: a ${spec.frameDepthIn} inch frame under a `
              + `${palletDepthIn} inch pallet`)
          : lane
            ? `One lane: ${spec.levels} levels of one pallet on rails, ${laneIn} inches wide`
            : `One rack bay: ${spec.levels} levels on a ${(spec.frameHeightIn / 12).toFixed(0)} foot frame`}>
        {fit.drawn}
      </svg>
      {/* The summary reads as body text rather than as a drawing annotation,
          and out here it stays legible however narrow the figure gets. */}
      {/* The summary is the bay's material. A lane has no beam and no beam
          capacity — what it has is a rail either side and one pallet on them,
          and the rail's rating is a dealer's figure rather than one Trace
          derives, so it is not quoted here. */}
      <p className="figsum">
        {lane
          ? <>LANE {laneIn}&#34; · 1P · ON RAILS</>
          : <>BEAM {beam}&#34; · {ppb}P · {spec.beamCapacityLb.toLocaleString()} LB</>}
      </p>
    </FigBoxEl>
  );
}

export default memo(ElevationFigure);
