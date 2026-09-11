'use client';

import { memo } from 'react';
import {
  DOCK_APRON_FT, rackType, type MixedLayout, type Orientation, type RackKind,
} from '@trace/rack-engine';
import BuildingShell, { measureShell } from './BuildingShell';
import { columnMarks } from './ColumnMarks';
import { FigBoxEl, PlanHead, type LegendItem } from './figBox';
import {
  aisleLabelFits, centeredCrossAisleFt, floorFraction, insideAisleLabel, outsideRowLabel, planBox, fitFigure,
  type Extent, type FigBox,
} from './figText';

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
  /*
   * Marks that belong over the drawing rather than in it.
   *
   * SVG has no z-index: what is painted last is on top, and a cross aisle is a
   * white strip painted across the whole building. The shared aisle is
   * dimensioned near the far end of the run, so wherever a cross aisle fell
   * there the strip went over the label and took the front of it off — leaving
   * `RED AISLE 14'-0"` on the drawing. The dimension is about the strip either
   * side of the aisle, not about the floor under it, so it goes on top.
   */
  const over: React.ReactNode[] = [];
  let key = 0;

  const alongStartFt = p.wallClearanceFt + DOCK_APRON_FT;

  /**
   * The access mark on one end of a lane block — as the pallet-only plan draws
   * it. side -1 is the block's near end across the rows, +1 its far end.
   *
   * One mark per section of the run, centred on it, pointing into the lane.
   */
  const entry = (cFt: number, thickFt: number, side: -1 | 1) => {
    const cPx = (side < 0 ? cFt * sc - 4 : (cFt + thickFt) * sc + 4);
    const inward = -side;
    let seg0 = 0;
    const starts = L.bayStartsFt;
    for (let j = 0; j <= starts.length; j++) {
      const prev = starts[j - 1], here = starts[j];
      const breaks = here === undefined || prev === undefined
        || here - prev > L.bayLengthFt + 0.01;
      if (j > 0 && breaks) {
        const a0 = alongStartFt + starts[seg0]!;
        const a1 = alongStartFt + prev! + L.bayLengthFt;
        const o = at(((a0 + a1) / 2) * sc, 0, cPx, 0);
        parts.push(<g key={key++} transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)})`
          + (vertical ? ' rotate(-90)' : '')}>
          <path d={`M0 0v${6 * inward}m0 0l-3 ${-3 * inward}m3 ${3 * inward}l3 ${-3 * inward}`}
            stroke={RED} strokeWidth={1.1} fill="none" />
        </g>);
        seg0 = j;
      }
    }
  };

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
  /**
   * An aisle width, inside the gap it dimensions rather than past the
   * building — see `insideAisleLabel` — or past it, on a building large
   * enough that this aisle no longer has room on screen for its own label —
   * see `aisleLabelFits`. Near the entrance, where the floor is always real
   * racking rather than a cross aisle. `cFt` is the aisle's own start, across
   * the rows.
   */
  const aisleLabel = (cFt: number, aisleFt: number) => {
    const text = `${aisleFt}′`;
    const acrossPx = (cFt + aisleFt / 2) * sc;
    const o = box(alongStartFt + 4, 0, cFt + aisleFt / 2, 0);
    const lbl = aisleLabelFits({ aisleFt, sc, size: fAnno })
      ? insideAisleLabel(ext, { vertical, x: o.x, y: o.y, text, size: fAnno })
      : outsideRowLabel(ext, { vertical, px: PX, py: PY, w: W, h: H, acrossPx, text, size: fAnno, fill: BLUE });
    parts.push(<text key={key++} {...lbl}
      fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>{aisleFt}&#8242;</text>);
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
    // No per-row label: "2 sides" used to be called out here, in the margin
    // past the wall, and a run of many interior rows put one there for every
    // row — the same margin cost that moved aisle labels inside, just never
    // fixed for this one. Removed rather than moved: which rows are armed
    // from both sides is already on the placard ("Sides armed"), and there is
    // no gap here the way an aisle is one, so there is nowhere inside a row's
    // own band to put it without sitting on the arms.
  };

  for (let r = 0; r < M.cantileverRows; r++) {
    const sides: 1 | 2 = r === 0 ? 1 : 2;
    cantRow(take(sides === 2 ? S.doubleDepthFt : S.singleDepthFt), sides, r);
    if (r < M.cantileverRows - 1) {
      const ay = take(M.cantileverAisleFt);
      aisleLabel(ay, M.cantileverAisleFt);
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
    // Clear of the length dimension, which is ruled at PY-18 and labelled at
    // PY-24 — a zone name at PY-30 landed on the number.
    const y = vertical ? PY - 42 : mid;
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
  // And clear of the floor the customer said is not available for rack: that
  // strip is hatched over the far end of the run and drawn after this, so a
  // dimension set from the building's end disappeared under it as soon as the
  // availability came off 100%. It is set from the end of the usable floor,
  // which is the same end whenever the whole footprint is available.
  const inset = vertical ? 4 : 14;
  const dimA = Math.min(
    (vertical ? p.buildingWidthFt : p.buildingLengthFt) - p.wallClearanceFt,
    alongStartFt + S.usableAlongFt,
  ) - inset;
  const dim = seg(dimA, 0, shC, M.sharedAisleFt);
  const tick0 = seg(dimA - 3, 6, shC, 0);
  const tick1 = seg(dimA - 3, 6, shC + M.sharedAisleFt, 0);
  const lab = box(dimA - 4, 0, midC, 0);
  over.push(
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
  const band = (cFt: number, thickFt: number, nDeep: number) => {
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
  };

  /*
   * The pallet solver slid its block to clear the columns, and the drawing has
   * to sit where it put it — the same rule the pallet-only plan follows with
   * `acrossOffsetFt`, which this walk was missing. Without it the racking was
   * drawn wherever the cursor happened to arrive, up to a full aisle out of
   * position: at a 40 ft column grid the whole zone landed 9.5 ft from where
   * the solver had it, so the plan and the count described different floors,
   * and a column the solver had tucked into a flue was drawn standing in the
   * open.
   */
  take(L.acrossOffsetFt);

  if (R.pick === 'aisle') {
    const pairs = Math.max(0, (L.rows - L.wallRows) / 2);
    for (let i = 0; i < pairs; i++) {
      const c0 = take(deep * fd * 2 + flue);
      band(c0, deep * fd, deep);
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
      band(fc + fh, deep * fd, deep);
      const ac = take(p.aisleFt);
      aisleLabel(ac, p.aisleFt);
    }
    // the far wall is a real wall, so its row is single
    if (L.wallRows > 0) {
      band(take(deep * fd), deep * fd, deep);
    }
  } else {
    const blockFt = deep * fd;
    if (R.openEnds === 2) take(p.aisleFt);
    for (let bkt = 0; bkt < L.blocks; bkt++) {
      const c0 = take(blockFt);
      band(c0, blockFt, deep);
      /*
       * The same access marks the pallet-only plan draws.
       *
       * A lane block is a lane block whatever else is on the floor: this zone
       * had none, so a drive-in strip beside a cantilever run was drawn as
       * racking nobody could get into.
       *
       * The cursor walks in from the strip's wall, so when the strip is on the
       * far wall it walks backwards and the layout's near end is this
       * drawing's far edge. The block's own ends are named in the layout's
       * terms, so the mapping is applied here rather than in what it says.
       */
      const frontSide: -1 | 1 = dir === 1 ? -1 : 1;
      if (R.openEnds === 2) {
        entry(c0, blockFt, -1);
        entry(c0, blockFt, 1);
      } else if (R.openEnds === 1) {
        entry(c0, blockFt,
          L.blockAccess[bkt] === 'back' ? (frontSide === -1 ? 1 : -1) : frontSide);
      }
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
  // Both zones' real faces count: a cantilever run and a pallet bay do not
  // divide a segment the same way, so the nearer true edge on either side of
  // the gap can come from whichever zone actually reaches furthest into it.
  const endsBeforeFt = [
    ...L.bayStartsFt.map((b) => b + L.bayLengthFt),
    ...S.runStartsFt.map((r) => r + S.runLengthFt),
  ];
  const startsAfterFt = [...L.bayStartsFt, ...S.runStartsFt];
  L.crossAisleAtFt.forEach((a, i) => {
    const centredA = centeredCrossAisleFt({
      atFt: a, widthFt: L.crossAisleWidthFt, endsBeforeFt, startsAfterFt,
    });
    // Wall to wall: a route across the floor runs the whole width, and the
    // strip of clearance along each wall is part of it.
    const r = box(alongStartFt + centredA, L.crossAisleWidthFt,
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

  // The mixed floor's own columns, not the strip's: the strip alone sees the
  // pallet zone as open floor and would call every column standing in it an
  // obstruction. `layoutMixed` judges them against both zones at once.
  {
    const cols = columnMarks({ columns: M.columns, px: PX, py: PY, sc, individually: true, keyFrom: key });
    key += cols.length;
    parts.push(...cols);
  }

    return (
      <>
        <BuildingShell px={PX} py={PY} w={W} h={H} apron={apron} font={fAnno}
          lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} vertical={vertical} />
        {parts}
        {over}
      </>
    );
  }, {
    // The back wall of the building is this drawing's floor, and it is the
    // line the elevations beside it stand their own floors on.
    floorAt: (font) => ({ y: PY + H, fraction: floorFraction(font) }),
  });

  // Both families are on this floor, so the key names both: long product on
  // cantilever arms, and pallets in racking.
  const legend: LegendItem[] = [
    {
      label: 'MATERIAL',
      swatch: <rect x={0.4} y={0.6} width={9.2} height={4.8} fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={0.8} />,
    },
    {
      label: 'RACK',
      swatch: <rect x={0.4} y={0.6} width={9.2} height={4.8} fill={FILL} stroke={G} strokeWidth={0.8} />,
    },
  ];
  // A key names what is drawn: where the pallet zone is lanes, the access marks
  // are on the plan and belong in it.
  if (R.pick === 'lane') {
    legend.push({
      label: 'TRUCK ENTRY',
      swatch: <path d="M5 0.4v5.2m0 0l-2.4 -2.4m2.4 2.4l2.4 -2.4" stroke={RED} strokeWidth={1.1} fill="none" />,
    });
  }

  return (
    <FigBoxEl aspect={fit.aspect} className={p.boxClass} head={<PlanHead lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} legend={legend} />}>
      <svg id="plan" viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Plan of a ${p.buildingLengthFt} by ${p.buildingWidthFt} foot building: a `
        + `${M.cantileverRows} row cantilever strip against the ${M.wall} wall and ${L.rows} rows `
        + `of pallet racking filling the rest, sharing a ${M.sharedAisleFt} foot aisle, running `
        + `${vertical ? 'across the width' : 'along the length'}`}>
        {fit.drawn}
      </svg>
    </FigBoxEl>
  );
}

export default memo(MixedPlan);
