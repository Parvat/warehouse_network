'use client';

import { memo } from 'react';
import {
  DOCK_APRON_FT, mixedPlanGeometry, rackType,
  type GeomCantRow, type MixedLayout, type Orientation, type RackKind,
} from '@trace/rack-engine';
import BuildingShell, { measureShell } from './BuildingShell';
import { FigBoxEl, FigExpand, PlanHead, accessLegend, type LegendItem } from './figBox';
import {
  centeredCrossAisleFt, floorFraction, planFit, planFrameX, planFrameY, planBox, fitFigure,
  type Extent, type FigBox,
  FIG_TEXT, STROKE, TOWER_MARK_PX,
} from './figText';

/**
 * Fig. 1 for a mixed floor: a cantilever strip against one wall and pallet
 * racking filling the rest, drawn in one plan.
 *
 * Both families keep the language they already have — kraft material and tower
 * ticks for the strip, pale bands with bay ticks and a yellow flue for the
 * racking — because the reader has to see two systems, not one hybrid.
 *
 * Everything here is placed from the engine's geometry for this floor, walked in
 * from the strip's wall, so the two zones cannot drift apart: the strip's rows,
 * its own aisles, the shared aisle and then the pallet bands all come off the
 * same placement the engine used to divide the width — and that the 3D view
 * stands its racking on.
 */

const G = '#14392B', ARM = '#1D5340', FILL = '#E8EFEA',
      MUT = '#6B726C', BLUE = '#1B4FD8', RED = '#A8341C', Y = '#F2C230',
      KRAFT = '#E8DCC2', KRAFT_EDGE = '#B08F52';

export interface MixedPlanProps {
  /** Which of the row's boxes this is. */
  boxClass?: string;
  /** A control beside the expand icon in the figure's corner — the 3D view. */
  tool?: React.ReactNode;
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
  // Fig. 1 is drawn in a fixed frame and the building is fitted into it, so
  // its box is one shape whatever is on the floor. See `planFit`.
  const { sc, w: W, h: H, px: PX, py: PY } = planFit(p.buildingLengthFt, p.buildingWidthFt);

  // The building never turns: length across the page, width down it. Only the
  // racking turns, so everything inside the walls is laid out in (along,
  // across) feet and mapped once.
  //
  // The scale is internal and only that: the building's longest side is always
  // this many units, so the margins and the labels carry the same weight in a
  // 400 x 100 shed as in a square one. The viewBox is fitted afterwards.
  const vertical = p.orientation === 'width';
  const apron = DOCK_APRON_FT * sc;
  // Where every row, aisle and band on this floor stands — the engine's,
  // shared with the 3D view.
  const geom = mixedPlanGeometry(p.kind, M, {
    buildingLengthFt: p.buildingLengthFt, buildingWidthFt: p.buildingWidthFt,
    wallClearanceFt: p.wallClearanceFt, orientation: p.orientation,
  });

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
  // A tower as its column section: a slim post, the same size on screen inline
  // and expanded, in proportion to the arms — see TOWER_MARK_PX.
  const towerMark = (tA: number, colC: number) => {
    const u = fAnno / FIG_TEXT.anno, w = TOWER_MARK_PX.along * u, d = TOWER_MARK_PX.across * u;
    return at(tA * sc - w / 2, w, colC * sc - d / 2, d);
  };
  /**
   * A frame across a row at `bPx` along it: a divider between bays, standing a
   * unit proud of each face so it reads as the upright it is. A line rather than
   * a filled bar, so it keeps its screen weight at any size — see `STROKE`.
   */
  const frameAt = (bPx: number, cFt: number, thickFt: number) => {
    const r = at(bPx, 0, cFt * sc - 1, thickFt * sc + 2);
    return { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height };
  };
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
  // The sections of the run between cross aisles, along: one mark each.
  const sections: { a0: number; a1: number }[] = [];
  {
    let seg0 = 0;
    const starts = L.bayStartsFt;
    for (let j = 1; j <= starts.length; j++) {
      const prev = starts[j - 1]!, here = starts[j];
      if (here === undefined || here - prev > L.bayLengthFt + 0.01) {
        sections.push({ a0: alongStartFt + starts[seg0]!, a1: alongStartFt + prev + L.bayLengthFt });
        seg0 = j;
      }
    }
  }

  const entry = (cFt: number, thickFt: number, side: -1 | 1) => {
    const cPx = (side < 0 ? cFt * sc - 4 : (cFt + thickFt) * sc + 4);
    const inward = -side;
    for (const s of sections) {
      const o = at(((s.a0 + s.a1) / 2) * sc, 0, cPx, 0);
      parts.push(<g key={key++} transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)})`
        + (vertical ? ' rotate(-90)' : '')}>
        <path d={`M0 0v${6 * inward}m0 0l-3 ${-3 * inward}m3 ${3 * inward}l3 ${-3 * inward}`}
          stroke={RED} strokeWidth={1.1} fill="none" />
      </g>);
    }
  };

  /**
   * The way a flow lane runs, as the pallet-only plan draws it: a ring at the
   * load end, the head at the pick end, inside the block. `load` -1 is the
   * block's near end across the rows, +1 its far end.
   */
  const flowMark = (cFt: number, thickFt: number, load: -1 | 1) => {
    const inset = Math.min(3, (thickFt * sc) / 4);
    const loadPx = load < 0 ? cFt * sc + inset : (cFt + thickFt) * sc - inset;
    const pickPx = load < 0 ? (cFt + thickFt) * sc - inset : cFt * sc + inset;
    for (const s of sections) {
      const aPx = ((s.a0 + s.a1) / 2) * sc;
      const p0 = at(aPx, 0, loadPx, 0), p1 = at(aPx, 0, pickPx, 0);
      const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const head = `M${(p1.x - ux * 3 - uy * 2.4).toFixed(1)} ${(p1.y - uy * 3 + ux * 2.4).toFixed(1)}`
        + `L${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
        + `L${(p1.x - ux * 3 + uy * 2.4).toFixed(1)} ${(p1.y - uy * 3 - ux * 2.4).toFixed(1)}`;
      parts.push(<g key={key++} stroke={RED} strokeWidth={1.1} fill="none">
        <circle cx={p0.x.toFixed(1)} cy={p0.y.toFixed(1)} r={1.6} />
        <line x1={(p0.x + ux * 1.6).toFixed(1)} y1={(p0.y + uy * 1.6).toFixed(1)} x2={p1.x.toFixed(1)} y2={p1.y.toFixed(1)} />
        <path d={head} />
      </g>);
    }
  };

  /* Every row, the aisle they share and every pallet band come from the
     engine's geometry for this floor — walked in from the strip's wall, and
     the same placement the 3D view stands its racking on. The strip stays on
     the side the customer chose whichever way the rows run — 'top' is the start
     of that axis, which is the top wall for rows along the length and the left
     wall for rows across it. */
  const dir = M.wall === 'top' ? 1 : -1;
  const acrossEndFt = (vertical ? p.buildingLengthFt : p.buildingWidthFt) - p.wallClearanceFt;
  // No width on each aisle — the run summary says it once for the floor.

  /* ── the strip ───────────────────────────────────────────────────────── */

  // A wall row is reached only from the aisle, so its column sits on the wall
  // side and its arms face in; an interior row is armed both ways.
  const cantRow = (row: GeomCantRow) => {
    const colC = row.colCFt, armC0 = row.armFromCFt, armC1 = row.armToCFt;

    // Only the runs this row carries — see the cantilever plan for why.
    const runsHere = row.runs;
    for (let run = 0; run < runsHere; run++) {
      const runA = alongStartFt + (S.runStartsFt[run] ?? 0);
      const towerA = runA + S.overhangFt;
      parts.push(<rect key={key++} {...box(runA, S.runLengthFt, armC0, armC1 - armC0)}
        fill={KRAFT} stroke={KRAFT_EDGE} strokeWidth={0.7} opacity={0.55} />);
      for (let t = 0; t < S.towersPerRun; t++) {
        const tA = towerA + t * S.towerCentresFt;
        parts.push(
          <line key={key++} {...seg(tA, 0, armC0, armC1 - armC0)} stroke={ARM} strokeWidth={STROKE.beam} />,
          <rect key={key++} {...towerMark(tA, colC)} fill={G} />,
        );
      }
      parts.push(<line key={key++} {...seg(towerA, S.spanFt, colC, 0)} stroke={G} strokeWidth={STROKE.rack} />);
    }
    // No per-row label: "2 sides" used to be called out here, in the margin
    // past the wall, and a run of many interior rows put one there for every
    // row — the same margin cost that moved aisle labels inside, just never
    // fixed for this one. Removed rather than moved: which rows are armed
    // from both sides is already on the placard ("Sides armed"), and there is
    // no gap here the way an aisle is one, so there is nowhere inside a row's
    // own band to put it without sitting on the arms.
  };

  geom.cantilever!.rows.forEach(cantRow);

  /* ── the aisle they share ────────────────────────────────────────────── */

  const shC = geom.sharedAisle!.cFt;
  const midC = shC + M.sharedAisleFt / 2;
  const divider = seg(0, vertical ? p.buildingWidthFt : p.buildingLengthFt, midC, 0);
  const near = box(alongStartFt, 0, midC, 0);
  parts.push(
    <line key={key++} x1={divider.x1} y1={divider.y1} x2={divider.x2} y2={divider.y2}
      stroke={RED} strokeWidth={STROKE.dash} strokeDasharray="2 3" opacity={0.75} />,
  );
  // The strip is on the wall the layout put it on; the pallet zone is the
  // rest, and the shared aisle's centre is the line between them. The zones
  // are not named in the margin: the legend's swatches already tell them apart,
  // and on a long building the names ran into STAGING.
  const stripC = dir === 1 ? [p.wallClearanceFt, midC] : [midC, acrossEndFt];
  const palletC = dir === 1 ? [midC, acrossEndFt] : [p.wallClearanceFt, midC];

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
    // the shorter zone's end: past it, one side of the shared aisle is hatched
    alongStartFt + Math.min(S.usableAlongFt, L.usableAlongFt),
  ) - inset;
  const dim = seg(dimA, 0, shC, M.sharedAisleFt);
  const tick0 = seg(dimA - 3, 6, shC, 0);
  const tick1 = seg(dimA - 3, 6, shC + M.sharedAisleFt, 0);
  const lab = box(dimA - 4, 0, midC, 0);
  over.push(
    <line key={key++} x1={dim.x1} y1={dim.y1} x2={dim.x2} y2={dim.y2} stroke={BLUE} strokeWidth={STROKE.dim} />,
    <line key={key++} x1={tick0.x1} y1={tick0.y1} x2={tick0.x2} y2={tick0.y2} stroke={BLUE} strokeWidth={STROKE.dim} />,
    <line key={key++} x1={tick1.x1} y1={tick1.y1} x2={tick1.x2} y2={tick1.y2} stroke={BLUE} strokeWidth={STROKE.dim} />,
    vertical
      ? <text key={key++} transform={`translate(${(lab.x - 4).toFixed(1)} ${lab.y.toFixed(1)}) rotate(-90)`}
          textAnchor="start" fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>
          SHARED AISLE {M.sharedAisleFt}&#8242;-0&#34;</text>
      : <text key={key++} x={lab.x} y={lab.y - 4} textAnchor="end"
          fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>
          SHARED AISLE {M.sharedAisleFt}&#8242;-0&#34;</text>,
  );

  /* ── the pallet racking ──────────────────────────────────────────────── */

  const flue = R.pick === 'lane' ? 0 : p.flueIn / 12;

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
        fill={FILL} stroke={G} strokeWidth={STROKE.rack} />);
      for (let q = 1; q < nDeep; q++) {
        const l = seg(a0, L.bayLengthFt, cFt + (thickFt * q) / nDeep, 0);
        parts.push(<line key={key++} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={G} strokeWidth={STROKE.divider} strokeDasharray="5 3" />);
      }
      // A frame at the end of every bay, and at the start of every bay that
      // opens a segment — the first, and the first after each cross aisle.
      const j = L.bayStartsFt.indexOf(bs), prev = L.bayStartsFt[j - 1];
      const opensSegment = prev === undefined || bs - prev > L.bayLengthFt + 0.01;
      for (const k of opensSegment ? [0, 1] : [1]) {
        const bPx = (a0 + k * L.bayLengthFt) * sc;
        parts.push(<line key={key++}
          {...frameAt(bPx, cFt, thickFt)} stroke={G} strokeWidth={STROKE.divider} />);
      }
    }
  };

  /*
   * Every band, flue and lane block where the pallet solver put it, including
   * the slide it took to clear the columns — the geometry carries that offset,
   * so the zone cannot land a whole aisle out of position the way a cursor
   * that forgot it once did.
   */
  const Z = geom.pallets!;
  for (const b of Z.bands) {
    band(b.cFt, b.depthFt, b.deep);
    // The same access marks the pallet-only plan draws: a lane block is a
    // lane block whatever else is on the floor. The geometry has already
    // turned the layout's front and back into this floor's near and far.
    for (const end of b.openEnds) entry(b.cFt, b.depthFt, end === 'near' ? -1 : 1);
    if (b.flow) flowMark(b.cFt, b.depthFt, b.flow.load === 'near' ? -1 : 1);
    // push-back is loaded and picked from its aisle face — here, the first
    // rows' face is the aisle they share with the strip
    if (b.face) entry(b.cFt, b.depthFt, b.face === 'near' ? -1 : 1);
  }
  // A flue is the gap between the two rows of a back-to-back pair, so it
  // exists exactly where those rows exist — per bay, never through a cross
  // aisle — drawn at least a hairline wide, centred on where it is.
  if (flue > 0) {
    for (const fl of Z.flues) {
      const fh = Math.max(1.4 / sc, fl.depthFt);
      const fc = fl.cFt + (fl.depthFt - fh) / 2;
      for (const bs of L.bayStartsFt) {
        parts.push(<rect key={key++} {...box(alongStartFt + bs, L.bayLengthFt, fc, fh)}
          fill={Y} />);
      }
    }
  }

  /* the floor the customer said is not available, and the circulation that
     comes off the run — both are already out of the count, so they are drawn.

     Per zone, from where each zone's own racking has to stop. With the floor
     given as an area, the pallet zone is narrower than the building and so
     runs further along it than the strip does; one hatch from the strip's end
     across the whole floor painted over the pallet rows that were really
     there. The lengths are the engine's, one for each zone. */
  const hatch = (fromFt: number, lenFt: number, c0: number, c1: number, label: boolean) => {
    if (lenFt <= 0.01 || c1 - c0 <= 0.01) return;
    const u = box(alongStartFt + fromFt, lenFt, c0, c1 - c0);
    parts.push(<rect key={key++} {...u} fill="#EFEDE6" stroke="#CFCabd" strokeWidth={0.8} />);
    for (let d = -u.height; d < u.width; d += 7) {
      const x1 = Math.max(u.x, u.x + d), y1 = Math.max(u.y, u.y - d);
      const x2 = Math.min(u.x + u.width, u.x + d + u.height);
      if (x2 > x1) {
        parts.push(<line key={key++} x1={x1} y1={y1} x2={x2} y2={y1 + (x2 - x1)}
          stroke="#CFCabd" strokeWidth={0.6} />);
      }
    }
    // Named once, on the wider band; the narrow strip band reads by its hatch.
    if (label) {
      parts.push(<text key={key++} x={u.x + u.width / 2} y={u.y + u.height / 2 + 3}
        textAnchor="middle" fontFamily="JetBrains Mono" fontSize={fAnno} fill={MUT}
        transform={vertical ? undefined
          : `rotate(-90 ${(u.x + u.width / 2).toFixed(1)} ${(u.y + u.height / 2).toFixed(1)})`}>
        NOT AVAILABLE FOR RACK</text>);
    }
  };
  // Each zone's band is the one its label spans, so the two hatches meet on
  // the shared aisle's centre line, where the drawing already divides them.
  const stripWide = stripC[1]! - stripC[0]! > palletC[1]! - palletC[0]!;
  hatch(S.usableAlongFt, S.unavailableAlongFt, stripC[0]!, stripC[1]!, stripWide);
  hatch(L.usableAlongFt, L.unavailableAlongFt, palletC[0]!, palletC[1]!, !stripWide);

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
    // strip of clearance along each wall is part of it. An aisle past the
    // shorter zone's end does not reach that zone — the engine says so by
    // where the zone stops — so it runs only from the other zone's wall to the
    // line between them, rather than across floor that is not racked.
    const wallFt = vertical ? p.buildingLengthFt : p.buildingWidthFt;
    const inStrip = a < S.usableAlongFt, inPallets = a < L.usableAlongFt;
    const stripSide: [number, number] = dir === 1 ? [0, midC] : [midC, wallFt];
    const palletSide: [number, number] = dir === 1 ? [midC, wallFt] : [0, midC];
    const [c0, c1] = inStrip && inPallets ? [0, wallFt] : inStrip ? stripSide : palletSide;
    const r = box(alongStartFt + centredA, L.crossAisleWidthFt, c0, c1 - c0);
    parts.push(<rect key={key++} {...r} fill="#fff" stroke={BLUE} strokeWidth={STROKE.dash}
      strokeDasharray="3 2" />);
    if (i === 0) {
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      parts.push(<text key={key++} x={cx} y={cy} textAnchor="middle"
        transform={vertical ? undefined : `rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})`}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>
        CROSS AISLE {L.crossAisleWidthFt}&#8242;-0&#34;</text>);
    }
  });


    return (
      <>
        <BuildingShell px={PX} py={PY} w={W} h={H} apron={apron} font={fAnno}
          lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} vertical={vertical} />
        {parts}
        {over}
      </>
    );
  }, {
    lockX: planFrameX,
    lockY: planFrameY,
    // Held as well as locked: if anything ever outgrows the frame above,
    // the back wall still lands on the line the elevations stand on.
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
  // A key names what is drawn: where the pallet zone is reached through its
  // lanes or from a face, the access marks are on the plan and belong in it.
  const access = accessLegend(geom.pallets?.access);
  if (access) legend.push(access);

  return (
    <FigBoxEl aspect={fit.aspect} className={p.boxClass} head={<PlanHead lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} legend={legend} />}
      info={(
        <>
        {p.tool}
        <FigExpand label={`Plan — ${p.buildingLengthFt} × ${p.buildingWidthFt} ft`}
          viewBox={fit.viewBox} aspect={fit.aspect} refit={fit.refit}>
          {fit.drawn}
        </FigExpand>
        </>
      )}>
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
