'use client';

import { memo } from 'react';
import {
  DOCK_APRON_FT, rackType,
  type Orientation, type RackKind, type RackLayout,
} from '@trace/rack-engine';
import BuildingShell, { measureShell } from './BuildingShell';
import { columnSpacingFt, detailFor, simplifiedNote, type Detail } from './detail';
import { FigBoxEl } from './figBox';
import { planBox, fitFigure, type Extent, type FigBox } from './figText';

/**
 * Fig. 1 — building plan.
 *
 * Ported from `drawPlan` in docs/a3-sizing-sheet.html, which is the approved
 * drawing for this figure. The palette, the band construction, the flue strip,
 * the dock marks and the legend are all as drawn there.
 *
 * **The building does not rotate; the racking does.** Length is always drawn
 * horizontally and width vertically, whatever ROWS RUN says, and so are the
 * dimension lines. What turns is the racking inside: bays are counted down the
 * axis the rows run, and rows stack across the other one. Swapping the
 * building's own dimensions with the layout axes — as this drawing used to —
 * redraws a 240 × 120 shed as a 120 × 240 one, which is not what the control
 * does and not a building anybody owns. The dock apron is the one exception,
 * and `BuildingShell` explains why.
 *
 * Everything inside the walls is therefore placed in (along, across) feet and
 * mapped once, so the two orientations cannot drift apart.
 *
 * A row more than one pallet deep is drawn as separate pallet rows, or it
 * reads the same as selective with a fatter band.
 */

const G = '#14392B', FILL = '#E8EFEA', Y = '#F2C230', RED = '#A8341C', MUT = '#6B726C',
      BLUE = '#1B4FD8';

export interface PlanFigureProps {
  /** The figure's heading, rendered inside the box it sizes. */
  head?: React.ReactNode;
  /** Which of the row's boxes this is. */
  boxClass?: string;
  /** The counts under the drawing, inside the box that sizes it. */
  foot?: React.ReactNode;
  kind: RackKind;
  layout: RackLayout;
  buildingLengthFt: number;
  buildingWidthFt: number;
  frameDepthIn: number;
  flueIn: number;
  aisleFt: number;
  wallClearanceFt: number;
  orientation: Orientation;
  /** Drawn once beside the grid, where there is one. */
  gridLabel?: string;
  /** The container this fills, which is all the type sizing needs to know. */
  box?: FigBox;
}

/** What the drawing left out, where it left anything out. */
function SimplifiedNote({ detail, layout, kind }: {
  detail: Detail | null; layout: RackLayout; kind: 'lane' | 'bay';
}) {
  const text = detail
    && simplifiedNote(detail, {
      rows: layout.rows, bays: layout.bays, columns: layout.columns.length,
      unit: kind === 'lane' ? 'lane' : 'bay',
    });
  return text ? <p className="figsimple">{text}</p> : null;
}

function PlanFigure(p: PlanFigureProps) {
  const R = rackType(p.kind);
  const L = p.layout;
  const PX = 74, PY = 40;

  // An internal scale, and only that: the building's longest side is always
  // this many units, so a 400 x 100 shed and a 150 x 150 one are drawn with
  // their labels and margins carrying the same weight. What decides how big
  // any of it lands on screen is the viewBox fitted to it afterwards.
  const NOMINAL = 470;
  let detail: Detail | null = null;
  const sc = NOMINAL / Math.max(p.buildingLengthFt, p.buildingWidthFt);
  const W = p.buildingLengthFt * sc, H = p.buildingWidthFt * sc;
  const vertical = p.orientation === 'width';

  const fit = fitFigure(p.box ?? planBox(), (fAnno, ext, widthPx) => {
  // How much room a bay actually gets on screen decides how much of this is
  // worth drawing. Nothing here touches a count: every figure on the sheet
  // comes from the solver, so a simpler picture is still the same building.
  const d = detailFor({
    renderedWidthPx: widthPx, buildingLengthFt: p.buildingLengthFt,
    bayLengthFt: L.bayLengthFt,
    // what full detail would come to, for the element ceiling to cap. A lane
    // block is one band whatever its depth; an aisle-picked row is a band each.
    bands: R.pick === 'lane' ? L.blocks : L.rows, bays: L.bays, deep: L.deep,
    // the closest two columns get, which is what decides whether they can be
    // told apart on the page
    columnSpacingFt: columnSpacingFt(L.columns),
  });


  /* (along, across) feet from the top-left corner, mapped once */
  const at = (aPx: number, aLenPx: number, cPx: number, cLenPx: number) => (vertical
    ? { x: PX + cPx, y: PY + aPx, width: cLenPx, height: aLenPx }
    : { x: PX + aPx, y: PY + cPx, width: aLenPx, height: cLenPx });
  const box = (aFt: number, aLenFt: number, cFt: number, cLenFt: number) =>
    at(aFt * sc, aLenFt * sc, cFt * sc, cLenFt * sc);

  const fd = p.frameDepthIn / 12;
  const flue = R.pick === 'lane' ? 0 : p.flueIn / 12;
  const aisle = p.aisleFt, deep = L.deep;
  const apron = DOCK_APRON_FT * sc;
  measureShell(ext, {
    px: PX, py: PY, w: W, h: H, font: fAnno, vertical,
    lengthFt: p.buildingLengthFt, widthFt: p.buildingWidthFt,
  });

  // The racking starts clear of the dock apron on the axis the rows run —
  // which is the axis the solver reserved it on. The staging strip follows it,
  // so the rows never cross the space in front of the doors.
  // The solver slid the block to clear the columns; the drawing has to sit
  // where it put it, or the plan and the count describe different buildings.
  const alongStartFt = p.wallClearanceFt + DOCK_APRON_FT;
  const acrossStartFt = p.wallClearanceFt + L.acrossOffsetFt;
  const bayStarts = L.bayStartsFt;
  const lost = new Set(L.columns.filter((c) => !c.absorbed).map((c) => `${c.row}:${c.bay}`));

  const runLenFt = (bayStarts.at(-1) ?? 0) + L.bayLengthFt;
  const parts: React.ReactNode[] = [];
  let key = 0;

  /** A rack band: `cFt` from the top-left across the rows, `thickFt` deep. */
  let bandIndex = 0;
  const band = (cFt: number, thickFt: number, label: string | null, nDeep: number) => {
    const row = bandIndex++;
    if (!d.bays) {
      // Below about two pixels a bay, the ticks merge into a solid block and
      // the drawing says less than a plain band would. So each segment is drawn
      // as one shape — the racking that is there, without pretending to show
      // divisions nobody could see.
      let seg0 = 0;
      for (let j = 0; j <= bayStarts.length; j++) {
        const prev = bayStarts[j - 1], here = bayStarts[j];
        const breaks = here === undefined || prev === undefined
          || here - prev > L.bayLengthFt + 0.01;
        if (j > 0 && breaks) {
          const a0 = alongStartFt + bayStarts[seg0]!;
          const lenFt = prev! + L.bayLengthFt - bayStarts[seg0]!;
          parts.push(<rect key={key++} {...box(a0, lenFt, cFt, thickFt)}
            fill={FILL} stroke={G} strokeWidth={d.level === 'banded' ? 0.9 : 0.6} />);
          // the frames closing each end of the segment, which are the one thing
          // still worth a mark at this scale
          for (const k of [0, 1]) {
            const bPx = (a0 + k * lenFt) * sc;
            parts.push(<rect key={key++}
              {...at(bPx - 0.8, 1.6, cFt * sc - 1, thickFt * sc + 2)} fill={G} />);
          }
          seg0 = j;
        }
      }
      if (label && !vertical && d.perRowLabels) {
        const y = PY + (cFt + thickFt / 2) * sc + 3;
        ext.text({ x: PX + W + 6, y, size: fAnno, text: label });
        parts.push(<text key={key++} x={PX + W + 6} y={y}
          fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>{label}</text>);
      }
      return;
    }
    for (let j = 0; j < bayStarts.length; j++) {
      const a0 = alongStartFt + bayStarts[j]!;
      const killed = lost.has(`${row}:${j}`);
      parts.push(<rect key={key++} {...box(a0, L.bayLengthFt, cFt, thickFt)}
        fill={killed ? '#F6E4DE' : FILL} stroke={killed ? RED : G} strokeWidth={0.9} />);
      if (killed) {
        // hatched, because the bay is drawn where it is and then given up
        for (let t = 0; t < 4; t++) {
          const f = (t + 0.5) / 4;
          const h = box(a0 + L.bayLengthFt * f, 0, cFt, thickFt);
          parts.push(<line key={key++} x1={h.x} y1={h.y} x2={h.x + h.width} y2={h.y + h.height}
            stroke={RED} strokeWidth={0.5} opacity={0.7} />);
        }
      }
      for (let q = 1; q < nDeep; q++) {
        const l = box(a0, L.bayLengthFt, cFt + (thickFt * q) / nDeep, 0);
        parts.push(<line key={key++} x1={l.x} y1={l.y} x2={l.x + l.width} y2={l.y + l.height}
          stroke={G} strokeWidth={0.55} strokeDasharray="5 3" />);
      }
      // A frame at the end of every bay, and at the start of every bay that
      // opens a segment — the first, and the first after each cross aisle.
      const prev = bayStarts[j - 1];
      const opensSegment = prev === undefined || bayStarts[j]! - prev > L.bayLengthFt + 0.01;
      for (const k of opensSegment ? [0, 1] : [1]) {
        const bPx = (a0 + k * L.bayLengthFt) * sc;
        parts.push(<rect key={key++}
          {...at(bPx - 0.8, 1.6, cFt * sc - 1, thickFt * sc + 2)} fill={G} />);
      }
    }
    // Rows running across the width stack twice as many bands in the same
    // margin, so a label each is unreadable; the stats line carries the counts.
    if (label && !vertical) {
      const y = PY + (cFt + thickFt / 2) * sc + 3;
      ext.text({ x: PX + W + 6, y, size: fAnno, text: label });
      parts.push(<text key={key++} x={PX + W + 6} y={y}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>{label}</text>);
    }
  };

  /** Truck entry marks. side -1 before the block across the rows, +1 after it. */
  const entry = (cFt: number, thickFt: number, side: -1 | 1) => {
    const cPx = (side < 0 ? cFt * sc - 4 : (cFt + thickFt) * sc + 4);
    for (let k = 1; k <= 3; k++) {
      const aPx = (alongStartFt + (runLenFt * k) / 4) * sc;
      const o = at(aPx, 0, cPx, 0);
      parts.push(<g key={key++} transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)})`
        + (vertical ? ' rotate(-90)' : '')}>
        <path d={`M0 ${-6 * side}v${6 * side}m0 0l-3 ${-3 * side}m3 ${3 * side}l3 ${-3 * side}`}
          stroke={RED} strokeWidth={1.1} fill="none" />
      </g>);
    }
  };

  // The legend shows a flue swatch, so the strip itself is called out — once,
  // on the first one, in the aisle dimension's style.
  let flueLabelled = false;
  const flueCallout = (cFt: number, thickFt: number) => {
    if (flueLabelled || flue <= 0 || vertical) return;
    flueLabelled = true;
    const my = PY + (cFt + thickFt / 2) * sc;
    const endA = (alongStartFt + runLenFt) * sc;
    parts.push(
      <line key={key++} x1={PX + endA} y1={my} x2={PX + W + 4} y2={my} stroke={Y} strokeWidth={1} />,
      <text key={key++} x={PX + W + 6} y={my + 3}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill="#B08F52">FLUE {p.flueIn}&#34;</text>,
    );
    ext.text({ x: PX + W + 6, y: my + 3, size: fAnno, text: `FLUE ${p.flueIn}"` });
  };

  /** One aisle width, called out where there is room for it. */
  let aisleLabelled = false;
  const aisleCallout = (cFt: number) => {
    if (!vertical || aisleLabelled) return;
    aisleLabelled = true;
    const o = box(alongStartFt + 4, 0, cFt + aisle / 2, 0);
    ext.text({ x: o.x, y: o.y, size: fAnno, text: `${aisle}' AISLE`, anchor: 'end', rotate: -90 });
    parts.push(<text key={key++}
      transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)}) rotate(-90)`}
      textAnchor="end" fontFamily="JetBrains Mono" fontSize={fAnno} fill="#BFBBB0">
      {aisle}&#8242; AISLE</text>);
  };

  let c = acrossStartFt;
  if (R.pick === 'aisle') {
    const single = deep * fd;
    const pair = deep * fd * 2 + flue;
    if (L.wallRows > 0) {
      band(c, single, deep > 1 ? `${deep} deep` : 'wall row', deep);
      c += single;
      aisleCallout(c);
      c += aisle;
    }
    const pairs = (L.rows - L.wallRows) / 2;
    for (let i = 0; i < pairs; i++) {
      band(c, deep * fd, null, deep);
      const fc = c + deep * fd;
      const fh = Math.max(1.4 / sc, flue);
      if (flue > 0 && d.bays) {
        for (const bs of bayStarts) {
          parts.push(<rect key={key++} {...box(alongStartFt + bs, L.bayLengthFt, fc, fh)} fill={Y} />);
        }
        flueCallout(fc, fh);
      }
      band(fc + fh, deep * fd, null, deep);
      c += pair;
      if (!vertical && d.perRowLabels && (i < pairs - 1 || L.wallRows > 1)) {
        const y = PY + (c + aisle / 2) * sc + 3;
        ext.text({ x: PX + W + 6, y, size: fAnno, text: `${aisle}'` });
        parts.push(<text key={key++} x={PX + W + 6} y={y}
          fontFamily="JetBrains Mono" fontSize={fAnno} fill="#BFBBB0">{aisle}&#8242;</text>);
      }
      aisleCallout(c);
      c += aisle;
    }
    if (L.wallRows > 1) band(c, single, deep > 1 ? `${deep} deep` : 'wall row', deep);
  } else {
    const block = deep * fd;
    if (R.openEnds === 2) c += aisle;
    for (let b = 0; b < L.blocks; b++) {
      band(c, block, `${deep} deep`, 1);
      for (let dd = 1; dd < deep; dd++) {
        const dc = c + (block * dd) / deep;
        // Per bay, not across the whole block: a lane's depth divisions are
        // part of the racking and stop where the racking stops.
        for (const bs of bayStarts) {
          const l = box(alongStartFt + bs, L.bayLengthFt, dc, 0);
          parts.push(<line key={key++} x1={l.x} y1={l.y} x2={l.x + l.width} y2={l.y + l.height}
            stroke={G} strokeWidth={0.5} strokeDasharray="4 3" />);
        }
      }
      entry(c, block, -1);
      if (R.openEnds === 2) entry(c, block, 1);
      c += block + aisle;
    }
  }

  /* the strip at the dock end the customer said is not available */
  if (L.unavailableAlongFt > 0.01) {
    const u = box(p.wallClearanceFt + DOCK_APRON_FT + L.usableAlongFt, L.unavailableAlongFt,
      p.wallClearanceFt, L.acrossFt);
    parts.push(<rect key={key++} {...u} fill="#EFEDE6" stroke="#CFCabd" strokeWidth={0.8} />);
    const step = 7;
    for (let d = -u.height; d < u.width; d += step) {
      const x1 = Math.max(u.x, u.x + d), y1 = Math.max(u.y, u.y - d);
      const x2 = Math.min(u.x + u.width, u.x + d + u.height);
      const y2 = y1 + (x2 - x1);
      if (x2 > x1) {
        parts.push(<line key={key++} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#CFCabd" strokeWidth={0.6} />);
      }
    }
    parts.push(<text key={key++} x={u.x + u.width / 2} y={u.y + u.height / 2 + 3}
      textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}
      transform={vertical ? undefined : `rotate(-90 ${(u.x + u.width / 2).toFixed(1)} ${(u.y + u.height / 2).toFixed(1)})`}>
      NOT AVAILABLE FOR RACK</text>);
  }

  /* circulation, dimensioned where it is drawn. A cross aisle is a gap: the
     bays stop at its edge and start again on the far side, which is why the
     bay starts above already carry the break. */
  L.crossAisleAtFt.forEach((a, i) => {
    // Wall to wall: a route across the floor runs the whole width, and the
    // strip of clearance along each wall is part of it.
    const r = box(alongStartFt + a, L.crossAisleWidthFt,
      0, vertical ? p.buildingLengthFt : p.buildingWidthFt);
    parts.push(<rect key={key++} {...r} fill="#fff" stroke={BLUE}
      strokeWidth={0.6} strokeDasharray="3 2" />);
    // At a scale where a bay is a couple of pixels the aisle is a couple of
    // pixels wide too, and a label reading along it lands on the wall beside it.
    if (i === 0 && d.perRowLabels) {
      // Inside the aisle, reading along it: above the building it fouls the wall.
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      parts.push(<text key={key++} x={cx} y={cy} textAnchor="middle"
        transform={vertical ? undefined : `rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})`}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>
        CROSS AISLE {L.crossAisleWidthFt}&#8242;-0&#34;</text>);
    }
  });

  /* The columns the layout was built around. A column in a bay costs that bay
     and is drawn with it; the two that stop a building working — one standing
     in an aisle, one against a pick face — are marked here, because no amount
     of hatching a bay says "the truck cannot get to this". */
  if (!d.columnsIndividually && L.columns.length > 0) {
    // Closer together than a few pixels, a column mark each is a dotted mess.
    // The grid is what a reader can still use at this scale, and the count goes
    // in the stats line where it stays legible.
    const xs = [...new Set(L.columns.map((c) => c.xFt))];
    const ys = [...new Set(L.columns.map((c) => c.yFt))];
    for (const x of xs) {
      parts.push(<line key={key++} x1={PX + x * sc} y1={PY} x2={PX + x * sc} y2={PY + H}
        stroke={BLUE} strokeWidth={0.4} opacity={0.35} />);
    }
    for (const y of ys) {
      parts.push(<line key={key++} x1={PX} y1={PY + y * sc} x2={PX + W} y2={PY + y * sc}
        stroke={BLUE} strokeWidth={0.4} opacity={0.35} />);
    }
  }
  for (const col of d.columnsIndividually ? L.columns : []) {
    const cx0 = PX + col.xFt * sc, cy0 = PY + col.yFt * sc;
    const bad = col.where === 'aisle' || col.where === 'face';
    if (col.where === 'aisle') {
      parts.push(<circle key={key++} className="colwarn" cx={cx0} cy={cy0} r={5.4}
        fill="none" stroke={RED} strokeWidth={1.1} />);
    }
    parts.push(<rect key={key++} className={bad ? 'colwarn' : undefined}
      x={cx0 - 2.2} y={cy0 - 2.2} width={4.4} height={4.4}
      fill={col.where === 'aisle' ? RED : col.where === 'face' ? '#C8891E' : BLUE}
      stroke="#fff" strokeWidth={0.5}>
      {bad && <title>{`Column at ${col.xFt} × ${col.yFt} ft: `
        + (col.where === 'aisle' ? 'standing in an aisle' : 'against a pick face')}</title>}
    </rect>);
  }
  if (p.gridLabel) {
    ext.text({ x: PX + W, y: PY - 6, size: fAnno, text: p.gridLabel, anchor: 'end' });
    parts.push(<text key={key++} x={PX + W} y={PY - 6} textAnchor="end"
      fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>{p.gridLabel}</text>);
  }

  const legY = PY + H + 16;
  ext.add(PX, legY - 7, 9, 5);
  ext.text({ x: PX + 13, y: legY - 2, size: fAnno, text: 'RACK' });
  const second = R.pick === 'lane' ? 'TRUCK ENTRY' : flue > 0 && d.bays ? 'FLUE' : null;
  if (second) ext.text({ x: PX + 58, y: legY - 2, size: fAnno, text: `  ${second}` });

    detail = d;
    return (
      <>
        <BuildingShell px={PX} py={PY} w={W} h={H} apron={apron} font={fAnno}
          lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} vertical={vertical} />
        {parts}

        <rect x={PX} y={legY - 7} width={9} height={5} fill={FILL} stroke={G} strokeWidth={0.8} />
        <text x={PX + 13} y={legY - 2} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>RACK</text>
        {R.pick === 'lane' ? (
          <>
            <path d={`M${PX + 58} ${legY - 4}v-6m0 6l-3 -3m3 3l3 -3`} stroke={RED} strokeWidth={1.1} fill="none" />
            <text x={PX + 66} y={legY - 2} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>TRUCK ENTRY</text>
          </>
        ) : flue > 0 && d.bays ? (
          <>
            <rect x={PX + 58} y={legY - 7} width={9} height={5} fill={Y} />
            <text x={PX + 71} y={legY - 2} fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}>FLUE</text>
          </>
        ) : null}
      </>
    );
  });

  return (
    <FigBoxEl aspect={fit.aspect} className={p.boxClass} head={p.head}
      foot={<><SimplifiedNote detail={detail} layout={L} kind={R.pick === 'lane' ? 'lane' : 'bay'} />{p.foot}</>}>
    <svg id="plan" viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label={
        `Plan of a ${p.buildingLengthFt} by ${p.buildingWidthFt} foot building holding `
        + `${L.rows} rows of ${L.bays} bays, running `
        + `${vertical ? 'across the width' : 'along the length'}`}>
      {fit.drawn}
    </svg>
    </FigBoxEl>
  );
}

/**
 * The counts read under the drawing rather than inside it: set in the SVG they
 * ran past the building's frame on a wide layout, and a caption can centre and
 * wrap instead.
 */
function PlanFigureWithStats(p: PlanFigureProps) {
  const R = rackType(p.kind), L = p.layout;
  // A lane is counted in lanes. Bays describe a beam, and there is no beam in a
  // drive-in lane — the pallet rests on rails along the uprights.
  if (R.onePalletLanes) {
    return (
      <PlanFigure {...p} foot={
        <p className="figstats">
          {L.blocks} {L.blocks === 1 ? 'BLOCK' : 'BLOCKS'} · {L.bays} LANES
          {' · '}{L.deep} DEEP · {L.levels} HIGH · {L.palletsAcross} WIDE
          {L.baysLostToColumns > 0 ? ` · ${L.baysLostToColumns} LOST TO COLUMNS` : ''}
          {' · '}{Math.max(0, L.spareFt).toFixed(0)}&#8242; SPARE
        </p>
      } />
    );
  }

  return (
    <PlanFigure {...p} foot={
      <p className="figstats">
        {L.rows} ROWS{' · '}{L.bays} BAYS/ROW
        {/* Depth, height and width are what tell one deep type from another, so
            they are named together wherever a type has depth to speak of. */}
        {L.deep > 1 ? ` · ${L.deep} DEEP · ${L.levels} HIGH · ${L.palletsAcross} WIDE` : ''}
        {L.baysLostToColumns > 0 ? ` · ${L.baysLostToColumns} LOST TO COLUMNS` : ''}
        {' · '}{Math.max(0, L.spareFt).toFixed(0)}&#8242; SPARE
      </p>
    } />
  );
}

export default memo(PlanFigureWithStats);
