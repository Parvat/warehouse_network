/**
 * The requirement is the durable artifact of phase 1.
 * A layout may never exist. Matching, quoting and purchasing all run off this.
 */

/** The nine ways a customer arrives. Four never touch the rack engine. */
export type ServiceKind =
  | 'complete_project'
  | 'material_only'
  | 'installation_only'
  | 'engineering_only'
  | 'design_only'
  | 'freight_only'
  | 'rental_only'
  | 'inspection_only'
  | 'accessories_only';

/** Services that need rack sizing at all. */
export const SIZING_RELEVANT: ReadonlySet<ServiceKind> = new Set<ServiceKind>([
  'complete_project', 'material_only', 'design_only', 'engineering_only',
]);

/** The three states a customer arrives in. Drives which fields we ask for. */
export type KnowledgeMode = 'knows_spec' | 'knows_quantity' | 'knows_building' | 'knows_commodity';

export type MaterialPreference = 'new' | 'used' | 'either';

export interface SiteLocation {
  /** Free text as typed — always keep the raw input. */
  raw: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
}

/**
 * Where a value came from. Anything not `stated` renders as an editable
 * assumption chip, which is what makes the estimate feel honest.
 */
export type Provenance = 'stated' | 'inferred' | 'default';

export interface Assumed<T> {
  value: T;
  provenance: Provenance;
  /** Shown on the chip: "typical for packaged food". */
  basis?: string;
}

export const stated = <T>(value: T): Assumed<T> => ({ value, provenance: 'stated' });
export const inferred = <T>(value: T, basis: string): Assumed<T> => ({ value, provenance: 'inferred', basis });

export interface AttachedFile {
  id: string;
  filename: string;
  /** A picture of a layout is a document, not a model — it unlocks nothing downstream. */
  kind: 'layout_pdf' | 'layout_dwg' | 'layout_image' | 'photo' | 'other';
  sizeBytes: number;
}

export interface Requirement {
  id: string;
  /** Set while anonymous so a closed tab does not destroy the work. */
  anonymousToken?: string;
  claimedByOrgId?: string;

  services: ServiceKind[];
  mode: KnowledgeMode;
  location: SiteLocation;

  /** What they store — drives weight and dimension inference. */
  commodity?: string;

  palletPositions?: Assumed<number>;
  buildingLengthFt?: Assumed<number>;
  buildingWidthFt?: Assumed<number>;
  buildingAreaSqFt?: Assumed<number>;
  clearHeightFt?: Assumed<number>;

  palletDepthIn?: Assumed<number>;
  palletWidthIn?: Assumed<number>;
  palletLoadHeightIn?: Assumed<number>;
  palletWeightLb?: Assumed<number>;

  rackTypeIfKnown?: string;
  material: MaterialPreference;
  targetDate?: string;

  files: AttachedFile[];
  /** Present only if they went through the optional sizing sheet. */
  sizingResult?: unknown;

  createdAt: string;
  updatedAt: string;
}

export type CompletenessBand = 'outline' | 'workable' | 'full';

export interface Completeness {
  /** 0–5, rendered as dots in the provider inbox. */
  score: number;
  band: CompletenessBand;
  /** True once a provider could decide whether to bid. */
  biddable: boolean;
  missingForBid: string[];
  missingForFull: string[];
}
