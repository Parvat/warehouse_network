import { buildBom } from './bom.js';
import { buildFlags } from './flags.js';
import { buildLayout } from './layout.js';
import { buildSpec } from './spec.js';
import type { EngineInput, EngineResult } from './types.js';

export * from './types.js';
export * from './racktypes.js';
export * from './racklayout.js';
export * from './longgoods.js';
export * from './cantileverlayout.js';
export * from './cantileverruns.js';
export * from './mixedlayout.js';
export * from './constants.js';
export * from './crossaisles.js';
export {
  palletsPerBay, bestFitBeam, bestFitFrameFt, deriveFromPallet,
  levelModuleIn, beamLevelsIn, topBeamFits,
  type PalletDerivation, type SprinklerKind,
} from './spec.js';
export { aisleForExtraBand } from './layout.js';
export { UNIT_WEIGHTS } from './bom.js';

/**
 * The whole engine. Pure — no DOM, no network, no database.
 * Runs identically in the browser as the customer types and on the
 * server when an estimate is saved or a PDF is rendered.
 */
export function solve(input: EngineInput): EngineResult {
  const spec = buildSpec(input.building, input.pallet, input.config);
  const layout = buildLayout(input.building, spec, input.config);
  const flags = buildFlags(input, spec, layout);
  const bom = buildBom(spec, layout, input.config);
  return { spec, layout, flags, bom };
}
