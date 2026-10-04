'use client';

import { memo } from 'react';
import { DOCK_DOORS } from '@trace/rack-engine';
import { BUILDING_DIM_SCALE, FIG_TEXT, MONO, STROKE, type Extent } from './figText';

/**
 * The building, in plan. Shared by all three Fig. 1 drawings so they cannot
 * disagree about the box the racking sits in.
 *
 * **The building never rotates.** Length is drawn horizontally and width
 * vertically whatever ROWS RUN says, and so are the dimension lines. What turns
 * is the racking inside.
 *
 * The one thing that does follow the racking is the dock apron, and it has to:
 * the solver takes `DOCK_APRON_FT` off the axis the rows run down, so when the
 * rows turn, the strip it reserves turns with them. Drawing the doors on the
 * left in both orientations would park a row of racking in the apron — the
 * clear space in front of the doors — which is the one thing that strip exists
 * to prevent. Doors and staging therefore sit on the wall the rows run away
 * from: the left wall for rows along the length, the top wall for rows across
 * the width.
 */

const Y = '#F2C230', MUT = '#6B726C', BLUE = '#1B4FD8', INK = '#1A1D1B';

/** Where the dock doors stand on their wall — the engine's, so the 3D doors agree. */
const DOCKS = DOCK_DOORS.starts;
const DOCK_LEN = DOCK_DOORS.length;
const STAGING = 'STAGING';

/**
 * Where STAGING goes along the dock wall, in screen units from the wall's
 * start — or null where no gap between the doors will hold it.
 *
 * Centred in the largest gap between the doors rather than on the wall: the
 * middle door is centred on the wall, so the midpoint put the word on it the
 * moment the apron was too narrow to hold the word clear of the wall. Where no
 * gap is long enough, the word is left off; the dashed line still says where
 * the apron ends, and a label on a door would say less than none.
 */
function stagingAt(spanPx: number, font: number): number | null {
  const edges = [0, ...DOCKS.flatMap((d) => [d, d + DOCK_LEN]), 1];
  let best = { from: 0, len: -1 };
  for (let i = 0; i < edges.length; i += 2) {
    const len = (edges[i + 1]! - edges[i]!) * spanPx;
    if (len > best.len + 1e-6) best = { from: edges[i]! * spanPx, len };
  }
  // The word's length along the wall, and 2 px of air at each end. `font` is
  // the size that lands at FIG_TEXT.anno screen pixels, so that is the scale
  // the air is taken in — the scale the drawing is actually shown at, inline
  // or expanded.
  const needPx = STAGING.length * font * MONO.advance + (4 * font) / FIG_TEXT.anno;
  return best.len >= needPx ? best.from + best.len / 2 : null;
}

export interface BuildingShellProps {
  px: number; py: number;
  /** Screen size of the building box — length across, width down. */
  w: number; h: number;
  lengthFt: number;
  widthFt: number;
  /** Dock apron, in screen units. */
  apron: number;
  /** True where the rows run across the width. */
  vertical: boolean;
  /** The sheet's one annotation size, in this drawing's viewBox units. */
  font: number;
}

/**
 * What the shell covers, measured without drawing it.
 *
 * The shell puts down the outermost marks on a plan — the two dimension lines
 * and the labels standing off them — so a viewBox fitted to the drawing has to
 * account for them. It cannot do that from inside the component: writing the
 * element does not run it, and by the time React does the box is long settled.
 * So the caller measures, in the same pass it draws.
 */
export function measureShell(ext: Extent, a: {
  px: number; py: number; w: number; h: number;
  lengthFt: number; widthFt: number; vertical: boolean; font: number;
}): void {
  ext.add(a.px, a.py, a.w, a.h);
  // the dock marks stand proud of the wall they are on
  if (a.vertical) ext.add(a.px, a.py - 4, a.w, 4); else ext.add(a.px - 4, a.py, 4, a.h);
  ext.add(a.px, a.py - 18, a.w, 0);
  ext.text({
    x: a.px + a.w / 2, y: a.py - 24, size: a.font * BUILDING_DIM_SCALE,
    text: `${a.lengthFt}'-0"`, anchor: 'middle',
  });
  ext.add(a.px - 20, a.py, 0, a.h);
  ext.text({
    x: a.px - 26, y: a.py + a.h / 2, size: a.font * BUILDING_DIM_SCALE,
    text: `${a.widthFt}'-0"`, anchor: 'middle', rotate: -90,
  });
}

function BuildingShell({
  px, py, w, h, lengthFt, widthFt, apron, vertical, font,
}: BuildingShellProps) {
  const staging = stagingAt(vertical ? w : h, font);
  return (
    <>
      {/* The floor. Named like the docks are, because it is the one shape a
          label is meant to be standing on: everything drawn on this plan
          overlaps it by definition, so anything checking a label for clashes
          has to be able to tell it apart from an obstruction. */}
      <rect data-part="floor" x={px} y={py} width={w} height={h} fill="#fff" stroke={INK} strokeWidth={STROKE.wall} />

      {vertical ? (
        <>
          <line x1={px} y1={py + apron} x2={px + w} y2={py + apron}
            stroke="#BFBBB0" strokeWidth={STROKE.dash} strokeDasharray="4 3" />
          {DOCKS.map((d) => (
            <rect key={d} data-part="dock" x={px + w * d} y={py - 4} width={w * DOCK_LEN} height={5} fill={Y} />
          ))}
          {staging !== null && (
            <text x={px + staging} y={py + apron / 2 + 3} textAnchor="middle"
              fontFamily="JetBrains Mono" fontSize={font} fill={MUT}>{STAGING}</text>
          )}
        </>
      ) : (
        <>
          <line x1={px + apron} y1={py} x2={px + apron} y2={py + h}
            stroke="#BFBBB0" strokeWidth={STROKE.dash} strokeDasharray="4 3" />
          {DOCKS.map((d) => (
            <rect key={d} data-part="dock" x={px - 4} y={py + h * d} width={5} height={h * DOCK_LEN} fill={Y} />
          ))}
          {staging !== null && (
            <text transform={`translate(${(px + apron / 2).toFixed(1)},${(py + staging).toFixed(1)}) rotate(-90)`}
              textAnchor="middle" fontFamily="JetBrains Mono" fontSize={font} fill={MUT}>{STAGING}</text>
          )}
        </>
      )}

      <line x1={px} y1={py - 18} x2={px + w} y2={py - 18} stroke={BLUE} strokeWidth={STROKE.dim} />
      <text x={px + w / 2} y={py - 24} textAnchor="middle" fontFamily="JetBrains Mono"
        fontSize={font * BUILDING_DIM_SCALE} fill={BLUE}>{lengthFt}&#8242;-0&#34;</text>
      <line x1={px - 20} y1={py} x2={px - 20} y2={py + h} stroke={BLUE} strokeWidth={STROKE.dim} />
      <text transform={`translate(${px - 26},${(py + h / 2).toFixed(1)}) rotate(-90)`} textAnchor="middle"
        fontFamily="JetBrains Mono" fontSize={font * BUILDING_DIM_SCALE} fill={BLUE}>{widthFt}&#8242;-0&#34;</text>
    </>
  );
}

export default memo(BuildingShell);
