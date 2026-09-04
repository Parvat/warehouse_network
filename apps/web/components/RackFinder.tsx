'use client';

import Link from 'next/link';
import {
  memo, useCallback, useId, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  DepthBand, RotationNeed, SkuBand, Throughput, TruckKind,
} from '@trace/rack-engine';
import { cx } from '@/lib/cx';
import { useDismissable } from '@/lib/useDismissable';
import type {
  GoodsKind, PalletDraft, PalletField, RackFinderModel, Recommendation,
} from '@/lib/useRackFinder';

export interface Choice<T extends string> {
  value: T;
  label: string;
  note?: string;
}

/** Question one. Long products are not a kind of pallet rack. */
const GOODS: readonly Choice<GoodsKind>[] = [
  { value: 'pallets', label: 'Palletized goods', note: 'cases, bags, drums on pallets' },
  { value: 'long', label: 'Long products', note: 'pipe, tube, bar, lumber, sheet' },
  { value: 'both', label: 'Both', note: 'long stock and pallets in one building' },
];

const SKU: readonly Choice<SkuBand>[] = [
  { value: 'few', label: 'Under 10' }, { value: 'some', label: '10–50' },
  { value: 'many', label: '50–200' }, { value: 'lots', label: '200+' },
  { value: 'unknown', label: 'Not sure' },
];
const DEPTH: readonly Choice<DepthBand>[] = [
  { value: '1', label: '1–2' }, { value: '3', label: '3–5' }, { value: '6', label: '6–10' },
  { value: '10', label: '10+' }, { value: 'unknown', label: 'Not sure' },
];
const ROT: readonly Choice<RotationNeed>[] = [
  { value: 'fifo', label: 'Yes, oldest first', note: 'dated or lot-traced' },
  { value: 'any', label: 'No, any order is fine' },
  { value: 'unknown', label: 'Not sure' },
];
const FLOW: readonly Choice<Throughput>[] = [
  { value: 'low', label: 'A few pallets', note: 'under 20 a day' },
  { value: 'mid', label: 'Steady', note: '20–100 a day' },
  { value: 'high', label: 'Busy', note: '100+ a day' },
  { value: 'unknown', label: 'Not sure' },
];
const TRUCK: readonly Choice<TruckKind>[] = [
  { value: 'counterbalance', label: 'Sit-down counterbalance', note: 'needs 12 ft aisles' },
  { value: 'reach', label: 'Reach truck', note: 'works at 9 ft' },
  { value: 'vna', label: 'Turret or VNA', note: 'works at 6 ft' },
  { value: 'none', label: 'None yet', note: 'buying with the racking' },
];

const PALLET_DIMS: readonly { field: PalletField; label: string; unit: string }[] = [
  { field: 'depth', label: 'Depth', unit: 'in' },
  { field: 'width', label: 'Width', unit: 'in' },
  { field: 'loadHeight', label: 'Loaded ht', unit: 'in' },
  { field: 'weight', label: 'Weight', unit: 'lb' },
];

/**
 * A benefit as a two-tier cell: a short bold label and one line under it.
 *
 * Keyed on the engine's own benefit string, so the engine stays the single
 * source of which benefits a type has — this only decides how each is set on
 * two lines. Splitting mechanically was tried and abandoned: "Direct access
 * to" / "every pallet" cuts mid-phrase and reads worse than the sentence did.
 * Anything without an entry falls back to a comma split, then to the whole
 * string as the label, so a new benefit in the engine still renders.
 */
const BENEFIT_COPY: Record<string, { label: string; caption: string }> = {
  // selective
  'Direct access to every pallet':
    { label: 'Direct access', caption: 'Every pallet, without moving another' },
  'Works with standard sit-down trucks':
    { label: 'Standard trucks', caption: 'Works with a sit-down counterbalance' },
  'Cheapest per frame, easy to expand':
    { label: 'Cheapest per frame', caption: 'Easy to expand a bay at a time' },
  'Copes with heavy daily traffic':
    { label: 'Heavy daily traffic', caption: 'Copes with constant movement' },

  // double-deep
  'A third more pallets than selective':
    { label: 'A third more pallets', caption: 'Than selective, same building' },
  'Half the aisles, more floor for stock':
    { label: 'Half the aisles', caption: 'More floor goes to stock' },
  'Needs a double-reach truck':
    { label: 'Double-reach truck', caption: 'Needed to reach the back pallet' },
  'One pallet sits behind another':
    { label: 'Two deep', caption: 'One pallet sits behind another' },

  // push-back
  'Carts nest two to six deep per lane':
    { label: 'Nesting carts', caption: 'Two to six deep per lane' },
  'Loaded and picked from one aisle':
    { label: 'One aisle', caption: 'Loaded and picked from the same face' },
  'Much faster to fill than drive-in':
    { label: 'Fast to fill', caption: 'Much faster than drive-in' },
  'Newest pallet comes out first':
    { label: 'Last in, first out', caption: 'Newest pallet comes out first' },

  // drive-in
  'The most pallets per square foot':
    { label: 'Most per square foot', caption: 'The densest option there is' },
  'Truck drives into the lane':
    { label: 'Truck enters the lane', caption: 'No aisle between every row' },
  'Impact damage is common in lanes':
    { label: 'Impact damage', caption: 'Common inside the lanes' },
  'Best where few products dominate':
    { label: 'Few products', caption: 'Best where a few dominate' },

  // drive-through
  'Dense storage that still rotates':
    { label: 'Dense and rotating', caption: 'Storage that still runs oldest first' },
  'Loaded one end, picked the other':
    { label: 'Loaded one end', caption: 'Picked from the other' },
  'Needs clear aisles at both ends':
    { label: 'Aisles at both ends', caption: 'Needs clear floor at each end' },
  'Fewer pick faces than selective':
    { label: 'Fewer pick faces', caption: 'Slower where traffic is heavy' },

  // pallet flow
  'Gravity carries pallets to the picker':
    { label: 'Gravity fed', caption: 'Pallets travel to the picker' },
  'Deep lanes with true rotation':
    { label: 'Deep lanes', caption: 'With true oldest-first rotation' },
  'Highest throughput when dense':
    { label: 'Highest throughput', caption: 'When storage is dense' },
  'The most expensive per position':
    { label: 'Highest cost', caption: 'The most expensive per position' },

  // cantilever
  'Nothing blocks the front of the load':
    { label: 'Open front access', caption: 'Unobstructed loading' },
  'Arms adjust as your stock changes':
    { label: 'Adjustable arms', caption: 'Adapt as your stock changes' },
  'Handles mixed lengths in one run':
    { label: 'Mixed lengths', caption: 'Store different lengths in one run' },
  'Stores by linear foot, not by pallet':
    { label: 'Linear foot', caption: 'Maximise storage by the foot' },
};

function splitBenefit(benefit: string): { label: string; caption: string } {
  const given = BENEFIT_COPY[benefit];
  if (given) return given;

  const comma = benefit.indexOf(', ');
  if (comma > 0) {
    const tail = benefit.slice(comma + 2);
    return {
      label: benefit.slice(0, comma),
      caption: tail.charAt(0).toUpperCase() + tail.slice(1),
    };
  }
  return { label: benefit, caption: '' };
}

const Tick = () => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.6" /><path d="M9 12l2 2 4-4" />
  </svg>
);

const Arrow = () => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

/**
 * A2 — the rack finder wizard.
 *
 * Renders whatever the engine ranked; it decides nothing itself. Question one
 * gates the branch, because a pallet question asked about pipe is nonsense —
 * there is no pallet, so its depth, width and loaded height mean nothing.
 */
export default function RackFinder({ model }: { model: RackFinderModel }) {
  const {
    goods, showPallets, answers, pallet,
    palletStepFrom, palletDimsStep,
    ready, recommendation, alternatives, headlines, headlineIndex, stepHeadline,
    setGoods, onAnswer, onPallet, plannerHref,
  } = model;

  const steppable = headlines.length > 1;

  // Left and right step the panel while focus is anywhere inside it. The panel
  // holds no text input, so the arrows cannot be taken from something else.
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!steppable) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepHeadline(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepHeadline(1); }
  };

  return (
    <>
      <div className="lede">
        <h1>Which racking<br />suits your stock?</h1>
        <p>
          A few questions, about two minutes. No jargon, and nothing here needs an account —
          you will end up with a system, the reason for it, and dealers who supply it.
        </p>
      </div>

      <div className="grid">
        <section className="sheet" aria-label="Your answers">
          <Question step={1} field="goods"
            title="What do you need to store?"
            note="Long products are pipe, tube, bar, lumber and sheet — they are not stored on pallets, so they need different racking."
            choices={GOODS} value={goods} onPick={setGoods} />

          {showPallets && (
            <>
              <Question step={palletStepFrom} field="skuCount"
                title="How many different products do you store?"
                note="Distinct SKUs, not total pallets."
                choices={SKU} value={answers.skuCount} onPick={onAnswer.skuCount} />
              <Question step={palletStepFrom + 1} field="palletsPerSku"
                title="How many pallets of the same product?"
                note="The answer that decides most of it — whether stock can sit behind stock."
                choices={DEPTH} value={answers.palletsPerSku} onPick={onAnswer.palletsPerSku} />
              <Question step={palletStepFrom + 2} field="rotation"
                title="Does older stock have to leave first?"
                note="Dated food, pharmaceuticals or lot-traced parts usually do."
                choices={ROT} value={answers.rotation} onPick={onAnswer.rotation} />
              <Question step={palletStepFrom + 3} field="throughput"
                title="How much moves in and out each day?"
                note="Heavy traffic needs pick faces, which works against dense storage."
                choices={FLOW} value={answers.throughput} onPick={onAnswer.throughput} />
              <Question step={palletStepFrom + 4} field="truck"
                title="What forklifts do you have?"
                note="What you already own sets the narrowest aisle you can use."
                choices={TRUCK} value={answers.truck} onPick={onAnswer.truck} />

              <PalletRow step={palletDimsStep} pallet={pallet} onPallet={onPallet} />
            </>
          )}

        </section>

        <aside className="rail" aria-label="Recommendation">
          {/* Stepping swaps every field, so the whole panel is announced. */}
          <div className="res" aria-live="polite" onKeyDown={onPanelKey}>
            <h2 className="restag">
              <span className="restaglabel">Best fit for your stock</span>
              {ready && recommendation && (
                <span className={cx('resmatch', recommendation.score === null && 'words')}>
                  {recommendation.score !== null
                    ? `${recommendation.score}% match`
                    : 'Long products'}
                </span>
              )}
            </h2>

            <div className={cx('resart', !recommendation && 'empty')}>
              {recommendation ? (
                <>
                  <Caveat />
                  <Art rec={recommendation} />
                  {steppable && (
                    <div className="resnav" role="group"
                      aria-label={`Recommendation ${headlineIndex + 1} of ${headlines.length}`}>
                      <span className="respos" aria-hidden="true">
                        {headlineIndex + 1} / {headlines.length}
                      </span>
                      <button type="button" aria-label="Previous recommendation"
                        onClick={() => stepHeadline(-1)}>
                        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M15 6l-6 6 6 6" />
                        </svg>
                      </button>
                      <button type="button" aria-label="Next recommendation"
                        onClick={() => stepHeadline(1)}>
                        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="await">{emptyCopy(goods)}</p>
              )}
            </div>

            <div className="rescopy">
              <div className="restitle">
                <h3>{recommendation ? recommendation.name : 'Not yet'}</h3>
                {recommendation && <span className="badge">{recommendation.badge}</span>}
              </div>
              <p>{recommendation ? recommendation.blurb : emptyBlurb(goods)}</p>
              {recommendation?.note && <p className="resnote">{recommendation.note}</p>}

              <ul className="bens">
                {recommendation?.benefits.map((b) => {
                  const { label, caption } = splitBenefit(b);
                  return (
                    <li key={b}>
                      <Tick />
                      <span className="btxt">
                        <b>{label}</b>
                        {caption && <span className="cap"> · {caption}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <dl className="tiles">
                {(recommendation?.tiles ?? PLACEHOLDER_TILES).map((t) => (
                  <Tile key={t.k} k={t.k} v={t.v} />
                ))}
              </dl>
            </div>

            <div className="acts">
              <div className="actrow">
                <button className="btn" type="button">
                  Connect me with dealers
                  <Arrow />
                </button>
                <Link className="btn2" href={plannerHref}>
                  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" /><path d="M3 9h18M8 9v11" />
                  </svg>
                  Work out how much fits
                </Link>
              </div>
              <p className="trust">
                <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3l7 3v6c0 4.2-2.9 8-7 9-4.1-1-7-4.8-7-9V6z" /><path d="M9 12l2 2 4-4" />
                </svg>
                Vetted dealers who supply this type and cover your region.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {ready && alternatives.length > 0 && (
        <section className="alts" aria-labelledby="alts-head">
          <div className="altshead">
            <h2 id="alts-head">Also worth asking about
              <span className="hint">
                {goods === 'both'
                  ? 'both families — a building with pipe and pallets needs two systems'
                  : 'match figures are indicative — ask a dealer to confirm'}
              </span>
            </h2>
          </div>
          <div className="altrow" tabIndex={0} role="group" aria-label="Alternative systems">
            {alternatives.map((rec) => <AltCard key={`${rec.family}-${rec.kind}`} rec={rec} />)}
          </div>
        </section>
      )}
    </>
  );
}

const PLACEHOLDER_TILES = [
  { k: 'Capacity', v: '—' }, { k: 'Footprint', v: '—' },
  { k: 'Access', v: '—' }, { k: 'Suits', v: '—' },
] as const;

function emptyCopy(goods: GoodsKind | undefined): string {
  if (!goods) {
    return 'Start by telling us what you store — pallets and long products need completely different racking.';
  }
  if (goods === 'long') {
    return 'Answer how heavy one piece is, and whether it lives inside or out in the yard.';
  }
  return 'Answer how many pallets you hold of the same product, and whether older stock leaves first.';
}

function emptyBlurb(goods: GoodsKind | undefined): string {
  if (!goods) return 'A pallet rack and a cantilever rack have almost nothing in common — the first question decides which set applies.';
  if (goods === 'long') return 'Weight and weather decide most of it. Length and placement fine-tune the recommendation.';
  return 'Those two answers decide most of it. The rest fine-tune the recommendation.';
}

const Art = memo(function Art({ rec }: { rec: Recommendation }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={rec.art} alt={`${rec.name} racking`} />;
});

/* ── the wizard rows ──────────────────────────────────────────────────── */

interface QuestionProps<T extends string> {
  step: number;
  field: string;
  title: string;
  note: string;
  choices: readonly Choice<T>[];
  value: T | undefined;
  onPick: (value: T) => void;
}

/**
 * One question as a real radio group.
 *
 * Single-select from a set is a radiogroup, not a row of independent toggles,
 * so the arrow keys move between options and only the active one is a tab
 * stop. Memoised, and every `onPick` from the hook is stable, so answering the
 * last question does not re-render the ones above it.
 */
function QuestionInner<T extends string>({
  step, field, title, note, choices, value, onPick,
}: QuestionProps<T>) {
  const titleId = `q-${field}`;
  const noteId = `q-${field}-note`;
  const groupRef = useRef<HTMLDivElement>(null);
  const done = value !== undefined;

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = choices.length - 1;
    const current = choices.findIndex((c) => c.value === value);
    let next: number;

    switch (e.key) {
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      case 'ArrowRight': case 'ArrowDown':
        next = current < 0 || current === last ? 0 : current + 1; break;
      case 'ArrowLeft': case 'ArrowUp':
        next = current <= 0 ? last : current - 1; break;
      default: return;
    }

    e.preventDefault();
    const choice = choices[next];
    if (!choice) return;
    onPick(choice.value);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }, [choices, value, onPick]);

  return (
    <div className={cx('wq', done && 'done')}>
      <div className="wqL">
        <span className="wqi" aria-hidden="true">{step}</span>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p id={noteId}>{note}</p>
        </div>
      </div>
      <div className="opts" role="radiogroup" ref={groupRef} onKeyDown={onKeyDown}
        aria-labelledby={titleId} aria-describedby={noteId}>
        {choices.map((c, i) => {
          const selected = c.value === value;
          return (
            <button key={c.value} type="button" role="radio" className="opt"
              aria-checked={selected}
              tabIndex={selected || (!done && i === 0) ? 0 : -1}
              onClick={() => onPick(c.value)}>
              {c.label}{c.note && <small>{c.note}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** memo() erases the generic, so the original signature is restored by cast. */
const Question = memo(QuestionInner) as typeof QuestionInner;

const PalletRow = memo(function PalletRow({
  step, pallet, onPallet,
}: {
  step: number;
  pallet: PalletDraft;
  onPallet: Record<PalletField, (value: string) => void>;
}) {
  return (
    <div className="wq">
      <div className="wqL">
        <span className="wqi" aria-hidden="true">{step}</span>
        <div>
          <h2>Your pallets</h2>
          <p>Standard North American figures — change any that differ.</p>
        </div>
      </div>
      <div className="pfields">
        {PALLET_DIMS.map(({ field, label, unit }) => (
          <PField key={field} label={label} unit={unit}
            value={pallet[field]} onChange={onPallet[field]} />
        ))}
      </div>
    </div>
  );
});

const PField = memo(function PField({
  label, unit, value, onChange,
}: {
  label: string; unit: string; value: string; onChange: (value: string) => void;
}) {
  const id = useId();
  const unitId = `${id}-unit`;
  return (
    <div className="pf">
      <label htmlFor={id}>{label}</label>
      <div className="pfin">
        <input id={id} type="text" inputMode="decimal" value={value}
          aria-describedby={unitId}
          onChange={(e) => onChange(e.target.value)} />
        <span id={unitId}>{unit}</span>
      </div>
    </div>
  );
});

/* ── the result rail ──────────────────────────────────────────────────── */

/** Why the recommendation is a starting point. Opens on click, closes on Escape. */
function Caveat() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, triggerRef, panelRef);

  return (
    <span className="reswarn">
      <button ref={triggerRef} className="warnbtn" type="button"
        aria-expanded={open} aria-controls={panelId}
        aria-label="How reliable is this recommendation?"
        onClick={() => setOpen((v) => !v)}>
        <svg className="ic" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
          <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" />
        </svg>
      </button>
      <div ref={panelRef} id={panelId} className="warnpop" role="note" hidden={!open}>
        <b>A starting point, not a specification</b>
        <p>
          This comes from a handful of answers. Fire code, floor loading, seismic rules, your
          building and how you actually pick can all change it.
        </p>
        <p>A dealer or engineer confirms the type before anything is ordered.</p>
      </div>
    </span>
  );
}

/**
 * A spec figure. Mono is for measurements, so it is applied only where the
 * value actually carries a number — "48 in" and "4,000 lb" are figures,
 * "Linear foot" and "Set by clear height" are words and get the body face.
 */
const Tile = memo(function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div className="tile">
      <dt className="k">{k}</dt>
      <dd className={cx('v', /[0-9]/.test(v) && 'num')}>{v}</dd>
    </div>
  );
});

const AltCard = memo(function AltCard({ rec }: { rec: Recommendation }) {
  return (
    <article className="alt">
      <div className="altmain">
        <div className="altcopy">
          <h3>{rec.name}</h3>
          <span className="badge">{rec.badge}</span>
          <p>{rec.blurb}</p>
          <div className="rule" />
          <ul>{rec.benefits.map((b) => <li key={b}><Tick />{b}</li>)}</ul>
        </div>
        {/* Decorative — the system is already named in the heading above. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="altart"><img src={rec.art} alt="" /></div>
      </div>
      <div className="altfoot">
        <svg className="ic ic-lg ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 21V9l9-6 9 6v12" />
          <rect x="8" y="13" width="3" height="3" /><rect x="13" y="13" width="3" height="3" />
        </svg>
        <p><b>Best for:</b> {rec.bestFor}</p>
        <span className="more">{rec.score}% match
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </article>
  );
});
