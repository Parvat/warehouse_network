'use client';

import { memo } from 'react';
import {
  DOCK_APRON_FT, palletPlanGeometry, rackType,
  type Orientation, type RackKind, type RackLayout,
} from '@trace/rack-engine';
import BuildingShell, { measureShell } from './BuildingShell';
import { detailFor, simplifiedNote, type Detail } from './detail';
import { FigBoxEl, FigExpand, PlanHead, type LegendItem } from './figBox';
import {
  centeredCrossAisleFt, floorFraction, planFit, planFrameX, planFrameY, planBox, fitFigure,
  type Extent, type FigBox,
  STROKE,
} from './figText';

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
  /** Which of the row's boxes this is. */
  boxClass?: string;
  /** A control beside the expand icon in the figure's corner — the 3D view. */
  tool?: React.ReactNode;
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
      rows: layout.rows, bays: layout.bays,
      unit: kind === 'lane' ? 'lane' : 'bay',
    });
  return text ? <p className="figsimple">{text}</p> : null;
}

function PlanFigure(p: PlanFigureProps) {
  const R = rackType(p.kind);
  const L = p.layout;
  /*
   * The frame Fig. 1 is drawn in, and it does not move.
   *
   * The building used to set the shape of its own box: the longest side was
   * always NOMINAL units, so a square floor drew a square box and the whole
   * figure grew a third taller than the same sheet with a long shed on it.
   * A reader flicking between two buildings was watching the paper change size
   * rather than the building.
   *
   * So the frame is fixed and the building is fitted into it, the way an
   * elevation is fitted into the frame `elevationFrameY` gives it. A long shed
   * fills the frame across; a square floor draws smaller and square inside the
   * same frame, letterboxed either side.
   */
  const { sc, w: W, h: H, px: PX, py: PY } = planFit(p.buildingLengthFt, p.buildingWidthFt);
  // What the drawing settled on, read back once it has been fitted. Held on an
  // object rather than in a plain `let`: TypeScript does not follow an
  // assignment made inside a nested function, so a `let` still reads as its
  // initialiser out here, while a property's narrowing resets at the call.
  const drew: { detail: Detail | null } = { detail: null };
  const vertical = p.orientation === 'width';

  // Where every band, flue and lane block stands — the engine's, shared with
  // the 3D view.
  const geom = palletPlanGeometry(p.kind, L, {
    buildingLengthFt: p.buildingLengthFt, buildingWidthFt: p.buildingWidthFt,
    wallClearanceFt: p.wallClearanceFt, orientation: p.orientation,
  });

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
  });


  /* (along, across) feet from the top-left corner, mapped once */
  const at = (aPx: number, aLenPx: number, cPx: number, cLenPx: number) => (vertical
    ? { x: PX + cPx, y: PY + aPx, width: cLenPx, height: aLenPx }
    : { x: PX + aPx, y: PY + cPx, width: aLenPx, height: cLenPx });
  const box = (aFt: number, aLenFt: number, cFt: number, cLenFt: number) =>
    at(aFt * sc, aLenFt * sc, cFt * sc, cLenFt * sc);
  /**
   * A frame across a row at `bPx` along it: a divider between bays, standing a
   * unit proud of each face so it reads as the upright it is. A line rather than
   * a filled bar, so it keeps its screen weight at any size — see `STROKE`.
   */
  const frameAt = (bPx: number, cFt: number, thickFt: number) => {
    const r = at(bPx, 0, cFt * sc - 1, thickFt * sc + 2);
    return { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height };
  };

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
  const alongStartFt = p.wallClearanceFt + DOCK_APRON_FT;
  const bayStarts = L.bayStartsFt;

  const runLenFt = (bayStarts.at(-1) ?? 0) + L.bayLengthFt;

  /*
   * The run's contiguous sections — what the cross aisles break it into.
   *
   * A cross aisle is a gap the racking stops either side of, so a section is a
   * separate block of lanes: a truck reaches it from the aisle at its own end,
   * and it is entered whether or not the section beside it is. Each one is
   * marked, centred on its own width — one mark for the whole run would say
   * that the sections past the cross aisle are reached through the racking.
   */
  const segments: { a0: number; a1: number }[] = [];
  {
    let seg0 = 0;
    for (let j = 0; j <= bayStarts.length; j++) {
      const prev = bayStarts[j - 1], here = bayStarts[j];
      const breaks = here === undefined || prev === undefined
        || here - prev > L.bayLengthFt + 0.01;
      if (j > 0 && breaks) {
        segments.push({
          a0: alongStartFt + bayStarts[seg0]!,
          a1: alongStartFt + prev! + L.bayLengthFt,
        });
        seg0 = j;
      }
    }
  }

  const parts: React.ReactNode[] = [];
  let key = 0;

  /**
   * A rack band: `cFt` from the top-left across the rows, `thickFt` deep.
   *
   * It used to carry a label of its own — "wall row", "N deep" — written in
   * the margin beside it. That was a second, uncoordinated label mechanism
   * next to the aisle-width callouts, styled differently, shown in one
   * orientation only, and telling a reader nothing the stats line under the
   * drawing does not already say in every case. Removed rather than routed
   * through the shared label rule, because there is no customer decision left
   * in it once the depth is on the placard and the stats line both.
   */
  let bandIndex = 0;
  const band = (cFt: number, thickFt: number, nDeep: number) => {
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
            fill={FILL} stroke={G} strokeWidth={STROKE.rack} />);
          // the frames closing each end of the segment, which are the one thing
          // still worth a mark at this scale
          for (const k of [0, 1]) {
            const bPx = (a0 + k * lenFt) * sc;
            parts.push(<line key={key++}
              {...frameAt(bPx, cFt, thickFt)} stroke={G} strokeWidth={STROKE.divider} />);
          }
          seg0 = j;
        }
      }
      return;
    }
    for (let j = 0; j < bayStarts.length; j++) {
      const a0 = alongStartFt + bayStarts[j]!;
      parts.push(<rect key={key++} {...box(a0, L.bayLengthFt, cFt, thickFt)}
        fill={FILL} stroke={G} strokeWidth={STROKE.rack} />);
      for (let q = 1; q < nDeep; q++) {
        const l = box(a0, L.bayLengthFt, cFt + (thickFt * q) / nDeep, 0);
        parts.push(<line key={key++} x1={l.x} y1={l.y} x2={l.x + l.width} y2={l.y + l.height}
          stroke={G} strokeWidth={STROKE.divider} strokeDasharray="5 3" />);
      }
      // A frame at the end of every bay, and at the start of every bay that
      // opens a segment — the first, and the first after each cross aisle.
      const prev = bayStarts[j - 1];
      const opensSegment = prev === undefined || bayStarts[j]! - prev > L.bayLengthFt + 0.01;
      for (const k of opensSegment ? [0, 1] : [1]) {
        const bPx = (a0 + k * L.bayLengthFt) * sc;
        parts.push(<line key={key++}
          {...frameAt(bPx, cFt, thickFt)} stroke={G} strokeWidth={STROKE.divider} />);
      }
    }
  };

  /**
   * The access mark on one end of a lane block. side -1 is the block's near end
   * across the rows, +1 its far end.
   *
   * One mark per section, centred on it, at the end that is actually open. The
   * head points into the lane, which is where the truck goes: drawn the other
   * way up it reads as the racking discharging onto the aisle, which is the
   * opposite of what a drive-in does, on the one type whose whole point is that
   * the truck drives inside it.
   */
  const entry = (cFt: number, thickFt: number, side: -1 | 1) => {
    const cPx = (side < 0 ? cFt * sc - 4 : (cFt + thickFt) * sc + 4);
    // The mark stands off the block on the side it is drawn on, so inward is
    // away from that side: down from a mark above the block, up from one below.
    const inward = -side;
    for (const s of segments) {
      const o = at(((s.a0 + s.a1) / 2) * sc, 0, cPx, 0);
      parts.push(<g key={key++} transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)})`
        + (vertical ? ' rotate(-90)' : '')}>
        <path d={`M0 0v${6 * inward}m0 0l-3 ${-3 * inward}m3 ${3 * inward}l3 ${-3 * inward}`}
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
      <line key={key++} x1={PX + endA} y1={my} x2={PX + W + 4} y2={my} stroke={Y} strokeWidth={STROKE.beam} />,
      <text key={key++} x={PX + W + 6} y={my + 3}
        fontFamily="JetBrains Mono" fontSize={fAnno} fill="#B08F52">FLUE {p.flueIn}&#34;</text>,
    );
    ext.text({ x: PX + W + 6, y: my + 3, size: fAnno, text: `FLUE ${p.flueIn}"` });
  };

  // No width on each aisle: one label per gap repeated the same figure down
  // the plan and crowded the rows on a big floor. The width is said once, in
  // the run summary under the sheet.

  // Every band, flue and lane block where the engine placed it — the same
  // geometry the 3D view stands its racking on, so the two cannot disagree.
  const Z = geom.pallets!;
  if (R.pick === 'aisle') {
    for (const b of Z.bands) band(b.cFt, b.depthFt, b.deep);
    // A flue is the gap between the two rows of a back-to-back pair, drawn at
    // least a hairline wide so it reads at any scale, centred on where it is.
    if (flue > 0 && d.bays) {
      for (const f of Z.flues) {
        const fh = Math.max(1.4 / sc, f.depthFt);
        const fc = f.cFt + (f.depthFt - fh) / 2;
        for (const bs of bayStarts) {
          parts.push(<rect key={key++} {...box(alongStartFt + bs, L.bayLengthFt, fc, fh)} fill={Y} />);
        }
        flueCallout(fc, fh);
      }
    }
  } else {
    Z.bands.forEach((b) => {
      band(b.cFt, b.depthFt, 1);
      for (let dd = 1; dd < b.deep; dd++) {
        const dc = b.cFt + (b.depthFt * dd) / b.deep;
        // Per bay, not across the whole block: a lane's depth divisions are
        // part of the racking and stop where the racking stops.
        for (const bs of bayStarts) {
          const l = box(alongStartFt + bs, L.bayLengthFt, dc, 0);
          parts.push(<line key={key++} x1={l.x} y1={l.y} x2={l.x + l.width} y2={l.y + l.height}
            stroke={G} strokeWidth={STROKE.divider} strokeDasharray="4 3" />);
        }
      }
      // Where this block is worked from, as the layout says it is — read off
      // the geometry, never worked out from which side the wall is on.
      for (const end of b.openEnds) entry(b.cFt, b.depthFt, end === 'near' ? -1 : 1);
    });
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
     bay starts above already carry the break.

     The solver's own `a` is flush against the segment that follows — that is
     what its arithmetic needs, not what a reader sees. A segment rarely
     divides evenly into whole bays, so its last one often falls short of
     that edge, and the true gap is centred here instead: same width, equal
     floor either side of it. */
  const bayEndsFt = bayStarts.map((b) => b + L.bayLengthFt);
  L.crossAisleAtFt.forEach((a, i) => {
    const centredA = centeredCrossAisleFt({
      atFt: a, widthFt: L.crossAisleWidthFt, endsBeforeFt: bayEndsFt, startsAfterFt: bayStarts,
    });
    // Wall to wall: a route across the floor runs the whole width, and the
    // strip of clearance along each wall is part of it.
    const r = box(alongStartFt + centredA, L.crossAisleWidthFt,
      0, vertical ? p.buildingLengthFt : p.buildingWidthFt);
    parts.push(<rect key={key++} {...r} fill="#fff" stroke={BLUE}
      strokeWidth={STROKE.dash} strokeDasharray="3 2" />);
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

  if (p.gridLabel) {
    ext.text({ x: PX + W, y: PY - 6, size: fAnno, text: p.gridLabel, anchor: 'end' });
    parts.push(<text key={key++} x={PX + W} y={PY - 6} textAnchor="end"
      fontFamily="JetBrains Mono" fontSize={fAnno} fill={BLUE}>{p.gridLabel}</text>);
  }

    drew.detail = d;
    return (
      <>
        <BuildingShell px={PX} py={PY} w={W} h={H} apron={apron} font={fAnno}
          lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} vertical={vertical} />
        {parts}
      </>
    );
  }, {
    /*
     * The frame, held open whatever is drawn in it.
     *
     * Fitted to its contents the box would still follow the building: a square
     * floor puts its dimension lines and its margin labels in different places
     * from a long one, and the box would close around them. Locked, the box is
     * the frame plus the room its callouts need — the width dimension standing
     * off the left wall, the length dimension over the top, the row labels down
     * the right — measured from the frame rather than from the building.
     */
    lockX: planFrameX,
    lockY: planFrameY,
    // The back wall of the building is this drawing's floor, and it is the
    // line the elevations beside it stand their own floors on. Held as well as
    // locked: if anything ever outgrows the frame above, the floor still lands.
    floorAt: (font) => ({ y: PY + H, fraction: floorFraction(font) }),
  });

  // The key to the drawing, above it now rather than below it. What it lists is
  // what was actually drawn: a flue swatch says nothing on a plan simplified
  // past the point of drawing flues.
  const flueFt = R.pick === 'lane' ? 0 : p.flueIn / 12;
  const legend: LegendItem[] = [{
    label: 'RACK',
    swatch: <rect x={0.4} y={0.6} width={9.2} height={4.8} fill={FILL} stroke={G} strokeWidth={0.8} />,
  }];
  if (R.pick === 'lane') {
    legend.push({
      label: 'TRUCK ENTRY',
      swatch: <path d="M5 0.4v5.2m0 0l-2.4 -2.4m2.4 2.4l2.4 -2.4" stroke={RED} strokeWidth={1.1} fill="none" />,
    });
  } else if (flueFt > 0 && drew.detail?.bays) {
    legend.push({ label: 'FLUE', swatch: <rect x={0.4} y={0.6} width={9.2} height={4.8} fill={Y} /> });
  }

  /*
   * The whole building, fitted to the figure, at whatever scale that comes to.
   *
   * No scrollbar and nothing left out: a plan is read as one shape, and a
   * drawing you have to push around to see the end of is a worse answer to a
   * big building than a small drawing of all of it. What keeps it legible at
   * size is that a bay is a fixed thing drawn at the plan's scale, so a bigger
   * building holds more bays rather than smaller ones — and the expanded view
   * is there when the whole of it is wanted larger.
   */
  return (
    <FigBoxEl aspect={fit.aspect} className={p.boxClass} head={<PlanHead lengthFt={p.buildingLengthFt} widthFt={p.buildingWidthFt} legend={legend} />}
      foot={<><SimplifiedNote detail={drew.detail} layout={L} kind={R.pick === 'lane' ? 'lane' : 'bay'} />{p.foot}</>}
      info={(
        <>
        {p.tool}
        <FigExpand label={`Plan — ${p.buildingLengthFt} × ${p.buildingWidthFt} ft`}
          viewBox={fit.viewBox} aspect={fit.aspect} refit={fit.refit}>
          {fit.drawn}
        </FigExpand>
        </>
      )}>
    <div className="planfit">
    <svg id="plan" viewBox={fit.viewBox}
        style={{ aspectRatio: String(fit.aspect) }}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label={
        `Plan of a ${p.buildingLengthFt} by ${p.buildingWidthFt} foot building holding `
        + `${L.rows} rows of ${L.bays} bays, running `
        + `${vertical ? 'across the width' : 'along the length'}`}>
      {fit.drawn}
    </svg>
    </div>
    </FigBoxEl>
  );
}

export default memo(PlanFigure);
