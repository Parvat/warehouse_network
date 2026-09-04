'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  canRecommend, rankRackTypes, TRUCK_AISLE_FT,
  type RackAnswers, type RackKind, type RackScore,
} from '@trace/rack-engine';

/**
 * A2 wizard state, across both product families.
 *
 * Holds no arithmetic of its own — ranking and the aisle table come from
 * `@trace/rack-engine`. What lives here is the part that is genuinely about
 * React: which answers have been given, stable handlers so the question rows
 * can memoise, and the query string that carries the result to the planner.
 */

/** Question one, the gate. Long products are not a kind of pallet rack. */
export type GoodsKind = 'pallets' | 'long' | 'both';

export const PALLET_FIELDS_ORDER = [
  'skuCount', 'palletsPerSku', 'rotation', 'throughput', 'truck',
] as const;
export type WizardField = (typeof PALLET_FIELDS_ORDER)[number];

/** Pallet figures stay as typed text so a half-entered value is not clobbered. */
export interface PalletDraft {
  depth: string;
  width: string;
  loadHeight: string;
  weight: string;
}
export type PalletField = keyof PalletDraft;

/** Standard North American figures — the customer changes any that differ. */
const DEFAULT_PALLET: PalletDraft = {
  depth: '48', width: '40', loadHeight: '60', weight: '2000',
};

/** Assumed until the truck question is answered, ft. Matches a sit-down. */
const DEFAULT_AISLE_FT = TRUCK_AISLE_FT.counterbalance;

type AnswerHandlers = {
  [K in WizardField]-?: (value: NonNullable<RackAnswers[K]>) => void;
};
type PalletHandlers = Record<PalletField, (value: string) => void>;

/** One spec figure on the result card. The four differ by family. */
export interface SpecTile {
  k: string;
  v: string;
}

/**
 * A recommendation, flattened so one card component renders either family
 * from one photograph and one set of copy.
 */
export interface Recommendation {
  family: 'pallets' | 'long';
  kind: string;
  name: string;
  badge: string;
  blurb: string;
  bestFor: string;
  benefits: readonly string[];
  /** Null where nothing was scored, so no figure may be shown. */
  score: number | null;
  art: string;
  /** Muted line under the blurb, where one is needed. */
  note?: string;
  tiles: readonly SpecTile[];
}

/** Identity of one recommendation, for excluding it from the strip below. */
export const recKey = (r: Recommendation): string => `${r.family}:${r.kind}`;

/** Local file per pallet type. Double-deep has no render yet. */
const ART: Record<RackKind, string> = {
  selective: '/racks/selective.png',
  doubledeep: '/racks/selective.png',
  pushback: '/racks/push-back.png',
  drivein: '/racks/drive-in.png',
  drivethru: '/racks/drive-through.png',
  flow: '/racks/pallet-flow.png',
};

/**
 * The one long-products answer.
 *
 * Not ranked, and not asked about. Pipe, tube, bar, lumber and sheet go on
 * cantilever racking — that is what it is for, so there was never a decision
 * for the customer to make. Which cantilever follows from the loads, and that
 * is a dealer's call once the job is real. The engine keeps all five variants
 * and their scoring for the planner and for a dealer-facing screen later; the
 * finder simply stops asking.
 *
 * `score` is null on purpose: nothing was scored, so any percentage here would
 * be invented.
 */
const CANTILEVER: Recommendation = {
  family: 'long',
  kind: 'cantilever',
  name: 'Cantilever racking',
  badge: 'Long products',
  blurb: 'Arms projecting from upright columns, with nothing across the front. '
    + 'The standard way to store pipe, tube, bar, lumber and sheet.',
  bestFor: 'Pipe, tube, bar, lumber, sheet and anything else too long for a pallet',
  benefits: [
    'Nothing blocks the front of the load',
    'Arms adjust as your stock changes',
    'Handles mixed lengths in one run',
    'Stores by linear foot, not by pallet',
  ],
  score: null,
  art: '/racks/cantilever.png',
  note: 'Which cantilever — roll-formed or structural, one side or both — depends on '
    + 'the weight and length of your stock. A dealer specifies that.',
  tiles: [
    { k: 'Stores by', v: 'Linear foot' },
    { k: 'Typical arms', v: '36–48 in' },
    { k: 'Levels', v: 'Set by clear height' },
    { k: 'Sides', v: 'One or both' },
  ],
};

const LANE_DEPTH: Record<RackKind, string> = {
  selective: '1 deep', doubledeep: '2 deep', pushback: '2–6 deep',
  drivein: 'up to 10', drivethru: 'up to 10', flow: '10–30',
};

const fromRack = (s: RackScore, aisleFt: number): Recommendation => ({
  family: 'pallets',
  kind: s.type.kind,
  name: `${s.type.name} Rack`,
  badge: s.type.badge,
  blurb: s.type.blurb,
  bestFor: s.type.bestFor,
  benefits: s.type.benefits,
  score: s.score,
  art: ART[s.type.kind],
  tiles: [
    { k: 'Lane depth', v: LANE_DEPTH[s.type.kind] },
    { k: 'Typical aisle', v: `${aisleFt} ft` },
    { k: 'Rotation', v: s.type.rotation },
    { k: 'Access', v: s.type.selectivity },
  ],
});

export interface RackFinderModel {
  goods: GoodsKind | undefined;
  showPallets: boolean;
  showLong: boolean;

  answers: RackAnswers;
  pallet: PalletDraft;

  /** Step numbers, contiguous for whichever branch is showing. */
  palletStepFrom: number;
  palletDimsStep: number;

  ready: boolean;
  /** Every headline the panel can step through. Pallets first. */
  headlines: readonly Recommendation[];
  headlineIndex: number;
  /** Wraps at both ends. No-op when there is only one headline. */
  stepHeadline: (delta: number) => void;
  recommendation: Recommendation | undefined;
  alternatives: readonly Recommendation[];
  aisleFt: number;

  answered: number;
  total: number;

  setGoods: (value: GoodsKind) => void;
  onAnswer: AnswerHandlers;
  onPallet: PalletHandlers;
  plannerHref: string;
}

export function useRackFinder(): RackFinderModel {
  const [goods, setGoodsState] = useState<GoodsKind | undefined>(undefined);
  const [answers, setAnswers] = useState<RackAnswers>({});
  const [pallet, setPallet] = useState<PalletDraft>(DEFAULT_PALLET);
  const [headlineIndex, setHeadlineIndex] = useState(0);

  // Built once. Every handler is referentially stable for the life of the
  // component, which is what lets the question rows skip re-rendering.
  const onAnswer = useMemo<AnswerHandlers>(() => ({
    skuCount: (v) => setAnswers((p) => ({ ...p, skuCount: v })),
    palletsPerSku: (v) => setAnswers((p) => ({ ...p, palletsPerSku: v })),
    rotation: (v) => setAnswers((p) => ({ ...p, rotation: v })),
    throughput: (v) => setAnswers((p) => ({ ...p, throughput: v })),
    truck: (v) => setAnswers((p) => ({ ...p, truck: v })),
  }), []);

  const onPallet = useMemo<PalletHandlers>(() => ({
    depth: (v) => setPallet((p) => ({ ...p, depth: v })),
    width: (v) => setPallet((p) => ({ ...p, width: v })),
    loadHeight: (v) => setPallet((p) => ({ ...p, loadHeight: v })),
    weight: (v) => setPallet((p) => ({ ...p, weight: v })),
  }), []);

  const setGoods = useMemo(() => (v: GoodsKind) => setGoodsState(v), []);

  const showPallets = goods === 'pallets' || goods === 'both';
  const showLong = goods === 'long' || goods === 'both';

  const rankedRack = useMemo(() => rankRackTypes(answers), [answers]);

  const palletReady = showPallets && canRecommend(answers);
  // Nothing to ask, so saying "long products" is already the whole answer.
  const longReady = showLong;
  const aisleFt = answers.truck ? TRUCK_AISLE_FT[answers.truck] : DEFAULT_AISLE_FT;

  /**
   * Every result the panel itself can show, pallets first — pallet racking is
   * usually the larger part of the building, so it leads.
   */
  const headlines = useMemo<Recommendation[]>(() => {
    const out: Recommendation[] = [];
    if (palletReady && rankedRack[0]) out.push(fromRack(rankedRack[0], aisleFt));
    if (longReady) out.push(CANTILEVER);
    return out;
  }, [palletReady, longReady, rankedRack, aisleFt]);

  // The list shrinks when the customer changes what they store, so the index is
  // wrapped on read rather than trusted — a stale index must not blank the panel.
  const safeIndex = headlines.length ? headlineIndex % headlines.length : 0;
  const recommendation = headlines[safeIndex];

  const stepHeadline = useCallback((delta: number) => {
    setHeadlineIndex((i) => {
      const n = headlines.length;
      return n > 1 ? (((i + delta) % n) + n) % n : 0;
    });
  }, [headlines.length]);

  /**
   * The strip is everything the panel cannot reach.
   *
   * Excluded by identity, not by index: once the panel steps through two
   * headlines, a `slice(1)` would still drop only the first and leak the
   * cantilever into the strip that is already on screen above it.
   */
  const alternatives = useMemo<Recommendation[]>(() => {
    const candidates: Recommendation[] = [];
    if (palletReady) candidates.push(...rankedRack.map((r) => fromRack(r, aisleFt)));
    if (longReady) candidates.push(CANTILEVER);

    const shown = new Set(headlines.map(recKey));
    return candidates
      .filter((c) => !shown.has(recKey(c)))
      .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  }, [palletReady, longReady, rankedRack, aisleFt, headlines]);

  const palletStepFrom = 2;
  const palletDimsStep = palletStepFrom + PALLET_FIELDS_ORDER.length;

  const answered = useMemo(() => {
    let n = goods ? 1 : 0;
    if (showPallets) n += PALLET_FIELDS_ORDER.reduce((c, f) => (answers[f] ? c + 1 : c), 0);
    return n;
  }, [goods, showPallets, answers]);

  // Long products add no questions, so the gate is the whole of that branch.
  const total = 1 + (showPallets ? PALLET_FIELDS_ORDER.length : 0);

  const plannerHref = useMemo(() => {
    if (!recommendation) return '/planner';
    // The actions below the panel apply to whichever headline is showing, so
    // the planner opens on that family. Every parameter is unchanged; only
    // which family `goods` names follows the panel when it can step.
    const q = new URLSearchParams({
      goods: headlines.length > 1 ? recommendation.family : (goods ?? 'pallets'),
      from: 'finder',
    });

    // Both families are carried when both are known, so the planner can switch
    // without sending the customer back through the wizard.
    if (palletReady && rankedRack[0]) {
      q.set('rack', rankedRack[0].type.kind);
      q.set('aisle', String(aisleFt));
      // the truck itself, not only the aisle it implies, so the planner opens
      // with the answer already given rather than asking it again
      if (answers.truck) q.set('truck', answers.truck);
      q.set('pd', pallet.depth);
      q.set('pw', pallet.width);
      q.set('plh', pallet.loadHeight);
      q.set('pwt', pallet.weight);
    }
    if (longReady) q.set('long', 'cantilever-rf');
    // Nothing scored the cantilever, so no figure is carried across for it.
    if (recommendation.score !== null) q.set('match', String(recommendation.score));
    return `/planner?${q.toString()}`;
  }, [recommendation, headlines.length, goods, palletReady, longReady, rankedRack, aisleFt, pallet, answers.truck]);

  return {
    goods, showPallets, showLong,
    answers, pallet,
    palletStepFrom, palletDimsStep,
    ready: palletReady || longReady,
    headlines, headlineIndex: safeIndex, stepHeadline,
    recommendation, alternatives, aisleFt,
    answered, total,
    setGoods, onAnswer, onPallet, plannerHref,
  };
}
