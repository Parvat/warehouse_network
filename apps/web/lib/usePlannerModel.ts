'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AVAILABLE_THREE_QUARTERS, BEAM_LENGTHS_IN,
  CANTILEVER_ARM_SPACINGS_IN,
  CANTILEVER_PRODUCT_FT, DEFAULT_GRID_FT, FLUE_IN, armLengthForProduct, ftIn,
  RACK_TYPES, TRUCK_AISLE_RANGE_FT, TRUCK_LABEL,
  buildingSizeCheck, columnNote, envelopeChecks, isTruckKind, truckAisleCheck, truckAisleFt,
  cantileverBom, cantileverChecks, cantileverLevels, compareRackTypes,
  layoutCantileverRuns, layoutMixed, layoutRack, mixedBom, mixedChecks,
  palletBomIsCountable, rackType, solve,
  type Bom, type CantileverRunInput, type CantileverRunLayout, type EngineInput,
  type Flag, type MixedInput, type MixedLayout, type MixedPriority, type MixedWall,
  type Orientation,
  type Availability, type RackKind, type RackLayout, type RackLayoutInput,
  type RackSpec, type RackType, type SprinklerKind, type TruckKind,
} from '@trace/rack-engine';

/**
 * A3 sizing sheet.
 *
 * Every figure on the screen comes out of the engine: `solve` for the pallet
 * spec, flags and bill of materials, `layoutCantileverRuns` / `cantileverBom`
 * for long products, `layoutRack` for what Fig. 1 draws. Nothing here does rack
 * arithmetic — it only decides what to hand the engine and memoises the result.
 *
 * Stock is deliberately zeroed. The sheet never asks how many SKUs are held or
 * how much ships daily, and every stock-derived flag rule is guarded on those
 * being above zero, so a question never asked raises nothing.
 */

/**
 * What the building stores. `both` is a cantilever strip down one wall with
 * pallet racking filling the rest — the way these buildings are actually laid
 * out, since long stock needs a clear run and a wall row can be single-sided.
 */
export type Family = 'pallets' | 'long' | 'both';

/** What the rack finder carries over. Every value is a starting point. */
export interface PlannerHandoff {
  goods?: string; rack?: string; long?: string; truck?: string;
  aisle?: string; pd?: string; pw?: string; plh?: string; pwt?: string;
  from?: string; match?: string;
}

/** How much of the footprint racking may use: a percentage, or an area. */
export type AvailableMode = 'pct' | 'area';
/** The percentages offered. 100 is the optimistic reading, and the default. */
export const AVAILABLE_PCTS = [100, 90, 80, 75, 70, 60] as const;
/** What is known about the column grid. */
export type ColumnsMode = 'grid' | 'later';

export interface BuildingDraft {
  lengthFt: number; widthFt: number; clearHeightFt: number;
  /** A building holds more than racking; this says how much more. */
  available: AvailableMode;
  availablePct: number;
  usableSqFt: number;
  columns: ColumnsMode;
  gridXFt: number; gridYFt: number;
}
export interface PalletDraft { depthIn: number; widthIn: number; loadHeightIn: number; weightLb: number }
export interface ConfigDraft {
  beamIn: number;
  orientation: Orientation;
  /** The truck sets the aisle; it does not lock it. */
  truck: TruckKind;
  /**
   * Undefined leaves the cross aisles to Trace's reading of the run — a break
   * every hundred feet. A number is the customer's own, and holds until they
   * clear it. Fire code is the AHJ's call, so this has to be answerable.
   */
  crossAisles: number | undefined;
  /** Which family takes the building first. Only asked of a mixed layout. */
  priority: MixedPriority;
}

/**
 * What is stored on the cantilever, and how it is configured.
 *
 * Roll-formed against structural is a load calculation, and vertical or
 * portable racks are different products — so the planner offers cantilever
 * with a sides switch and leaves the rest to a dealer. The five systems stay in
 * `longgoods.ts` for a dealer-facing screen.
 */
export interface CantileverDraft {
  /** What is stored. Tower spacing, arm length and bracing follow from it. */
  productLengthFt: number;
  /** How much of it there is. Rows follow from this. */
  linearFeetNeededFt: number;
  /** Vertical gap between arm levels, in. Levels follow from it. */
  armSpacingIn: number;
}

/** One cell of the comparison row under the drawings. */
export interface TypeCell {
  key: string;
  name: string;
  capacity: number;
  unit: string;
  deltaPct: number;
  isBaseline: boolean;
  densest: boolean;
  tags: readonly string[];
  selected: boolean;
  onSelect: () => void;
}

const DEFAULT_BUILDING: BuildingDraft = {
  lengthFt: 240, widthFt: 120, clearHeightFt: 28,
  // Defaults to the optimistic reading, and says so in a flag rather than
  // quietly assuming a figure the customer never gave.
  available: 'pct', availablePct: 100, usableSqFt: 20000,
  columns: 'later', gridXFt: DEFAULT_GRID_FT, gridYFt: DEFAULT_GRID_FT,
};
const DEFAULT_CONFIG: ConfigDraft = {
  beamIn: 96,
  orientation: 'length', truck: 'counterbalance',
  crossAisles: undefined, priority: 'cantilever',
};
const WALL_CLEARANCE_FT = 2.5;
const DEFAULT_ARM_SPACING_IN = 24;

const isKind = (v: string | undefined): v is RackKind =>
  !!v && RACK_TYPES.some((r) => r.kind === v);
const num = (v: string | undefined, fallback: number): number => {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

export interface PlannerModel {
  family: Family;
  setFamily: (v: Family) => void;

  building: BuildingDraft;
  pallet: PalletDraft;
  config: ConfigDraft;
  cant: CantileverDraft;
  sprinklers: SprinklerKind;
  kind: RackKind;
  type: RackType;

  onBuilding: Record<'lengthFt' | 'widthFt' | 'clearHeightFt', (v: number) => void>;
  onPallet: Record<keyof PalletDraft, (v: number) => void>;
  onCant: {
    productLengthFt: (v: number) => void;
    linearFeetNeededFt: (v: number) => void;
    armSpacingIn: (v: number) => void;
  };
  setBeamIn: (v: number) => void;
  setTruck: (v: TruckKind) => void;
  setCrossAisles: (v: number | undefined) => void;
  setPriority: (v: MixedPriority) => void;
  setAvailable: (v: AvailableMode) => void;
  setAvailablePct: (v: number) => void;
  setUsableSqFt: (v: number) => void;
  setColumnsMode: (v: ColumnsMode) => void;
  setGridXFt: (v: number) => void;
  setGridYFt: (v: number) => void;
  setOrientation: (v: Orientation) => void;
  setSprinklers: (v: SprinklerKind) => void;
  selectKind: (k: RackKind) => void;

  /** Pallet family. */
  spec: RackSpec;
  layout: RackLayout;
  /** Long-goods family. */
  runs: CantileverRunLayout;
  /** Both families on one floor. */
  mixed: MixedLayout;
  /** What the strip costs the pallet racking, ready to read. */
  stripCost: { widthFt: number; positions: number; without: number } | undefined;
  /** What tunnelling the cross aisles is worth, in positions. */
  tunnelNote: string | undefined;
  /** What the cantilever actually came to, against what was asked for. */
  cantileverFill: string | undefined;

  /** Whichever family is showing. */
  flags: readonly Flag[];
  bom: Bom;
  types: readonly TypeCell[];
  placard: readonly { k: string; v: string }[];
  blurb: string;
  /** True where the parts really are countable rather than a dealer's quote. */
  standardBom: boolean;
  /** The cross aisles this building gets, whichever family is showing. */
  crossAisles: number;
  /** True where that figure is Trace's own rather than the customer's. */
  crossAislesAuto: boolean;
  /** What the columns did to this layout, in a sentence. */
  columnNote: string | undefined;
  /** Everything Trace assumed rather than asked, for the one-line summary. */
  assumptions: readonly string[];
  truckRange: { min: number; max: number };
  /** Derived from the truck, shown rather than asked for. */
  aisleFt: number;
  truckOptions: readonly (readonly [TruckKind, string])[];
  /** Mixed bills keep the cantilever section even where the pallet type has none. */
  palletBomCountable: boolean;

  beamOptions: readonly number[];

  armSpacingOptions: readonly number[];
  /** Bounds for the fields the sheet still asks, so a blank cannot reach the engine. */
  productFt: { min: number; max: number; fallback: number };
  availablePcts: readonly number[];
  /**
   * Arm levels the clear height leaves room for at the chosen spacing. Where an
   * emptied field lands — not a ceiling on what can be asked for, because a
   * combination that does not fit has to raise its blocking flag.
   */
  maxLevels: number;
  fromFinder: boolean;
  matchPct: string | undefined;
  wallClearanceFt: number;
}

export function usePlannerModel(handoff: PlannerHandoff = {}): PlannerModel {
  const [family, setFamily] = useState<Family>(handoff.goods === 'long' ? 'long' : 'pallets');
  const [kind, setKind] = useState<RackKind>(isKind(handoff.rack) ? handoff.rack : 'selective');
  const [building, setBuilding] = useState<BuildingDraft>(DEFAULT_BUILDING);
  const [pallet, setPallet] = useState<PalletDraft>(() => ({
    depthIn: num(handoff.pd, 48), widthIn: num(handoff.pw, 40),
    loadHeightIn: num(handoff.plh, 52), weightLb: num(handoff.pwt, 2200),
  }));
  // The finder already asked which truck, and the truck is what sets the aisle.
  const [config, setConfig] = useState<ConfigDraft>(() => ({
    ...DEFAULT_CONFIG,
    truck: isTruckKind(handoff.truck) ? handoff.truck : DEFAULT_CONFIG.truck,
  }));

  /**
   * Derived, not asked for. "AISLE: 12.5" means nothing to somebody who has
   * never specified racking, and a figure that disagrees with the truck in the
   * building is worse than no figure at all.
   */
  const aisleFt = truckAisleFt(config.truck);
  const [cant, setCant] = useState<CantileverDraft>(() => ({
    productLengthFt: CANTILEVER_PRODUCT_FT.fallback, linearFeetNeededFt: 500,
    armSpacingIn: DEFAULT_ARM_SPACING_IN,
  }));

  /**
   * Derived, not asked for. Arm length is a dealer's call against a deflection
   * chart, and the customer has no way to answer it — but the stock they store
   * decides where that conversation starts.
   */
  const armLengthIn = armLengthForProduct(cant.productLengthFt);
  const [sprinklers, setSprinklers] = useState<SprinklerKind>('ceiling');

  const type = rackType(kind);

  /* ── pallets ───────────────────────────────────────────────────────── */

  const engineInput = useMemo<EngineInput>(() => ({
    building: {
      lengthFt: building.lengthFt, widthFt: building.widthFt,
      clearHeightFt: building.clearHeightFt, sprinklers,
    },
    pallet,
    config: {
      frameHeight: { mode: 'fit' },
      beam: { mode: 'fixed', lengthIn: config.beamIn },
      aisleWidthFt: aisleFt, flueIn: FLUE_IN, wallClearanceFt: WALL_CLEARANCE_FT,
    },
    // Never asked on this sheet, so it must never raise a flag. Every
    // stock-derived rule in the engine is guarded on these being above zero.
    stock: { skuCount: 0, palletsOutPerDay: 0, rotation: 'flexible' },
  }), [building, pallet, sprinklers, config.beamIn, aisleFt]);

  const solved = useMemo(() => solve(engineInput), [engineInput]);

  const available = useMemo<Availability>(() => (
    building.available === 'area' ? { mode: 'area', sqFt: building.usableSqFt }
      : building.availablePct >= 100 ? { mode: 'all' }
        : { mode: 'fraction', fraction: building.availablePct / 100 }
  ), [building.available, building.availablePct, building.usableSqFt]);

  const rackInput = useMemo<RackLayoutInput>(() => ({
    buildingLengthFt: building.lengthFt,
    buildingWidthFt: building.widthFt,
    available,
    gridXFt: building.columns === 'grid' ? building.gridXFt : undefined,
    gridYFt: building.columns === 'grid' ? building.gridYFt : undefined,
    beamLengthIn: config.beamIn,
    palletWidthIn: pallet.widthIn,
    palletsPerBay: solved.spec.palletsPerBay,
    levels: solved.spec.levels,
    frameDepthIn: solved.spec.frameDepthIn,
    aisleWidthFt: aisleFt,
    wallClearanceFt: WALL_CLEARANCE_FT,
    orientation: config.orientation,
    crossAisles: config.crossAisles,
  }), [building.lengthFt, building.widthFt, config, solved.spec, aisleFt, available]);

  const layout = useMemo(() => layoutRack(kind, rackInput), [kind, rackInput]);

  /* ── long products ─────────────────────────────────────────────────── */

  const runInput = useMemo<CantileverRunInput>(() => ({
    buildingLengthFt: building.lengthFt,
    buildingWidthFt: building.widthFt,
    clearHeightFt: building.clearHeightFt,
    aisleWidthFt: aisleFt,
    wallClearanceFt: WALL_CLEARANCE_FT,
    orientation: config.orientation,
    available,
    gridXFt: building.columns === 'grid' ? building.gridXFt : undefined,
    gridYFt: building.columns === 'grid' ? building.gridYFt : undefined,
    productLengthFt: cant.productLengthFt,
    armLengthIn: armLengthIn,
    armSpacingIn: cant.armSpacingIn,
    linearFeetNeededFt: cant.linearFeetNeededFt,
    crossAisles: config.crossAisles,
  }), [building, aisleFt, config.orientation, config.crossAisles, cant, available]);

  const runs = useMemo(() => layoutCantileverRuns(runInput), [runInput]);
  const longFlags = useMemo(() => cantileverChecks(runInput, runs), [runInput, runs]);
  const longBom = useMemo(() => cantileverBom(runs), [runs]);

  /* ── both, on one floor ────────────────────────────────────────────── */

  const mixedInput = useMemo<MixedInput>(() => ({
    buildingLengthFt: building.lengthFt,
    buildingWidthFt: building.widthFt,
    clearHeightFt: building.clearHeightFt,
    wallClearanceFt: WALL_CLEARANCE_FT,
    orientation: config.orientation,
    available,
    gridXFt: building.columns === 'grid' ? building.gridXFt : undefined,
    gridYFt: building.columns === 'grid' ? building.gridYFt : undefined,
    cantilever: {
      linearFeetNeededFt: cant.linearFeetNeededFt,
      productLengthFt: cant.productLengthFt,
      armLengthIn: armLengthIn,
      armSpacingIn: cant.armSpacingIn,
    },
    pallet: {
      kind,
      beamLengthIn: config.beamIn,
      palletWidthIn: pallet.widthIn,
      palletsPerBay: solved.spec.palletsPerBay,
      levels: solved.spec.levels,
      frameDepthIn: solved.spec.frameDepthIn,
      aisleWidthFt: aisleFt,
    },
    priority: config.priority,
    crossAisles: config.crossAisles,
  }), [building, config, cant, kind, solved.spec, available, aisleFt]);

  const mixed = useMemo(() => layoutMixed(mixedInput), [mixedInput]);
  const mixedFlags = useMemo(() => mixedChecks(mixedInput, mixed), [mixedInput, mixed]);

  // The pallet bill has to be counted from the reduced building, not the whole
  // one, or it would list frames for racking the strip displaced.
  const mixedPalletSolve = useMemo(() => {
    const lost = mixed.stripTotalDepthFt;
    return solve({
      ...engineInput,
      building: config.orientation === 'length'
        ? { ...engineInput.building, widthFt: Math.max(1, building.widthFt - lost) }
        : { ...engineInput.building, lengthFt: Math.max(1, building.lengthFt - lost) },
    });
  }, [engineInput, mixed.stripTotalDepthFt, config.orientation, building]);

  const mixedBomLines = useMemo(
    () => mixedBom(cantileverBom(mixed.strip),
      palletBomIsCountable(kind) ? mixedPalletSolve.bom : null),
    [mixed.strip, kind, mixedPalletSolve]);

  /* ── handlers ──────────────────────────────────────────────────────── */

  const selectKind = useCallback((k: RackKind) => {
    setKind(k);
  }, []);

  const onBuilding = useMemo<Record<'lengthFt' | 'widthFt' | 'clearHeightFt', (v: number) => void>>(() => ({
    lengthFt: (v) => setBuilding((b) => ({ ...b, lengthFt: v })),
    widthFt: (v) => setBuilding((b) => ({ ...b, widthFt: v })),
    // levels follow a new clear height until the customer sets them by hand
    clearHeightFt: (v) => {
      setBuilding((b) => ({ ...b, clearHeightFt: v }));
      setCant((c) => ({ ...c, levels: cantileverLevels(v, c.armSpacingIn) }));
    },
  }), []);

  const onBuilding2 = useMemo(() => ({
    available: (v: AvailableMode) => setBuilding((b) => ({ ...b, available: v })),
    availablePct: (v: number) => setBuilding((b) => ({
      ...b, available: 'pct', availablePct: v,
    })),
    usableSqFt: (v: number) => setBuilding((b) => ({ ...b, usableSqFt: v })),
    columns: (v: ColumnsMode) => setBuilding((b) => ({ ...b, columns: v })),
    gridXFt: (v: number) => setBuilding((b) => ({ ...b, gridXFt: v })),
    gridYFt: (v: number) => setBuilding((b) => ({ ...b, gridYFt: v })),
  }), []);

  const onPallet = useMemo<Record<keyof PalletDraft, (v: number) => void>>(() => ({
    depthIn: (v) => setPallet((p) => ({ ...p, depthIn: v })),
    widthIn: (v) => setPallet((p) => ({ ...p, widthIn: v })),
    loadHeightIn: (v) => setPallet((p) => ({ ...p, loadHeightIn: v })),
    weightLb: (v) => setPallet((p) => ({ ...p, weightLb: v })),
  }), []);

  const onCant = useMemo(() => ({
    productLengthFt: (v: number) => setCant((c) => ({ ...c, productLengthFt: v })),
    // one control for both: the base matches the arm
    linearFeetNeededFt: (v: number) => setCant((c) => ({ ...c, linearFeetNeededFt: v })),
    // Deliberately leaves the levels alone: asking for a spacing the levels no
    // longer fit under is exactly the case the height flag exists to report.
    armSpacingIn: (v: number) => setCant((c) => ({ ...c, armSpacingIn: v })),
  }), []);

  const setField = useMemo(() => ({
    beamIn: (v: number) => setConfig((c) => ({ ...c, beamIn: v })),
    // The truck sets the aisle and then leaves it alone: a designer may still
    // trim a foot to clear a column, and the check flag catches a real mistake.
    truck: (v: TruckKind) => setConfig((c) => ({ ...c, truck: v })),
    orientation: (v: Orientation) => setConfig((c) => ({ ...c, orientation: v })),
    // Undefined hands it back to Trace, which is what the "auto" marker means.
    crossAisles: (v: number | undefined) => setConfig((c) => ({ ...c, crossAisles: v })),
    priority: (v: MixedPriority) => setConfig((c) => ({ ...c, priority: v })),
  }), []);

  /* ── what the sheet shows ──────────────────────────────────────────── */

  const rackCells = useMemo<TypeCell[]>(() => {
    // With a strip in place the comparison has to run against the width the
    // pallet racking actually gets, or it would rank types on floor that is
    // already spoken for.
    const rows = compareRackTypes(family === 'both'
      ? { ...rackInput, wallsAcross: 1,
          buildingWidthFt: config.orientation === 'length'
            ? building.widthFt - mixed.stripTotalDepthFt : building.widthFt,
          buildingLengthFt: config.orientation === 'length'
            ? building.lengthFt : building.lengthFt - mixed.stripTotalDepthFt }
      : rackInput);
    const base = rows.find((r) => r.kind === 'selective')?.layout.positions ?? 0;
    const most = rows.reduce((m, r) => Math.max(m, r.layout.positions), 0);
    return rows.map<TypeCell>((r) => ({
      key: r.kind, name: r.type.name, capacity: r.layout.positions, unit: '',
      deltaPct: base > 0 ? Math.round(((r.layout.positions - base) / base) * 100) : 0,
      isBaseline: r.kind === 'selective', densest: r.layout.positions === most,
      tags: [`${r.type.selectivity} reachable`, r.type.rotation],
      selected: r.kind === kind, onSelect: () => selectKind(r.kind),
    }));
  }, [rackInput, kind, selectKind, family, config.orientation, building, mixed.stripTotalDepthFt]);

  const placard = useMemo(() => (family === 'both'
    // Two units. Adding them would be meaningless, so they are reported side
    // by side and never combined.
    ? [
      { k: 'Pallet positions', v: `~${mixed.pallets.positions.toLocaleString()}` },
      { k: 'Linear feet of arm', v: `~${mixed.strip.linearFt.toLocaleString()}` },
      // Long mode shows what was asked against what was built, and a mixed
      // floor is where the two are most likely to part company.
      { k: 'Asked for', v: `${(mixed.strip.linearFeetNeededFt ?? 0).toLocaleString()} ft` },
      { k: 'Pallet rows', v: String(mixed.pallets.rows) },
      { k: 'Cantilever rows', v: String(mixed.cantileverRows) },
      { k: 'Bays per row', v: String(mixed.pallets.bays) },
      { k: 'Towers per run', v: String(mixed.strip.towersPerRun) },
      { k: 'Shared aisle', v: `${mixed.sharedAisleFt} ft` },
      { k: 'Strip depth', v: `${mixed.stripTotalDepthFt.toFixed(1)} ft` },
      { k: 'Pallet zone', v: `${mixed.palletWidthFt.toFixed(1)} ft` },
      { k: 'Arm levels', v: `${mixed.strip.levels} + base` },
      // The pitch is what the level count is derived from, so a reader who wants
      // to check the one needs the other. It reads here in both families.
      { k: 'Arm spacing', v: `${mixed.strip.armPitchIn} in` },
      { k: 'Beam', v: `${solved.spec.beamLengthIn} in` },
      { k: 'Base / arm', v: `${mixed.strip.armLengthIn} in` },
    ]
    : family === 'long'
    ? [
      { k: 'Linear feet', v: `~${runs.linearFt.toLocaleString()} ft` },
      { k: 'Asked for', v: `${(runs.linearFeetNeededFt ?? 0).toLocaleString()} ft` },
      { k: 'Rows', v: `${runs.rows} (${runs.wallRows} wall, ${runs.interiorRows} interior)` },
      { k: 'Building holds', v: `~${runs.maxLinearFt.toLocaleString()} ft` },
      { k: 'Runs / row', v: String(runs.runsPerRow) },
      { k: 'Towers / run', v: String(runs.towersPerRun) },
      { k: 'Tower centres', v: ftIn(runs.towerCentresFt) },
      { k: 'Supported span', v: `${runs.spanFt} ft` },
      { k: 'Overhang', v: `${runs.overhangFt} ft each end` },
      { k: 'Arm levels', v: String(runs.levels) },
      { k: 'Arm spacing', v: `${runs.armPitchIn} in` },
      { k: 'Storing levels', v: `${runs.storageLevels} (arms + base)` },
      { k: 'Base / arm', v: `${runs.armLengthIn} in` },
      { k: 'Tower height', v: ftIn(runs.towerHeightIn / 12) },
      { k: 'Bracing', v: `${runs.braceSetsPerBay} sets / bay` },
      { k: 'Sides armed', v: runs.rowSides.length === 0 ? 'None'
        : `${runs.rowSides.filter((x) => x === 2).length} double · `
          + `${runs.rowSides.filter((x) => x === 1).length} single` },
    ]
    : [
      { k: 'Beam', v: `${solved.spec.beamLengthIn} in` },
      { k: 'Pallets / bay', v: String(solved.spec.palletsPerBay) },
      { k: 'Beam cap / pair', v: `${solved.spec.beamCapacityLb.toLocaleString()} lb` },
      { k: 'Frame depth', v: `${solved.spec.frameDepthIn} in` },
      { k: 'Frame height', v: `${(solved.spec.frameHeightIn / 12).toFixed(1)} ft` },
      { k: 'Levels', v: String(solved.spec.levels) },
      { k: 'Level pitch', v: `${solved.spec.levelPitchIn} in` },
      { k: 'Frame cap', v: `${solved.spec.frameCapacityLb.toLocaleString()} lb` },
      { k: 'Rotation', v: type.rotation },
      // Derived, not asked: the building decides how deep a lane or a cart nest
      // can go, and a customer cannot know that before the floor is laid out.
      ...(layout.deep > 1
        ? [{ k: type.pick === 'lane' ? 'Lane depth' : 'Deep', v: `${layout.deep} pallets` }]
        : []),
      { k: 'Usable floor', v: `${Math.round(layout.usableAlongFt * layout.acrossFt).toLocaleString()} sq ft` },
      { k: 'Flue', v: `${layout.flueIn} in` },
      { k: 'Cross aisles', v: layout.crossAisles === 0 ? 'none'
        : `${layout.crossAisles} × ${layout.crossAisleWidthFt} ft` },
      { k: 'Pallet positions', v: layout.positions.toLocaleString() },
    ]), [family, runs, mixed, solved.spec, type, layout]);

  const isLong = family === 'long';
  const isMixed = family === 'both';

  // The floor Trace assumed, rather than the racking it drew on it.
  const envelopeFlags = useMemo(() => envelopeChecks(layout, {
    available: available.mode, columns: building.columns,
  }), [layout, available.mode, building.columns]);

  // A property of the building, so it belongs to every family's list.
  const sizeFlag = useMemo(
    () => buildingSizeCheck(building.lengthFt, building.widthFt),
    [building.lengthFt, building.widthFt]);

  const assumptions = useMemo(() => [
    building.available === 'area' ? `${building.usableSqFt.toLocaleString()} sq ft is rackable`
      : building.availablePct >= 100 ? 'the whole footprint is available'
        : `${building.availablePct}% of the footprint is rackable`,
    building.columns === 'grid'
      ? `a ${building.gridXFt} × ${building.gridYFt} ft column grid`
      : building.columns === 'later' ? 'a clear floor until you mark the columns'
      : 'no building columns',
    layout.crossAisles === 0 ? 'no cross aisle'
      : `${layout.crossAisles} cross ${layout.crossAisles === 1 ? 'aisle' : 'aisles'}`,
    `a ${aisleFt} ft aisle for a ${TRUCK_LABEL[config.truck].toLowerCase()}`,
  ], [building, layout.crossAisles, aisleFt, config.truck]);

  return {
    family, setFamily,
    building, pallet, config, cant, sprinklers, kind, type,
    onBuilding, onPallet, onCant,
    setBeamIn: setField.beamIn,
    setTruck: setField.truck,
    setCrossAisles: setField.crossAisles, setPriority: setField.priority,
    setAvailable: onBuilding2.available, setAvailablePct: onBuilding2.availablePct,
    setUsableSqFt: onBuilding2.usableSqFt,
    setColumnsMode: onBuilding2.columns, setGridXFt: onBuilding2.gridXFt,
    setGridYFt: onBuilding2.gridYFt,
    setOrientation: setField.orientation,
    setSprinklers, selectKind,
    spec: solved.spec, layout, runs, mixed,
    stripCost: isMixed
      ? { widthFt: mixed.stripTotalDepthFt, positions: mixed.positionsCost,
          without: mixed.palletsAlone.positions }
      : undefined,
    // A mixed sheet shows the pallet flags from the reduced building, the
    // strip's own checks, and what only the mix can raise.
    flags: [
      ...(sizeFlag ? [sizeFlag] : []),
      ...(isMixed ? [...mixedFlags, ...mixedPalletSolve.flags]
        : isLong ? longFlags : [...solved.flags, ...envelopeFlags]),
    ],
    bom: isMixed ? mixedBomLines : isLong ? longBom : solved.bom,
    // One system fixed by the product length, so there is nothing to compare;
    // a mixed sheet still compares the pallet types, in the width they get.
    types: isLong ? [] : rackCells,
    placard,
    blurb: isMixed
      ? 'A cantilever strip down one wall and pallet racking filling the rest. The strip is '
        + 'solved first and the pallet racking takes what is left, sharing an aisle sized for '
        + 'the long load rather than the pallets.'
      : isLong
      ? 'Arms projecting from towers, braced back and bolted down. Product rests on the base '
        + 'as well as on every arm, so a tower stores one level more than it has arms. Which way '
        + 'the arms face follows the row: against a wall they can only be reached from the aisle, '
        + 'out on the floor they are reached from both.'
      : type.blurb,
    // Cantilever really is modular, so unlike drive-in or push-back its parts
    // are countable rather than a dealer's quote.
    standardBom: isLong ? true : isMixed ? true : type.standardBom,
    crossAisles: isLong ? runs.crossAisles : layout.crossAisles,
    crossAislesAuto: config.crossAisles === undefined,
    // Not an option Trace offers, but worth knowing it exists.
    tunnelNote: layout.crossAisles > 0
      ? 'Some warehouses tunnel a cross aisle — clearing the bottom level and storing above '
        + 'it. Ask your dealer whether that suits your operation.'
      : undefined,
    cantileverFill: isLong || isMixed
      ? `${((isMixed ? mixed.strip : runs).linearFeetNeededFt ?? 0).toLocaleString()} linear ft `
        + `asked · ${(isMixed ? mixed.strip : runs).linearFt.toLocaleString()} ft built`
        + ((isMixed ? mixed.strip : runs).lastRowPartial
          ? ` · last row ${(isMixed ? mixed.strip : runs).runsInLastRow} of `
            + `${(isMixed ? mixed.strip : runs).runsPerRow} runs, the rest of it left empty` : '')
      : undefined,
    columnNote: building.columns === 'grid' && !isLong
      ? columnNote(layout, { xFt: building.gridXFt, yFt: building.gridYFt })
      : undefined,
    assumptions: isLong ? [] : assumptions,
    truckRange: TRUCK_AISLE_RANGE_FT[config.truck],
    aisleFt,
    truckOptions: (Object.keys(TRUCK_LABEL) as TruckKind[])
      .map((t) => [t, TRUCK_LABEL[t]] as const),
    palletBomCountable: palletBomIsCountable(kind),
    beamOptions: BEAM_LENGTHS_IN,

    armSpacingOptions: CANTILEVER_ARM_SPACINGS_IN,
    productFt: CANTILEVER_PRODUCT_FT,
    availablePcts: AVAILABLE_PCTS,
    maxLevels: cantileverLevels(building.clearHeightFt, cant.armSpacingIn),
    fromFinder: handoff.from === 'finder',
    matchPct: handoff.match,
    wallClearanceFt: WALL_CLEARANCE_FT,
  };
}
