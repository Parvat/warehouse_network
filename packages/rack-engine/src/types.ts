/** All linear dimensions are INCHES unless a field name ends in Ft. */

export interface BuildingInput {
  /** Overall internal length, ft — rows run along this axis. */
  lengthFt: number;
  /** Overall internal width, ft — aisles run across this axis. */
  widthFt: number;
  /** Floor to lowest obstruction, ft. Not the roof peak. */
  clearHeightFt: number;
  /** Structural column grid spacing, ft. 0 = unknown / none. */
  columnGridXFt?: number;
  columnGridYFt?: number;
  sprinklers: 'ceiling' | 'in-rack';
}

export interface PalletInput {
  /** Depth into the rack, in. */
  depthIn: number;
  /** Width facing the aisle, in. This drives beam length. */
  widthIn: number;
  /** Pallet + goods, in. */
  loadHeightIn: number;
  /** Loaded weight, lb. */
  weightLb: number;
}

export interface RackConfigInput {
  frameHeight: { mode: 'fit' } | { mode: 'fixed'; heightFt: number };
  beam: { mode: 'best-fit' } | { mode: 'fixed'; lengthIn: number };
  aisleWidthFt: number;
  flueIn: number;
  wallClearanceFt: number;
}

export interface StockInput {
  skuCount: number;
  palletsOutPerDay: number;
  rotation: 'fifo' | 'flexible';
}

export interface EngineInput {
  building: BuildingInput;
  pallet: PalletInput;
  config: RackConfigInput;
  stock: StockInput;
}

export interface RackSpec {
  beamLengthIn: number;
  palletsPerBay: number;
  /** Even clearance at each upright and between pallets, in. */
  palletClearanceIn: number;
  beamCapacityLb: number;
  frameDepthIn: number;
  frameHeightIn: number;
  frameCapacityLb: number;
  /** Load per upright column into the slab, lb. */
  loadPerColumnLb: number;
  levelPitchIn: number;
  /** Total pallet levels including the floor level. */
  levels: number;
  beamLevels: number;
  usableHeightIn: number;
  topClearanceIn: number;
  topBeamHeightFt: number;
  /** The beam's own section height, so the drawing does no arithmetic of its own. */
  beamFaceIn: number;
  /**
   * False only where the arithmetic has gone wrong: the top beam's face runs
   * past the top of the upright carrying it. Surfaced, never drawn.
   */
  topBeamFits: boolean;
  frameExceedsClear: boolean;
}

export interface Layout {
  /** Back-to-back pairs across the building width. */
  bands: number;
  /** Individual rack rows = bands * 2. */
  rows: number;
  baysPerRow: number;
  palletPositions: number;
  bayLengthFt: number;
  moduleDepthFt: number;
  bandPitchFt: number;
  unusedWidthFt: number;
  unusedLengthFt: number;
}

export type FlagSeverity = 'blocking' | 'check' | 'opportunity';

export interface Flag {
  severity: FlagSeverity;
  category: string;
  title: string;
  detail: string;
}

export interface BomLine {
  group: string;
  item: string;
  description: string;
  qty: number;
  unitWeightLb: number;
  totalWeightLb: number;
}

export interface Bom {
  lines: BomLine[];
  totalWeightLb: number;
  truckloads: number;
}

export interface EngineResult {
  spec: RackSpec;
  layout: Layout;
  flags: Flag[];
  bom: Bom;
}
