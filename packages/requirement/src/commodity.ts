import { inferred, type Assumed } from './types.js';

/**
 * Warehouse operators know "a pallet of paper", not "2,200 lb".
 * So we ask what they store and infer the numbers, showing every guess.
 * Figures are typical mid-range values — verify against real jobs.
 */
export interface CommodityProfile {
  key: string;
  label: string;
  weightLb: number;
  loadHeightIn: number;
  note: string;
}

export const COMMODITIES: CommodityProfile[] = [
  { key: 'beverage',    label: 'Beverages / canned goods', weightLb: 2600, loadHeightIn: 48, note: 'dense and heavy' },
  { key: 'packaged_food', label: 'Packaged food',          weightLb: 1800, loadHeightIn: 52, note: 'typical for packaged food' },
  { key: 'paper',       label: 'Paper / print',            weightLb: 2400, loadHeightIn: 48, note: 'paper is heavier than it looks' },
  { key: 'packaging',   label: 'Packaging / empties',      weightLb:  600, loadHeightIn: 64, note: 'light and bulky' },
  { key: 'apparel',     label: 'Apparel / textiles',       weightLb:  900, loadHeightIn: 60, note: 'light, tall cartons' },
  { key: 'ecommerce',   label: 'Mixed e-commerce',         weightLb: 1100, loadHeightIn: 56, note: 'mixed cartons' },
  { key: 'building',    label: 'Building materials',       weightLb: 3000, loadHeightIn: 44, note: 'heavy, often oversized' },
  { key: 'automotive',  label: 'Automotive parts',         weightLb: 2000, loadHeightIn: 48, note: 'dense parts' },
  { key: 'chemical',    label: 'Chemicals / drums',        weightLb: 2800, loadHeightIn: 44, note: 'heavy — check fire class' },
  { key: 'general',     label: 'General / mixed',          weightLb: 1800, loadHeightIn: 52, note: 'a typical mixed pallet' },
];

export const findCommodity = (key: string): CommodityProfile | undefined =>
  COMMODITIES.find((c) => c.key === key);

/** GMA 48 x 40 is the North American default. */
export const DEFAULT_PALLET = { depthIn: 48, widthIn: 40 } as const;

export interface InferredPallet {
  depthIn: Assumed<number>;
  widthIn: Assumed<number>;
  loadHeightIn: Assumed<number>;
  weightLb: Assumed<number>;
}

export function inferPallet(commodityKey: string | undefined): InferredPallet {
  const c = (commodityKey && findCommodity(commodityKey)) || findCommodity('general')!;
  return {
    depthIn: inferred(DEFAULT_PALLET.depthIn, 'GMA 48 x 40 pallet'),
    widthIn: inferred(DEFAULT_PALLET.widthIn, 'GMA 48 x 40 pallet'),
    loadHeightIn: inferred(c.loadHeightIn, c.note),
    weightLb: inferred(c.weightLb, c.note),
  };
}

/** Rough building size from a position count, for the customer who knows neither. */
export function inferBuildingAreaSqFt(positions: number, clearHeightFt = 28): number {
  const levels = Math.max(2, Math.floor((clearHeightFt - 3) / 5.3));
  const sqFtPerPosition = 22 / levels + 4.2;
  return Math.round((positions * sqFtPerPosition) / 500) * 500;
}
