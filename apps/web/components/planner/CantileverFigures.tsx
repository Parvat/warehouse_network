'use client';

import { memo } from 'react';
import { DOCK_APRON_FT, ftIn } from '@trace/rack-engine';
import BuildingShell, { measureShell } from './BuildingShell';
import { FigBoxEl } from './figBox';
import {
  EL_FRAME, FIG_TEXT, elevationFrameY, elevationPpi, elBox, planBox, fitFigure, type Extent, type FigBox,
} from './figText';
import type { CantileverRunLayout, Orientation } from '@trace/rack-engine';

/**
 * Fig. 1 and Fig. 2 for long products, drawn in the sheet's own language —
 * same palette, same blue dimension lines, same mono callouts as the pallet
 * figures, because they sit side by side on the same drawing.
 *
 * A cantilever is not a pallet rack seen differently. In plan it is a set of
 * sectioned runs: each run is a line of towers, the material overhangs the end
 * towers, and the runs are separated by an access gap. Drawing it as one
 * unbroken line the length of the building overstates the tower count and hides
 * where a run actually ends.
 */

const G = '#14392B', ARM = '#1D5340', FILL = '#E8EFEA', INK = '#1A1D1B',
      LINE = '#DAD7CE', MUT = '#6B726C', BLUE = '#1B4FD8', RED = '#A8341C',
      KRAFT = '#E8DCC2', KRAFT_EDGE = '#B08F52';

/* ── Fig. 1 — plan ─────────────────────────────────────────────────────── */

export interface CantileverPlanProps {
  layout: CantileverRunLayout;
  buildingLengthFt: number;
  buildingWidthFt: number;
  aisleFt: number;
  wallClearanceFt: number;
  orientation: Orientation;
  /** The container this fills, which is all the type sizing needs to know. */
  box?: FigBox;
  /** The figure's heading, rendered inside the box it sizes. */
  head?: React.ReactNode;
  /** Which of the row's boxes this is. */
  boxClass?: string;
}

function Plan(p: CantileverPlanProps) {
  const L = p.layout;
  const PX = 74, PY = 40;

  // The building never turns: length across the page, width down it. Only the
  // racking turns, so everything inside the walls is laid out in (along,
  // across) feet and mapped once.
  //
  // The scale is internal and only that: the building's longest side is always
  // this many units, so the margins and the labels carry the same weight in a
  // 400 x 100 shed as in a square one. The viewBox is fitted afterwards.
  const NOMINAL = 470;
  const sc = NOMINAL / Math.max(p.buildingLengthFt, p.buildingWidthFt);
  const W = p.buildingLengthFt * sc, H = p.buildingWidthFt * sc;
  const vertical = p.orientation === 'width';

  const fit = fitFigure(p.box ?? planBox(), (fAnno, ext, widthPx) => {

  const at = (aPx: number, aLenPx: number, cPx: number, cLenPx: number) => (vertical
    ? { x: PX + cPx, y: PY + aPx, width: cLenPx, height: aLenPx }
    : { x: PX + aPx, y: PY + cPx, width: aLenPx, height: cLenPx });
  const box = (aFt: number, aLenFt: number, cFt: number, cLenFt: number) =>
    at(aFt * sc, aLenFt * sc, cFt * sc, cLenFt * sc);
  const line = (aFt: number, aLenFt: number, cFt: number, cLenFt: number) => {
    const r = box(aFt, aLenFt, cFt, cLenFt);
    return { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height };
  };

  const apron = DOCK_APRON_FT * sc;
  measureShell(ext, {
    px: PX, py: PY, w: W, h: H, font: fAnno, vertical,
    lengthFt: p.buildingLengthFt, widthFt: p.buildingWidthFt,
  });
  const alongStartFt = p.wallClearanceFt + DOCK_APRON_FT;
  // The apron is reserved on the axis the rows run, and the staging strip is
  // drawn on that wall, so the rows never cross it.
  const acrossStartFt = p.wallClearanceFt;

  const armFt = L.armLengthIn / 12;
  const parts: React.ReactNode[] = [];
  let key = 0;

  let c = acrossStartFt;

  L.rowSides.forEach((sides, r) => {
    const depthFt = sides === 2 ? L.doubleDepthFt : L.singleDepthFt;
    // A wall row is reached only from the aisle, so its arms face inward: the
    // column line sits on the wall side for the first row and on the far side
    // for the last, with the arms between.
    const atFarWall = sides === 1 && r === L.rows - 1;
    const colC = sides === 2 ? c + depthFt / 2 : atFarWall ? c + depthFt : c;
    const armC0 = sides === 2 ? colC - armFt : atFarWall ? colC - armFt : colC;
    const armC1 = sides === 2 ? colC + armFt : atFarWall ? colC : colC + armFt;

    // Only the runs this row carries: a row of a strip sized by linear feet
    // stops where the stock does, and a cross aisle is a gap in the row rather
    // than something drawn over the top of it.
    const lastRow = r === L.rows - 1;
    const runsHere = lastRow ? L.runsInLastRow : L.runsPerRow;
    for (let run = 0; run < runsHere; run++) {
      // the run occupies the product; the towers span less than that
      const runA = alongStartFt + (L.runStartsFt[run] ?? 0);
      const towerA = runA + L.overhangFt;

      parts.push(<rect key={key++} {...box(runA, L.runLengthFt, armC0, armC1 - armC0)}
        fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={0.7} opacity={0.55} />);

      for (let t = 0; t < L.towersPerRun; t++) {
        const tA = towerA + t * L.towerCentresFt;
        parts.push(
          <line key={key++} {...line(tA, 0, armC0, armC1 - armC0)} stroke={ARM} strokeWidth={0.9} />,
          <rect key={key++} {...at(tA * sc - 1.6, 3.2, colC * sc - 2.6, 5.2)} fill={G} />,
        );
      }
      parts.push(<line key={key++} {...line(towerA, L.spanFt, colC, 0)}
        stroke={G} strokeWidth={2} />);
    }

    // label the row the way the pallet plan labels its wall rows
    if (!vertical) {
      const label = sides === 1 ? 'wall row' : '2 sides';
      ext.text({ x: PX + W + 6, y: PY + colC * sc + 3, size: fAnno, text: label });
      parts.push(<text key={key++} x={PX + W + 6} y={PY + colC * sc + 3}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>{label}</text>);
    }

    c += depthFt;
    if (r < L.rows - 1) {
      if (!vertical) {
        const y = PY + (c + p.aisleFt / 2) * sc + 3;
        ext.text({ x: PX + W + 6, y, size: fAnno, text: `${p.aisleFt}'` });
        parts.push(<text key={key++} x={PX + W + 6} y={y}
          fontFamily="JetBrains Mono" fontSize={fAnno} fill="#BFBBB0">{p.aisleFt}&#8242;</text>);
      }
      c += p.aisleFt;
    }
  });

  /* What the customer is storing, under the legend in both orientations.
     Set beside the first run it read well until a row stopped short of the
     building and a cross aisle opened up under it — then the line ran straight
     through the aisle it was not describing. Out here it belongs to the whole
     drawing, which is what it is about, and it cannot collide with anything.

     The span and the run gap used to follow it. They are the solver's working,
     not something a customer can act on. */
  const annotation =
    `${L.productLengthFt}′ PRODUCT · ${L.towersPerRun} TOWERS AT ${ftIn(L.towerCentresFt)}`
    + ` · ${L.overhangFt}′ OVER EACH END`;


  /* the floor the customer said is not available, and the circulation that
     comes off the run — both are already out of the count, so they are drawn */
  if (L.unavailableAlongFt > 0.01) {
    const u = box(alongStartFt + L.usableAlongFt, L.unavailableAlongFt,
      p.wallClearanceFt, L.acrossFt);
    parts.push(<rect key={key++} {...u} fill="#EFEDE6" stroke="#CFCabd" strokeWidth={0.8} />);
    for (let d = -u.height; d < u.width; d += 7) {
      const x1 = Math.max(u.x, u.x + d), y1 = Math.max(u.y, u.y - d);
      const x2 = Math.min(u.x + u.width, u.x + d + u.height);
      if (x2 > x1) {
        parts.push(<line key={key++} x1={x1} y1={y1} x2={x2} y2={y1 + (x2 - x1)}
          stroke="#CFCabd" strokeWidth={0.6} />);
      }
    }
    parts.push(<text key={key++} x={u.x + u.width / 2} y={u.y + u.height / 2 + 3}
      textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}
      transform={vertical ? undefined
        : `rotate(-90 ${(u.x + u.width / 2).toFixed(1)} ${(u.y + u.height / 2).toFixed(1)})`}>
      NOT AVAILABLE FOR RACK</text>);
  }

  L.crossAisleAtFt.forEach((a, i) => {
    // Wall to wall: a route across the floor runs the whole width, and the
    // strip of clearance along each wall is part of it.
    const r = box(alongStartFt + a, L.crossAisleWidthFt,
      0, vertical ? p.buildingLengthFt : p.buildingWidthFt);
    // Opaque, because a cross aisle is empty floor and not a window: the runs
    // either side really stop, and anything showing through would say they do not.
    parts.push(<rect key={key++} {...r} fill="#fff" stroke={BLUE} strokeWidth={0.6}
      strokeDasharray="3 2" />);
    if (i === 0) {
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      parts.push(<text key={key++} x={cx} y={cy} textAnchor="middle"
        transform={vertical ? undefined : `rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})`}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>
        CROSS AISLE {L.crossAisleWidthFt}&#8242;-0&#34;</text>);
    }
  });

  // the building's columns, drawn because they are a fact about the floor
  for (const col of L.columns) {
    parts.push(<rect key={key++} x={PX + col.xFt * sc - 2.2} y={PY + col.yFt * sc - 2.2}
      width={4.4} height={4.4} fill={BLUE} stroke="#fff" strokeWidth={0.5} />);
  }

  const legY = PY + H + 16;

  ext.add(PX, legY - 7, 9, 5);
  ext.text({ x: PX + 13, y: legY - 2, size: fAnno, text: 'MATERIAL' });
  ext.text({ x: PX + 79, y: legY - 2, size: fAnno, text: 'TOWER' });
  ext.text({ x: PX, y: legY + 10, size: fAnno, text: annotation });

    return (
      <>
        <BuildingShell px={PX} py={PY} w={W} h={H} apron={apron} font={fAnno}
          lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} vertical={vertical} />
        {parts}
        <rect x={PX} y={legY - 7} width={9} height={5} fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={0.8} />
        <text x={PX + 13} y={legY - 2} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>MATERIAL</text>
        <rect x={PX + 72} y={legY - 7} width={3} height={5} fill={G} />
        <text x={PX + 79} y={legY - 2} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>TOWER</text>
        <text x={PX} y={legY + 10} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>
          {annotation}</text>
      </>
    );
  });

  return (
    <FigBoxEl aspect={fit.aspect} className={p.boxClass} head={p.head}>
      <svg id="plan" viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Plan of a ${p.buildingLengthFt} by ${p.buildingWidthFt} foot building: `
        + `${L.wallRows} single-sided wall rows and ${L.interiorRows} double-sided interior rows, `
        + `${L.runsPerRow} runs of ${L.towersPerRun} towers each, running `
        + `${vertical ? 'across the width' : 'along the length'}`}>
        {fit.drawn}
      </svg>
      <p className="figstats">
        {L.rows} {L.rows === 1 ? 'ROW' : 'ROWS'} · {L.runsPerRow} RUNS/ROW
        {' · '}{L.towersPerRun} TOWERS/RUN
        {L.lastRowPartial ? ` · LAST ROW ${L.runsInLastRow} OF ${L.runsPerRow}` : ''}
        {' · '}{L.spareFt.toFixed(0)}&#8242; SPARE
      </p>
    </FigBoxEl>
  );
}

/* ── Fig. 2 — elevation ────────────────────────────────────────────────── */

export interface CantileverElevationProps {
  /** The figure's heading, rendered inside the box it sizes. */
  head?: React.ReactNode;
  /** Which of the row's boxes this is. */
  boxClass?: string;
  layout: CantileverRunLayout;
  clearHeightFt: number;
  /** The box this is fitted into, so the text can be sized for the screen. */
  box?: FigBox;
  /** False on the right of a pair: the clear height is labelled once. */
  labelClearHeight?: boolean;
}

function Elevation({
  layout: L, clearHeightFt, box, labelClearHeight = true, head, boxClass,
}: CantileverElevationProps) {
  // Interior rows are the common case, so the bay drawn is double-sided
  // wherever the building has one; a building of only wall rows shows one face.
  const sides: 1 | 2 = L.interiorRows > 0 ? 2 : 1;
  const { FL, CX } = EL_FRAME;
  // The same scale the pallet bay is drawn at, so the two stand on one floor.
  const ppi = elevationPpi(clearHeightFt);
  const colPx = Math.max(6, 9 * ppi);
  const armPx = L.armLengthIn * ppi;
  const basePx = L.baseLengthIn * ppi;
  const topY = FL - L.towerHeightIn * ppi;
  const spY = FL - clearHeightFt * 12 * ppi;

  const fit = fitFigure(box ?? elBox(24, 24), (fAnno, ext, widthPx) => {
  const fDim = fAnno, fTiny = fAnno;
  // The floor and the sprinkler line run the full width of the figure, and the
  // figure's width is decided by everything else — so they are over-drawn past
  // any plausible edge and left to the viewBox to clip. A mark that defines the
  // edge cannot also be sized by it.
  const BLEED = 600;
  const CL = CX - Math.max(armPx, basePx / 2) - colPx - 26 - fAnno * 1.1;

  const parts: React.ReactNode[] = [];
  let key = 0;

  ext.add(CX, FL, 0, 11);
  parts.push(<line key={key++} x1={CX - BLEED} y1={FL} x2={CX + BLEED} y2={FL}
    stroke={INK} strokeWidth={3} />);
  for (let h = CX - BLEED; h < CX + BLEED; h += 26) {
    parts.push(<line key={key++} x1={h} y1={FL} x2={h - 11} y2={FL + 11} stroke={LINE} strokeWidth={1} />);
  }
  parts.push(<line key={key++} x1={CX - BLEED} y1={spY} x2={CX + BLEED} y2={spY}
    stroke={INK} strokeWidth={1.5} strokeDasharray="9 5" />);

  // base, then the tower, then the X-bracing up its height
  const baseHalf = sides === 2 ? basePx : basePx / 2;
  const baseH = Math.max(6, L.baseHeightIn * ppi);
  const baseTopY = FL - baseH;
  parts.push(<rect key={key++} x={sides === 2 ? CX - basePx : CX - colPx / 2} y={baseTopY}
    width={sides === 2 ? basePx * 2 : basePx} height={baseH} fill={INK} />);
  parts.push(<rect key={key++} x={CX - colPx / 2} y={topY} width={colPx} height={FL - topY} fill={G} />);
  // The tower, its base and the arms reaching out either side: the drawing
  // proper, and the thing the viewBox is fitted around.
  ext.add(CX - Math.max(armPx, baseHalf) - colPx / 2, topY,
    Math.max(armPx, baseHalf) * 2 + colPx, FL - topY);

  // The braces stack at the derived pitch, so the elevation draws as many
  // sets as the bill counts rather than a spacing of its own.
  const braceStep = (L.towerHeightIn / L.braceSetsPerBay) * ppi;
  for (let by = baseTopY; by - braceStep > topY; by -= braceStep) {
    const y1 = by, y2 = by - braceStep;
    parts.push(
      <path key={key++} d={`M${CX - colPx / 2} ${y1.toFixed(1)}L${CX + colPx / 2} ${y2.toFixed(1)}`}
        stroke={ARM} strokeWidth={1.1} fill="none" opacity={0.75} />,
      <path key={key++} d={`M${CX + colPx / 2} ${y1.toFixed(1)}L${CX - colPx / 2} ${y2.toFixed(1)}`}
        stroke={ARM} strokeWidth={1.1} fill="none" opacity={0.75} />,
    );
  }

  // The base is a storage level: product rests on it, not on bare steel.
  const faceDirs: number[] = sides === 2 ? [-1, 1] : [1];
  for (const dir of faceDirs) {
    const bx = dir === 1 ? CX + colPx / 2 : CX - colPx / 2 - basePx;
    parts.push(<rect key={key++} x={bx + (dir === 1 ? 5 : 2)} y={baseTopY - 10}
      width={Math.max(4, basePx - 7)} height={10}
      fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={1} />);
  }
  ext.text({ x: CX + Math.max(armPx, baseHalf) + 8, y: baseTopY - 2, size: fTiny, text: 'BASE' });
  parts.push(<text key={key++} x={CX + Math.max(armPx, baseHalf) + 8} y={baseTopY - 2}
    fontFamily="JetBrains Mono" fontSize={fTiny} fill={MUT}>BASE</text>);

  // arms at each level above it, with material lying on them
  for (let i = 0; i < L.levels; i++) {
    const y = baseTopY - (i + 1) * L.armPitchIn * ppi;
    if (y < topY - 0.5) break;
    for (const dir of faceDirs) {
      const ax = dir === 1 ? CX + colPx / 2 : CX - colPx / 2 - armPx;
      parts.push(<rect key={key++} x={ax} y={y - 3} width={armPx} height={4} fill={ARM} />);
      parts.push(<rect key={key++} x={ax + (dir === 1 ? 5 : 2)} y={y - 13} width={armPx - 7} height={10}
        fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={1} />);
    }
    ext.text({ x: CX + Math.max(armPx, baseHalf) + 8, y: y - 3, size: fTiny, text: `L${i + 1}` });
    parts.push(<text key={key++} x={CX + Math.max(armPx, baseHalf) + 8} y={y - 3}
      fontFamily="JetBrains Mono" fontSize={fTiny} fill={MUT}>L{i + 1}</text>);
  }

  // callouts: clear height, tower, arm pitch, arm and base
  const dx = CX - Math.max(armPx, baseHalf) - 34;
  parts.push(
    <line key={key++} x1={dx} y1={topY} x2={dx} y2={FL} stroke={BLUE} strokeWidth={1} />,
    <line key={key++} x1={dx - 5} y1={topY} x2={dx + 5} y2={topY} stroke={BLUE} />,
    <line key={key++} x1={dx - 5} y1={FL} x2={dx + 5} y2={FL} stroke={BLUE} />,
    <text key={key++} transform={`translate(${(dx - 9).toFixed(1)},${((topY + FL) / 2).toFixed(1)}) rotate(-90)`}
      textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fDim} fill={BLUE}>
      TOWER {ftIn(L.towerHeightIn / 12)}</text>,
    ...(labelClearHeight ? [
      <text key={key++} x={CL} y={spY - 7}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>
        CLEAR HEIGHT {clearHeightFt}&#39;-0&#34;</text>,
    ] : []),
  );
  ext.text({
    x: dx - 9, y: (topY + FL) / 2, size: fDim, anchor: 'middle', rotate: -90,
    text: `TOWER ${ftIn(L.towerHeightIn / 12)}`,
  });
  if (labelClearHeight) {
    ext.text({ x: CL, y: spY - 7, size: fAnno, text: `CLEAR HEIGHT ${clearHeightFt}'-0"` });
  } else {
    ext.add(CL, spY - 7);
  }

  {
    // The base is a level, so the first spacing to dimension is base to L1.
    // The label is centred on that gap rather than on the floor line, where its
    // descenders were being cut by the slab.
    // On the right, where the level markers are, and clear of the dimension
    // line it annotates by more than the label is tall.
    const p0 = baseTopY, p1 = p0 - L.armPitchIn * ppi, px2 = CX + Math.max(armPx, baseHalf) + 46;
    ext.text({ x: px2 + 29, y: p0 - 3, size: fDim, anchor: 'start', rotate: -90,
      text: `${L.armPitchIn}"` });
    parts.push(
      <line key={key++} x1={px2} y1={p1} x2={px2} y2={p0} stroke={BLUE} />,
      <line key={key++} x1={px2 - 5} y1={p1} x2={px2 + 5} y2={p1} stroke={BLUE} />,
      <line key={key++} x1={px2 - 5} y1={p0} x2={px2 + 5} y2={p0} stroke={BLUE} />,
      <text key={key++}
        transform={`translate(${(px2 + 29).toFixed(1)},${(p0 - 3).toFixed(1)}) rotate(-90)`}
        textAnchor="start" fontFamily="JetBrains Mono" fontSize={fDim} fill={BLUE}>
        {L.armPitchIn}&#34;</text>,
    );
  }

  parts.push(
  );

    return <>{parts}</>;
  }, FIG_TEXT.anno, (font) => elevationFrameY(spY, font));

  return (
    <FigBoxEl aspect={fit.aspect} className={boxClass} head={head}>
      <svg viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`Cantilever tower: ${L.levels} arm levels at ${L.armPitchIn} inch pitch on a `
          + `${L.baseLengthIn} inch base, ${L.storageLevels} levels of product counting the base`}>
        {fit.drawn}
      </svg>
    </FigBoxEl>
  );
}

export const CantileverPlanFigure = memo(Plan);
export const CantileverElevationFigure = memo(Elevation);
