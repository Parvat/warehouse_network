import { BEAM_LENGTHS_IN, FRAME_HEIGHTS_FT, MIN_WORKING_AISLE_FT } from './constants.js';
import { aisleForExtraBand } from './layout.js';
import type { EngineInput, Flag, Layout, RackSpec } from './types.js';

const n = (v: number) => Math.round(v).toLocaleString('en-US');

/**
 * Domain checks. Every flag names the computed number, the real consequence,
 * and what to do about it — never a bare "warning".
 */
export function buildFlags(input: EngineInput, spec: RackSpec, layout: Layout): Flag[] {
  const { building, pallet, config, stock } = input;
  const f: Flag[] = [];
  const push = (severity: Flag['severity'], category: string, title: string, detail: string) =>
    f.push({ severity, category, title, detail });

  // ---- blocking ----
  if (spec.frameExceedsClear) {
    const largest = FRAME_HEIGHTS_FT.filter((x) => x * 12 <= spec.usableHeightIn).pop() ?? 8;
    push('blocking', 'Height', 'Frame will not fit',
      `A ${spec.frameHeightIn / 12} ft frame does not fit under ${(spec.usableHeightIn / 12).toFixed(1)} ft of usable height. Drop to ${largest} ft, or raise the sprinkler clearance.`);
  }
  if (spec.levels < 2) {
    push('blocking', 'Height', 'Only one storage level',
      `At a ${pallet.loadHeightIn} in load height you get a single level. Racking rarely pays for itself below two.`);
  }
  if (stock.skuCount > layout.palletPositions) {
    push('blocking', 'Stock', 'More SKUs than positions',
      `${n(stock.skuCount)} SKUs against ${n(layout.palletPositions)} positions. You cannot give every product its own location — either accept mixed pallets or find more building.`);
  }
  if (config.aisleWidthFt < MIN_WORKING_AISLE_FT) {
    push('blocking', 'Aisle', 'Aisle below working width',
      `At ${config.aisleWidthFt} ft nothing can turn in to place a pallet. Even a turret truck wants about 6 ft.`);
  }
  if (config.flueIn === 0) {
    push('blocking', 'Fire', 'No flue space',
      'Back-to-back rows with no gap stop sprinkler water reaching a fire inside the rack. This will not pass inspection.');
  }

  // ---- check ----
  if (spec.beamCapacityLb > 6000) {
    push('check', 'Beam', 'Heavy beam section',
      `At ${n(spec.beamCapacityLb)} lb per pair you are into heavy beam sections — check availability and lead time before committing.`);
  }
  if (spec.palletsPerBay >= 3 && pallet.weightLb > 2200) {
    push('check', 'Beam', 'Three heavy pallets per bay',
      `Three pallets of ${n(pallet.weightLb)} lb on one beam pair is a serious load. A shorter beam carrying two may cost less per position.`);
  }
  if (spec.loadPerColumnLb > 20_000) {
    push('check', 'Slab', 'Point load at each baseplate',
      `Each column puts about ${n(spec.loadPerColumnLb)} lb into the slab. Have floor thickness and footings checked before anchoring.`);
  }
  if (spec.topBeamHeightFt > 20 && config.aisleWidthFt >= 11) {
    push('check', 'Reach', 'Top level beyond a counterbalance',
      `Your top beam sits near ${spec.topBeamHeightFt.toFixed(0)} ft. Most counterbalance trucks stop around 20 ft — you need a reach truck, which changes the aisle you specified.`);
  }
  if (spec.frameHeightIn / spec.frameDepthIn > 6) {
    push('check', 'Stability', 'Tall and narrow',
      `Height to depth is about ${(spec.frameHeightIn / spec.frameDepthIn).toFixed(1)}:1. Above roughly 6:1 racks usually need overhead ties or a deeper frame.`);
  }
  if (config.flueIn > 0 && config.flueIn < 6) {
    push('check', 'Fire', 'Flue below 6 in',
      `A ${config.flueIn} in flue is tighter than the 6 in most authorities expect between back-to-back rows. Confirm with your AHJ.`);
  }
  if (building.clearHeightFt >= 30 && building.sprinklers === 'ceiling') {
    push('check', 'Fire', 'Ceiling sprinklers at this height',
      'Above about 30 ft, ceiling sprinklers alone often will not satisfy code. Budget for in-rack sprinklers.');
  }
  if (pallet.loadHeightIn > 72) {
    push('check', 'Load', 'Tall pallet load',
      `A ${pallet.loadHeightIn} in load is tall for its footprint. Check stability and whether it needs deck support.`);
  }
  const twoFit = BEAM_LENGTHS_IN.find((b) => b >= 2 * pallet.widthIn + 12) ?? 96;
  const threeFit = BEAM_LENGTHS_IN.find((b) => b >= 3 * pallet.widthIn + 16) ?? 144;
  if (spec.palletsPerBay === 2 && spec.beamLengthIn > 2 * pallet.widthIn + 24) {
    push('check', 'Beam', 'Wasted span',
      `This beam is longer than two pallets need but too short for three. Try ${twoFit} in or ${threeFit} in.`);
  }

  // ---- opportunity ----
  const trimmed = aisleForExtraBand(building, layout, config);
  if (trimmed !== null) {
    const gain = 2 * layout.baysPerRow * spec.palletsPerBay * spec.levels;
    push('opportunity', 'Layout', 'Room for another double row',
      `${layout.unusedWidthFt.toFixed(1)} ft of width is unused. Trimming the aisle to ${trimmed.toFixed(1)} ft fits one more back-to-back row — about ${n(gain)} more positions, but it changes the truck you can use.`);
  }
  if (layout.unusedLengthFt >= layout.bayLengthFt * 0.9) {
    push('opportunity', 'Layout', 'Unused length',
      `${layout.unusedLengthFt.toFixed(1)} ft is left at the end of every row — nearly a full bay. A shorter beam would close the gap.`);
  }
  if (stock.skuCount > 0 && layout.palletPositions / stock.skuCount > 15 && stock.rotation === 'flexible') {
    push('opportunity', 'Stock', 'Deep storage would suit you',
      `Each SKU averages about ${Math.round(layout.palletPositions / stock.skuCount)} positions. With flexible rotation, drive-in or pushback would hold the same stock in less floor.`);
  }
  if (layout.palletPositions > 0 && stock.palletsOutPerDay / layout.palletPositions > 0.12) {
    push('opportunity', 'Stock', 'High throughput',
      `You ship about ${Math.round((stock.palletsOutPerDay / layout.palletPositions) * 100)}% of stored pallets daily. That traffic argues for wider aisles and more pick faces, not denser racking.`);
  }

  return f;
}
