import { TRUCK_PAYLOAD_LB } from './constants.js';
import type { Bom, BomLine, Layout, RackConfigInput, RackSpec } from './types.js';

/** Typical unit weights, lb — freight sizing only. Replace with catalogue data. */
export const UNIT_WEIGHTS = {
  wireDeck: 13,
  footplate: 3,
  anchorBolt: 0.6,
  rowSpacer: 6,
  columnGuard: 22,
  endProtector: 40,
  loadSign: 0.5,
  frameLbPerFt: 7.5,
  frameBaseLb: 22,
  beamLbPerIn: 0.3,
};

/**
 * Counts material from the layout as drawn.
 * Two rules matter and are easy to get wrong:
 *   - a row of N bays takes N+1 upright frames (adjacent bays share one)
 *   - the floor level carries no beams and no decking
 */
export function buildBom(spec: RackSpec, layout: Layout, config: RackConfigInput): Bom {
  const { rows, baysPerRow, bands } = layout;
  const { beamLevels, palletsPerBay } = spec;

  const frames = rows * (baysPerRow + 1);
  const beams = rows * baysPerRow * beamLevels * 2;
  const decks = rows * baysPerRow * beamLevels * palletsPerBay;
  const footplates = frames * 2;
  const anchors = footplates * 2;
  const rowSpacers = bands * (baysPerRow + 1) * 2;
  const columnGuards = rows * (baysPerRow + 1);
  const endProtectors = rows * 2;
  const loadSigns = rows;

  const frameWt = Math.round(
    UNIT_WEIGHTS.frameLbPerFt * (spec.frameHeightIn / 12) + UNIT_WEIGHTS.frameBaseLb,
  );
  const beamWt = Math.round(UNIT_WEIGHTS.beamLbPerIn * spec.beamLengthIn);

  const raw: Array<[string, string, string, number, number]> = [
    ['Structure', 'Upright frame',
      `${spec.frameHeightIn / 12} ft x ${spec.frameDepthIn} in deep - ${spec.frameCapacityLb.toLocaleString('en-US')} lb capacity`,
      frames, frameWt],
    ['Structure', 'Beam',
      `${spec.beamLengthIn} in - ${spec.beamCapacityLb.toLocaleString('en-US')} lb per pair - ${beamLevels} levels x 2`,
      beams, beamWt],
    ['Decking', 'Wire deck',
      `fits the ${spec.beamLengthIn} in x ${spec.frameDepthIn} in opening - ${palletsPerBay} per bay level`,
      decks, UNIT_WEIGHTS.wireDeck],
    ['Anchorage', 'Footplate', '2 per upright frame', footplates, UNIT_WEIGHTS.footplate],
    ['Anchorage', 'Anchor bolt', '2 per footplate - seismic may require more', anchors, UNIT_WEIGHTS.anchorBolt],
    ['Ties and protection', 'Row spacer',
      `ties back-to-back rows - holds the ${config.flueIn} in flue open`,
      rowSpacers, UNIT_WEIGHTS.rowSpacer],
    ['Ties and protection', 'Column guard', 'aisle-facing columns', columnGuards, UNIT_WEIGHTS.columnGuard],
    ['Ties and protection', 'End-of-row protector', '2 per row', endProtectors, UNIT_WEIGHTS.endProtector],
    ['Compliance', 'Load capacity sign', '1 per row - required signage', loadSigns, UNIT_WEIGHTS.loadSign],
  ];

  const lines: BomLine[] = raw.map(([group, item, description, qty, unitWeightLb]) => ({
    group, item, description, qty, unitWeightLb,
    totalWeightLb: Math.round(qty * unitWeightLb),
  }));

  const totalWeightLb = lines.reduce((sum, l) => sum + l.totalWeightLb, 0);
  return { lines, totalWeightLb, truckloads: Math.max(1, Math.ceil(totalWeightLb / TRUCK_PAYLOAD_LB)) };
}
