import { CANTILEVER_COLUMN_IN, COLUMN_WIDTH_IN } from './constants.js';
import {
  DOCK_DOORS,
  type CantileverHeights, type GeomCantZone, type GeomPalletZone, type PalletHeights, type PlanGeometry,
} from './plangeometry.js';
import { rackType } from './racktypes.js';

/**
 * The warehouse as boxes, for the 3D view.
 *
 * Every part is placed from the plan geometry — the same bands, bays, runs,
 * column lines and arm sides the plan figures draw — and the heights the
 * elevations draw, so the 3D view is the plan stood up rather than a second
 * layout. It is pure: no renderer, no DOM. The view only turns each list into
 * one instanced mesh.
 *
 * World axes: x along the building's length, z along its width, y up, origin
 * at the centre of the floor, all in feet. Each box is eight numbers —
 * centre x, y, z, size x, y, z, and a small tilt about x and about z.
 */
export const BOX_STRIDE = 8;

export type Part3D =
  | 'upright' | 'beam' | 'rail' | 'pallet' | 'under'
  | 'column' | 'arm' | 'base' | 'brace' | 'steel' | 'lumber'
  | 'dock' | 'staging';

export const PARTS_3D: readonly Part3D[] = [
  'upright', 'beam', 'rail', 'pallet', 'under',
  'column', 'arm', 'base', 'brace', 'steel', 'lumber', 'dock', 'staging',
];

export interface Scene3D {
  lengthFt: number;
  widthFt: number;
  clearHeightFt: number;
  /**
   * How much of a pallet box, from the bottom, is the skid. A pallet and the
   * skid under it are one box — half the instances on a big floor — and the
   * view shades its lower part as the skid.
   */
  palletSkidFraction: number;
  /** Boxes per part, BOX_STRIDE numbers each. */
  parts: Record<Part3D, number[]>;
}

/** Section sizes of the parts the solver does not size, ft. */
const UPRIGHT_FT = COLUMN_WIDTH_IN / 12;
const BEAM_THICK_FT = 0.15;
const RAIL_FT = 0.2;
const SKID_FT = 0.45;
const COLUMN_FT = CANTILEVER_COLUMN_IN / 12;
const ARM_FT = 0.35;
const BRACE_FT = 0.22;
const BUNDLE_FT = 0.9;
/** How far an arm rises towards its tip, radians — the slope that keeps stock on. */
export const ARM_TILT = 0.035;

export function warehouseScene(g: PlanGeometry, opts: {
  clearHeightFt: number;
  pallet?: PalletHeights;
  cantilever?: CantileverHeights;
}): Scene3D {
  const parts = Object.fromEntries(PARTS_3D.map((p) => [p, [] as number[]])) as Record<Part3D, number[]>;
  const BL = g.buildingLengthFt, BW = g.buildingWidthFt;
  const alongIsLength = g.orientation === 'length';

  /**
   * A box placed in plan terms: centre along `a` and across `c`, sized `sa`
   * along and `sc` across. `tilt` turns it about the along axis, so that an
   * arm reaching across rises towards its tip.
   */
  const put = (part: Part3D, a: number, y: number, c: number, sa: number, sy: number, sc: number, tilt = 0) => {
    const lx = alongIsLength ? a : c, wz = alongIsLength ? c : a;
    parts[part].push(
      lx - BL / 2, y, wz - BW / 2,
      alongIsLength ? sa : sc, sy, alongIsLength ? sc : sa,
      // about x when across runs along z; about z when it runs along x — signed
      // so a positive tilt lifts the end that points to higher c
      alongIsLength ? -tilt : 0, alongIsLength ? 0 : tilt,
    );
  };

  /* the building: doors on the wall the rows run away from, staging inside */
  const doorH = Math.min(14, opts.clearHeightFt * 0.5);
  for (const s of DOCK_DOORS.starts) {
    const c = g.acrossFt * (s + DOCK_DOORS.length / 2);
    put('dock', -0.2, doorH / 2, c, 1.2, doorH, g.acrossFt * DOCK_DOORS.length);
  }
  put('staging', g.dockApronFt / 2 + 0.5, 0.03, g.acrossFt / 2, g.dockApronFt - 1, 0.02, g.acrossFt - 2);

  if (g.pallets && opts.pallet) palletZone(g.pallets, opts.pallet);
  if (g.cantilever && opts.cantilever) cantZone(g.cantilever, opts.cantilever);

  const loadFt = Math.max(SKID_FT + 0.5, opts.pallet?.loadHeightFt ?? 0);
  return {
    lengthFt: BL, widthFt: BW, clearHeightFt: opts.clearHeightFt,
    palletSkidFraction: SKID_FT / loadFt, parts,
  };

  function palletZone(Z: GeomPalletZone, h: PalletHeights) {
    const R = rackType(Z.kind);
    // Push-back, drive-in, drive-through and flow keep their pallets on rails
    // down the lane; only a selective or double-deep bay has a beam across it.
    const lanes = R.pick === 'lane' || Z.kind === 'pushback';
    const bl = Z.bayLengthFt;
    const n = Math.max(1, Z.palletsAcross);
    const pw = Math.min(h.palletWidthFt, (bl - UPRIGHT_FT) / n - 0.15);
    const gap = (bl - UPRIGHT_FT - n * pw) / (n + 1);
    // Bay boundaries: each bay's two ends, shared between neighbours.
    const ends = [...new Set(Z.bayStartsFt.flatMap((a) => [a, a + bl]).map((a) => +a.toFixed(3)))];

    for (const band of Z.bands) {
      const deep = Math.max(1, band.deep);
      const step = band.depthFt / deep;
      const pd = Math.min(h.palletDepthFt, step + 0.5);
      const frameLines = Array.from({ length: deep + 1 }, (_, k) => band.cFt + k * step);

      for (const a of ends) {
        for (const c of (lanes ? frameLines : [band.cFt, band.cFt + band.depthFt])) {
          put('upright', a, h.frameHeightFt / 2, c, UPRIGHT_FT, h.frameHeightFt, UPRIGHT_FT);
        }
      }
      for (const a0 of Z.bayStartsFt) {
        const mid = a0 + bl / 2;
        put('under', mid, 0.01, band.cFt + band.depthFt / 2, bl, 0.02, band.depthFt + 1.2);
        const palletAt = (j: number) => a0 + UPRIGHT_FT / 2 + gap * (j + 1) + pw * (j + 0.5);
        h.levelFt.forEach((y, i) => {
          if (i > 0) {
            if (lanes) {
              // a pair of rails under each column of pallets, the lane's whole depth
              for (let j = 0; j < n; j++) {
                for (const side of [-1, 1]) {
                  put('rail', palletAt(j) + side * pw * 0.35, y - RAIL_FT / 2, band.cFt + band.depthFt / 2,
                    RAIL_FT, RAIL_FT, band.depthFt);
                }
              }
            } else {
              for (const c of [band.cFt, band.cFt + band.depthFt]) {
                put('beam', mid, y - h.beamFaceFt / 2, c, bl - UPRIGHT_FT, h.beamFaceFt, BEAM_THICK_FT);
              }
            }
          }
          for (let j = 0; j < n; j++) {
            for (let k = 0; k < deep; k++) {
              const c = band.cFt + (k + 0.5) * step;
              // skid and load in one box, the load's full height from the level
              const load = Math.max(SKID_FT + 0.5, h.loadHeightFt);
              put('pallet', palletAt(j), y + load / 2, c, pw, load, pd - 0.3);
            }
          }
        });
      }
    }
  }

  function cantZone(Z: GeomCantZone, h: CantileverHeights) {
    const colW = COLUMN_FT * 0.8;
    const arm = h.armLengthFt;
    let runIndex = 0;
    for (const row of Z.rows) {
      for (let r = 0; r < row.runs; r++) {
        const a0 = Z.runStartsFt[r];
        if (a0 === undefined) continue;
        const steel = runIndex++ % 2 === 0;
        put('under', a0 + Z.runLengthFt / 2, 0.01, (row.armFromCFt + row.armToCFt) / 2,
          Z.runLengthFt + 1, 0.02, row.armToCFt - row.armFromCFt + 1.2);
        const towers = Array.from({ length: Z.towersPerRun }, (_, t) => a0 + Z.overhangFt + t * Z.towerCentresFt);
        for (const a of towers) {
          put('column', a, h.towerHeightFt / 2, row.colCFt, colW, h.towerHeightFt, COLUMN_FT);
          put('base', a, h.baseHeightFt / 2, (row.armFromCFt + row.armToCFt) / 2,
            colW + 0.2, h.baseHeightFt, row.armToCFt - row.armFromCFt);
          for (const dir of row.armDirs) {
            const c = row.colCFt + dir * (COLUMN_FT / 2 + arm / 2);
            for (const top of h.armTopFt) put('arm', a, top - ARM_FT / 2, c, ARM_FT, ARM_FT, arm, dir * ARM_TILT);
          }
        }
        // bracing between neighbouring towers, spread up the tower's height
        const sets = Math.max(1, h.braceSets);
        for (let t = 0; t + 1 < towers.length; t++) {
          const mid = (towers[t]! + towers[t + 1]!) / 2;
          for (let k = 0; k < sets; k++) {
            const y = h.baseHeightFt + ((k + 0.5) * (h.towerHeightFt - h.baseHeightFt)) / sets;
            put('brace', mid, y, row.colCFt, Z.towerCentresFt - colW, BRACE_FT, BRACE_FT);
          }
        }
        // stock on the base and on every arm, each side, the run's whole length
        for (const dir of row.armDirs) {
          const c = row.colCFt + dir * (COLUMN_FT / 2 + arm / 2);
          for (const top of [h.baseHeightFt, ...h.armTopFt]) {
            put(steel ? 'steel' : 'lumber', a0 + Z.runLengthFt / 2, top + BUNDLE_FT / 2, c,
              Z.runLengthFt, BUNDLE_FT, arm * 0.85);
          }
        }
      }
    }
  }
}
