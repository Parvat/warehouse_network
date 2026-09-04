'use client';

import { memo } from 'react';
import {
  DOCK_APRON_FT, rackType, type MixedLayout, type Orientation, type RackKind,
} from '@trace/rack-engine';
import BuildingShell, { measureShell } from './BuildingShell';
import { FigBoxEl } from './figBox';
import { planBox, fitFigure, type Extent, type FigBox } from './figText';

/**
 * Fig. 1 for a mixed floor: a cantilever strip against one wall and pallet
 * racking filling the rest, drawn in one plan.
 *
 * Both families keep the language they already have — kraft material and tower
 * ticks for the strip, pale bands with bay ticks and a yellow flue for the
 * racking — because the reader has to see two systems, not one hybrid.
 *
 * Everything here is placed from a single cursor that walks in from the strip's
 * wall, so the two zones cannot drift apart: the strip's rows, its own aisles,
 * the shared aisle and then the pallet bands all come off the same running
 * total the engine used to divide the width.
 */

const G = '#14392B', ARM = '#1D5340', FILL = '#E8EFEA',
      MUT = '#6B726C', BLUE = '#1B4FD8', RED = '#A8341C', Y = '#F2C230',
      KRAFT = '#E8DCC2', KRAFT_EDGE = '#B08F52';

export interface MixedPlanProps {
  /** The figure's heading, rendered inside the box it sizes. */
  head?: React.ReactNode;
  /** Which of the row's boxes this is. */
  boxClass?: string;
  mixed: MixedLayout;
  kind: RackKind;
  buildingLengthFt: number;
  buildingWidthFt: number;
  frameDepthIn: number;
  flueIn: number;
  aisleFt: number;
  wallClearanceFt: number;
  orientation: Orientation;
  /** The container this fills, which is all the type sizing needs to know. */
  box?: FigBox;
}

function MixedPlan(p: MixedPlanProps) {
  const M = p.mixed, S = M.strip, L = M.pallets;
  const R = rackType(p.kind);
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
  const apron = DOCK_APRON_FT * sc;

  const fit = fitFigure(p.box ?? planBox(true), (fAnno, ext, widthPx) => {
  measureShell(ext, {
    px: PX, py: PY, w: W, h: H, font: fAnno, vertical,
    lengthFt: p.buildingLengthFt, widthFt: p.buildingWidthFt,
  });

  const at = (aPx: number, aLenPx: number, cPx: number, cLenPx: number) => (vertical
    ? { x: PX + cPx, y: PY + aPx, width: cLenPx, height: aLenPx }
    : { x: PX + aPx, y: PY + cPx, width: aLenPx, height: cLenPx });
  const box = (aFt: number, aLenFt: number, cFt: number, cLenFt: number) =>
    at(aFt * sc, aLenFt * sc, cFt * sc, cLenFt * sc);
  const seg = (aFt: number, aLenFt: number, cFt: number, cLenFt: number) => {
    const r = box(aFt, aLenFt, cFt, cLenFt);
    return { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height };
  };

  const parts: React.ReactNode[] = [];
  let key = 0;

  const alongStartFt = p.wallClearanceFt + DOCK_APRON_FT;

  /* The cursor walks in from the strip's wall along the across axis, so the two
     zones cannot drift apart. The strip stays on the side the customer chose
     whichever way the rows run — 'top' is the start of that axis, which is the
     top wall for rows along the length and the left wall for rows across it. */
  const dir = M.wall === 'top' ? 1 : -1;
  const acrossEndFt = (vertical ? p.buildingLengthFt : p.buildingWidthFt) - p.wallClearanceFt;
  let cursor = M.wall === 'top' ? p.wallClearanceFt : acrossEndFt;
  const take = (ft: number) => {
    const start = dir === 1 ? cursor : cursor - ft;
    cursor += dir * ft;
    return start;
  };
  const marginLabel = (cFt: number, text: string, fill = MUT, size = fAnno) => {
    if (vertical) return;      // the margin is the bottom edge there, and it is full
    ext.text({ x: PX + W + 6, y: PY + cFt * sc + 3, size, text });
    parts.push(<text key={key++} x={PX + W + 6} y={PY + cFt * sc + 3}
      fontFamily="JetBrains Mono" fontSize={size} fill={fill}>{text}</text>);
  };

  /* ── the strip ───────────────────────────────────────────────────────── */

  const armFt = S.armLengthIn / 12;

  const cantRow = (cFt: number, sides: 1 | 2, r: number) => {
    const depthFt = sides === 2 ? S.doubleDepthFt : S.singleDepthFt;
    // A wall row is reached only from the aisle, so its column sits on the wall
    // side and its arms face in; an interior row is armed both ways.
    const colC = sides === 2 ? cFt + depthFt / 2 : dir === 1 ? cFt : cFt + depthFt;
    const armC0 = sides === 2 ? colC - armFt : dir === 1 ? colC : colC - armFt;
    const armC1 = sides === 2 ? colC + armFt : dir === 1 ? colC + armFt : colC;

    // Only the runs this row carries — see the cantilever plan for why.
    const lastRow = r === M.cantileverRows - 1;
    const runsHere = lastRow ? S.runsInLastRow : S.runsPerRow;
    for (let run = 0; run < runsHere; run++) {
      const runA = alongStartFt + (S.runStartsFt[run] ?? 0);
      const towerA = runA + S.overhangFt;
      parts.push(<rect key={key++} {...box(runA, S.runLengthFt, armC0, armC1 - armC0)}
        fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={0.7} opacity={0.55} />);
      for (let t = 0; t < S.towersPerRun; t++) {
        const tA = towerA + t * S.towerCentresFt;
        parts.push(
          <line key={key++} {...seg(tA, 0, armC0, armC1 - armC0)} stroke={ARM} strokeWidth={0.9} />,
          <rect key={key++} {...at(tA * sc - 1.4, 2.8, colC * sc - 2.2, 4.4)} fill={G} />,
        );
      }
      parts.push(<line key={key++} {...seg(towerA, S.spanFt, colC, 0)} stroke={G} strokeWidth={1.8} />);
    }
    marginLabel(colC, sides === 1 ? 'wall row' : '2 sides');
  };

  for (let r = 0; r < M.cantileverRows; r++) {
    const sides: 1 | 2 = r === 0 ? 1 : 2;
    cantRow(take(sides === 2 ? S.doubleDepthFt : S.singleDepthFt), sides, r);
    if (r < M.cantileverRows - 1) {
      const ay = take(M.cantileverAisleFt);
      marginLabel(ay + M.cantileverAisleFt / 2, `${M.cantileverAisleFt}′`, '#BFBBB0');
    }
  }

  /* ── the aisle they share ────────────────────────────────────────────── */

  const shC = take(M.sharedAisleFt);
  const midC = shC + M.sharedAisleFt / 2;
  const divider = seg(0, vertical ? p.buildingWidthFt : p.buildingLengthFt, midC, 0);
  const near = box(alongStartFt, 0, midC, 0);
  parts.push(
    <line key={key++} x1={divider.x1} y1={divider.y1} x2={divider.x2} y2={divider.y2}
      stroke={RED} strokeWidth={0.7} strokeDasharray="2 3" opacity={0.75} />,
  );
  /**
   * A zone's name, in the left margin beside the zone it names.
   *
   * Written across the racking it was unreadable and it hid what it labelled —
   * a caption over the thing is not a caption. Out here it reads the way
   * STAGING does: turned on its side, clear of the building outline, spanning
   * the zone it belongs to.
   */
  const zoneLabel = (text: string, fromC: number, toC: number) => {
    const a = box(alongStartFt, 0, fromC, 0), b = box(alongStartFt, 0, toC, 0);
    const mid = vertical ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
    const x = vertical ? mid : PX - 42;
    const y = vertical ? PY - 30 : mid;
    // Across the width the zones stack along the page, so the label lies flat
    // above the building instead; along it they stack down the left margin.
    if (vertical) {
      ext.text({ x, y, size: fAnno, text, anchor: 'middle' });
      parts.push(<text key={key++} x={x} y={y} textAnchor="middle"
        fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>{text}</text>);
    } else {
      ext.text({ x, y, size: fAnno, text, anchor: 'middle', rotate: -90 });
      parts.push(<text key={key++}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(-90)`}
        textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>{text}</text>);
    }
  };
  // The strip is on the wall the layout put it on; the pallet zone is the
  // rest, and the shared aisle's centre is the line between them.
  const stripC = dir === 1 ? [p.wallClearanceFt, midC] : [midC, acrossEndFt];
  const palletC = dir === 1 ? [midC, acrossEndFt] : [p.wallClearanceFt, midC];
  zoneLabel('CANTILEVER STRIP', stripC[0]!, stripC[1]!);
  zoneLabel('PALLET RACKING', palletC[0]!, palletC[1]!);

  // dimensioned at its true width, because that width is what the strip costs
  // Along the rows the dimension sits near the far end; across them it runs up
  // the drawing from the bottom, so it cannot collide with the zone labels at
  // the top.
  const dimA = (vertical ? p.buildingWidthFt : p.buildingLengthFt)
    - p.wallClearanceFt - (vertical ? 4 : 14);
  const dim = seg(dimA, 0, shC, M.sharedAisleFt);
  const tick0 = seg(dimA - 3, 6, shC, 0);
  const tick1 = seg(dimA - 3, 6, shC + M.sharedAisleFt, 0);
  const lab = box(dimA - 4, 0, midC, 0);
  parts.push(
    <line key={key++} x1={dim.x1} y1={dim.y1} x2={dim.x2} y2={dim.y2} stroke={BLUE} />,
    <line key={key++} x1={tick0.x1} y1={tick0.y1} x2={tick0.x2} y2={tick0.y2} stroke={BLUE} />,
    <line key={key++} x1={tick1.x1} y1={tick1.y1} x2={tick1.x2} y2={tick1.y2} stroke={BLUE} />,
    vertical
      ? <text key={key++} transform={`translate(${(lab.x - 4).toFixed(1)} ${lab.y.toFixed(1)}) rotate(-90)`}
          textAnchor="start" fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>
          SHARED AISLE {M.sharedAisleFt}&#8242;-0&#34;</text>
      : <text key={key++} x={lab.x} y={lab.y - 4} textAnchor="end"
          fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>
          SHARED AISLE {M.sharedAisleFt}&#8242;-0&#34;</text>,
  );

  /* ── the pallet racking ──────────────────────────────────────────────── */

  const fd = p.frameDepthIn / 12;
  const flue = R.pick === 'lane' ? 0 : p.flueIn / 12;
  const deep = L.deep;
  const rackLenFt = L.bays * L.bayLengthFt;

  /**
   * A rack band, drawn bay by bay from where the solver put each bay.
   *
   * One rectangle the length of the row was the reason a cross aisle here read
   * as a window onto racking rather than as a gap in it: the row was drawn
   * straight through the aisle and the aisle painted over the top. The solver
   * already breaks its bay starts at every aisle, so drawing from that list
   * gives real segments with empty floor between them — and nothing has to be
   * painted over anything.
   */
  const band = (cFt: number, thickFt: number, label: string | null, nDeep: number) => {
    for (const bs of L.bayStartsFt) {
      const a0 = alongStartFt + bs;
      parts.push(<rect key={key++} {...box(a0, L.bayLengthFt, cFt, thickFt)}
        fill={FILL} stroke={G} strokeWidth={0.9} />);
      for (let q = 1; q < nDeep; q++) {
        const l = seg(a0, L.bayLengthFt, cFt + (thickFt * q) / nDeep, 0);
        parts.push(<line key={key++} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={G} strokeWidth={0.55} strokeDasharray="5 3" />);
      }
      // A frame at the end of every bay, and at the start of every bay that
      // opens a segment — the first, and the first after each cross aisle.
      const j = L.bayStartsFt.indexOf(bs), prev = L.bayStartsFt[j - 1];
      const opensSegment = prev === undefined || bs - prev > L.bayLengthFt + 0.01;
      for (const k of opensSegment ? [0, 1] : [1]) {
        const bPx = (a0 + k * L.bayLengthFt) * sc;
        parts.push(<rect key={key++}
          {...at(bPx - 0.8, 1.6, cFt * sc - 1, thickFt * sc + 2)} fill={G} />);
      }
    }
    if (label) marginLabel(cFt + thickFt / 2, label);
  };

  if (R.pick === 'aisle') {
    const pairs = Math.max(0, (L.rows - L.wallRows) / 2);
    for (let i = 0; i < pairs; i++) {
      const c0 = take(deep * fd * 2 + flue);
      band(c0, deep * fd, null, deep);
      const fc = c0 + deep * fd;
      const fh = Math.max(1.4 / sc, flue);
      // A flue is the gap between the two rows of a back-to-back pair, so it
      // exists exactly where those rows exist. Drawn as one strip the length of
      // the unsplit row it ran on into the cross aisles at one end and was used
      // up before the far end — the rows were segmented and the flue was not.
      if (flue > 0) {
        for (const bs of L.bayStartsFt) {
          parts.push(<rect key={key++} {...box(alongStartFt + bs, L.bayLengthFt, fc, fh)}
            fill={Y} />);
        }
      }
      band(fc + fh, deep * fd, null, deep);
      const ac = take(p.aisleFt);
      marginLabel(ac + p.aisleFt / 2, `${p.aisleFt}′`, '#BFBBB0');
    }
    // the far wall is a real wall, so its row is single
    if (L.wallRows > 0) {
      band(take(deep * fd), deep * fd, deep > 1 ? `${deep} deep` : 'wall row', deep);
    }
  } else {
    const blockFt = deep * fd;
    if (R.openEnds === 2) take(p.aisleFt);
    for (let bkt = 0; bkt < L.blocks; bkt++) {
      band(take(blockFt), blockFt, `${deep} deep`, deep);
      take(p.aisleFt);
    }
  }


  /* the floor the customer said is not available, and the circulation that
     comes off the run — both are already out of the count, so they are drawn */
  if (S.unavailableAlongFt > 0.01) {
    const u = box(alongStartFt + S.usableAlongFt, S.unavailableAlongFt,
      p.wallClearanceFt, S.acrossFt);
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

  /* A cross aisle is a route through the building, not a gap in a zone. The
     solver puts both zones' aisles at the same feet — one calculation, from
     the building — so each is drawn once, as a single gap running the full
     width across both zones, and dimensioned once inside it.

     Drawn as two rectangles it read as two staggered dead ends, which is what
     a fire officer would call it. Nothing is painted over racking either way:
     the rows genuinely stop and start again, and this is white floor with a
     dashed edge, not a window onto rack seen through it. */
  L.crossAisleAtFt.forEach((a, i) => {
    // Wall to wall: a route across the floor runs the whole width, and the
    // strip of clearance along each wall is part of it.
    const r = box(alongStartFt + a, L.crossAisleWidthFt,
      0, vertical ? p.buildingLengthFt : p.buildingWidthFt);
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

  for (const col of S.columns) {
    parts.push(<rect key={key++} x={PX + col.xFt * sc - 2.2} y={PY + col.yFt * sc - 2.2}
      width={4.4} height={4.4} fill={BLUE} stroke="#fff" strokeWidth={0.5} />);
  }

  const legY = PY + H + 16;
  ext.add(PX, legY - 7, 9, 5);
  ext.text({ x: PX + 13, y: legY - 2, size: fAnno, text: 'MATERIAL' });
  ext.text({ x: PX + 85, y: legY - 2, size: fAnno, text: 'RACK' });

    return (
      <>
        <BuildingShell px={PX} py={PY} w={W} h={H} apron={apron} font={fAnno}
          lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} vertical={vertical} />
        {parts}

        <rect x={PX} y={legY - 7} width={9} height={5} fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={0.8} />
        <text x={PX + 13} y={legY - 2} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>MATERIAL</text>
        <rect x={PX + 72} y={legY - 7} width={9} height={5} fill={FILL} stroke={G} strokeWidth={0.8} />
        <text x={PX + 85} y={legY - 2} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>RACK</text>
      </>
    );
  });

  return (
    <FigBoxEl aspect={fit.aspect} className={p.boxClass} head={p.head}>
      <svg id="plan" viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Plan of a ${p.buildingLengthFt} by ${p.buildingWidthFt} foot building: a `
        + `${M.cantileverRows} row cantilever strip against the ${M.wall} wall and ${L.rows} rows `
        + `of pallet racking filling the rest, sharing a ${M.sharedAisleFt} foot aisle, running `
        + `${vertical ? 'across the width' : 'along the length'}`}>
        {fit.drawn}
      </svg>
      <p className="figstats">
        {M.cantileverRows} CANT {M.cantileverRows === 1 ? 'ROW' : 'ROWS'}
        {' · '}{L.rows} PALLET ROWS · {L.bays} BAYS/ROW
        {S.lastRowPartial ? ` · STRIP LAST ROW ${S.runsInLastRow} OF ${S.runsPerRow}` : ''}
        {' · '}{Math.max(0, L.spareFt).toFixed(0)}&#8242; SPARE
      </p>
    </FigBoxEl>
  );
}

export default memo(MixedPlan);
