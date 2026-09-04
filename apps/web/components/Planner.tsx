'use client';

import { memo, useId, useState, Fragment, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';
import type { Bom as BomData, Flag, Orientation, TruckKind } from '@trace/rack-engine';
import PlanFigure from './planner/PlanFigure';
import ElevationFigure from './planner/ElevationFigure';
import { CantileverPlanFigure, CantileverElevationFigure } from './planner/CantileverFigures';
import MixedPlanFigure from './planner/MixedPlanFigure';
import { FIG_BOX, planBox, elBox } from './planner/figText';
import { cx } from '@/lib/cx';
import {
  usePlannerModel,
  type ColumnsMode, type PlannerHandoff, type TypeCell,
} from '@/lib/usePlannerModel';
import { BUILDING_FT, type MixedPriority } from '@trace/rack-engine';

export type { PlannerHandoff } from '@/lib/usePlannerModel';

/** Segmented options, hoisted so the JSX carries no type assertions. */
const COLUMNS_OPTIONS: readonly (readonly [ColumnsMode, string])[] = [
  ['grid', 'Grid'], ['later', 'Later'],
];
const PRIORITY_OPTIONS: readonly (readonly [MixedPriority, string])[] = [
  ['cantilever', 'Cantilever first'], ['pallets', 'Pallets first'],
];
const STORING_OPTIONS: readonly (readonly ['pallets' | 'long' | 'both', string])[] = [
  ['pallets', 'Pallets'], ['long', 'Long'], ['both', 'Both'],
];
const ROWS_RUN_OPTIONS: readonly (readonly [Orientation, string])[] = [
  ['length', '↔'], ['width', '↕'],
];

/**
 * A3 — the rack sizing sheet.
 *
 * Built to docs/a3-sizing-sheet.html, the approved design for this screen: a
 * masthead, the schedule as one horizontal band of numbered groups, both
 * drawings side by side on graph paper, and the type comparison below them
 * rather than floating over the plan it is meant to describe.
 *
 * Every number comes from `@trace/rack-engine` through `usePlannerModel`.
 */
export default function Planner({ handoff = {} }: { handoff?: PlannerHandoff }) {
  const m = usePlannerModel(handoff);
  const isLong = m.family === 'long';
  const isMixed = m.family === 'both';
  // A mixed sheet asks the cantilever questions as well as the pallet ones.
  const asksCant = isLong || isMixed;
  const asksPallet = !isLong;
  const { spec, layout, runs, mixed, building } = m;

  const blocking = m.flags.filter((f) => f.severity === 'blocking').length;
  const checks = m.flags.filter((f) => f.severity === 'check').length;
  const notes = m.flags.filter((f) => f.severity === 'opportunity').length;

  return (
    <div className="a3">
      <header className="tbar"><div className="wrap">
        <div className="tcell"><div className="logo"><b />TRACE</div></div>
        <div className="tcell"><span className="k">Sheet</span><span className="v">Rack sizing / preliminary</span></div>
        <div className="tcell hide-sm"><span className="k">Units</span><span className="v">Imperial</span></div>
        <div className="tcell hide-sm"><span className="k">Flags</span><span className="v mono">{m.flags.length}</span></div>
        <div className="tcell"><span className="k">Rev</span><span className="v mono">A</span></div>
      </div></header>

      <div className="wrap">
        <section className="mast">
          <h1>What racking<br />does this building<i>actually need?</i></h1>
          <p className="say">
            Pallet width and beam length set how many pallets sit in a bay. Load height and frame
            height set the levels. How you pick sets which rack types your stock even allows.
            Fill the schedule — both drawings redraw as you go.
          </p>
          <div className="rulerow"><span>Figs. 1–2</span><span className="ln" /><span>Live</span></div>
        </section>

        <section className="sheet">
          <div className="band top">
            <div className="grp">
              <GroupTitle no="01" name="Building" note="the box you are filling" />
              <div className="fields">
                {/* Held to the planner's range on blur, so a customer typing
                    900 sees the figure settle to 750 with a flag saying why —
                    rather than the box fighting them as they type. */}
                <NumField label="Length" value={building.lengthFt} onChange={m.onBuilding.lengthFt}
                  min={BUILDING_FT.min} max={BUILDING_FT.max} step={5} wide />
                <NumField label="Width" value={building.widthFt} onChange={m.onBuilding.widthFt}
                  min={BUILDING_FT.min} max={BUILDING_FT.max} step={5} wide />
                <NumField label="Clear ht" value={building.clearHeightFt} onChange={m.onBuilding.clearHeightFt} min={10} />
                <Seg label="Sprinklers" value={m.sprinklers} onChange={m.setSprinklers}
                  options={[['ceiling', 'Ceiling'], ['in-rack', 'In-rack']] as const} />
                {/* A footprint is not a storage area: staging, shipping, offices
                    and charging take a fifth to a third of it. */}
                {/* One control: the percentages a customer can estimate, and an
                    area for the one who has measured it. */}
                <SelectField label="Available for rack %"
                  value={m.building.available === 'area' ? 'area' : String(m.building.availablePct)}
                  onChange={(v) => (v === 'area' ? m.setAvailable('area')
                    : m.setAvailablePct(Number(v)))}
                  options={[
                    ...m.availablePcts.map((n) => [String(n), `${n}%`] as const),
                    ['area', 'Enter area'] as const,
                  ]} roomy />
                {m.building.available === 'area' && (
                  <NumField label="Usable sq ft" value={m.building.usableSqFt}
                    onChange={m.setUsableSqFt} min={500} step={500} wide />
                )}
                {/* Columns are the constraint the layout is designed around,
                    not a deduction applied to a finished one. */}
                <Seg label="Columns" value={m.building.columns}
                  onChange={m.setColumnsMode} options={COLUMNS_OPTIONS} />
                {m.building.columns === 'grid' && (
                  <>
                    <NumField label="Grid X ft" value={m.building.gridXFt}
                      onChange={m.setGridXFt} min={8} step={1} narrow />
                    <NumField label="Grid Y ft" value={m.building.gridYFt}
                      onChange={m.setGridYFt} min={8} step={1} narrow />
                  </>
                )}
              </div>
            </div>

            <div className="grp">
              <GroupTitle no="02"
                name={isMixed ? 'Stored goods' : isLong ? 'Cantilever' : 'Pallet'}
                note={isMixed ? 'pallets and long stock'
                  : isLong ? 'what you are storing on it' : 'sets beam length and capacity'} />

              {/* Split by family the way 03 is: a pallet customer has no use for
                  a product length, and a long-goods one has none for a pallet. */}
              {asksPallet && (
                <>
                  {isMixed && <div className="subhead">Pallet</div>}
                  <div className="fields">
                    <NumField label="Depth" value={m.pallet.depthIn} onChange={m.onPallet.depthIn} min={24} />
                    <NumField label="Width" value={m.pallet.widthIn} onChange={m.onPallet.widthIn} min={24} />
                    <NumField label="Load ht" value={m.pallet.loadHeightIn} onChange={m.onPallet.loadHeightIn} min={12} />
                    <NumField label="Weight lb" value={m.pallet.weightLb} onChange={m.onPallet.weightLb} min={100} step={50} wide />
                  </div>
                </>
              )}

              {asksCant && (
                <>
                  {isMixed && <div className="subhead">Cantilever</div>}
                  <div className="fields">
                    <NumField label="Product ft" value={m.cant.productLengthFt}
                      onChange={m.onCant.productLengthFt} min={m.productFt.min}
                      max={m.productFt.max} fallback={m.productFt.fallback} wide />
                    {/* Rows follow from this: a customer knows how much stock
                        they have, not how many rows it takes. */}
                    <NumField label="Linear ft needed" value={m.cant.linearFeetNeededFt}
                      onChange={m.onCant.linearFeetNeededFt} min={50} step={50}
                      fallback={500} roomy />
                  </div>
                </>
              )}
            </div>

            <div className="grp">
              <GroupTitle no="03" name="Configuration" note="how it is laid out" />
              <div className="fields">
                <Seg label="Storing" value={m.family}
                  onChange={m.setFamily} options={STORING_OPTIONS} />
                <Seg label="Rows run" value={m.config.orientation} onChange={m.setOrientation}
                  options={ROWS_RUN_OPTIONS} />
                {/* Only a mixed floor has this problem: two families, one
                    width, and no way to give it to both. */}
                {isMixed && (
                  <Seg label="Priority" value={m.config.priority} onChange={m.setPriority}
                    options={PRIORITY_OPTIONS} />
                )}
                <StepperField label="Cross aisles" value={m.crossAisles}
                  auto={m.crossAislesAuto} min={0} max={6} onChange={m.setCrossAisles} />
              </div>
              {/* Fire code is the AHJ's call, not ours: Trace names the reading
                  it worked from so a customer can disagree with it knowingly. */}
              <p className="fieldnote">
                A continuous rack row longer than about 100 ft usually needs a cross aisle for
                circulation and egress. Fire code requirements vary by jurisdiction, commodity
                and storage height — confirm with your dealer.
              </p>

              {asksPallet && (
                <>
                  <div className="subhead">Pallet racking</div>
                  <div className="fields">
                    {/* "AISLE: 12.5" means nothing to somebody who has never
                        specified racking; everybody knows their truck, and the
                        truck is what decides the aisle. */}
                    <SelectField label="Forklift" value={m.config.truck}
                      onChange={(v) => m.setTruck(v as TruckKind)}
                      options={m.truckOptions} roomy />
                    {/* A drive-in lane has no beam across it — the pallet rests
                        on rails along the uprights, because a beam would be in
                        the truck path. So there is nothing to ask. */}
                    {!m.type.onePalletLanes && (
                      <SelectField label="Beam" value={String(m.config.beamIn)}
                        onChange={(v) => m.setBeamIn(Number(v))}
                        options={m.beamOptions.map((b) => [String(b), `${b} in`] as const)} combo />
                    )}
                    {/* Lane and cart depth is the building's answer, not a
                        question: an input let someone ask for a lane deeper
                        than the floor can hold. It is derived and reported. */}
                  </div>
                </>
              )}

              {asksCant && (
                <>
                  <div className="subhead">Cantilever</div>
                  <div className="fields">
                    {/* Arm levels are a consequence of this and the clear
                        height, so the spacing is asked for and the levels
                        are reported. */}
                    <SelectField label="Arm spacing in" value={String(m.cant.armSpacingIn)}
                      onChange={(v) => m.onCant.armSpacingIn(Number(v))}
                      options={m.armSpacingOptions.map((a) => [String(a), `${a} in`] as const)} combo />
                  </div>
                </>
              )}
            </div>
          </div>

          {m.fromFinder && (
            <p className="fromfinder">
              <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="8.6" />
              </svg>
              <span>
                Starting from your rack finder answers — <b>{isLong ? `Cantilever racking` : `${m.type.name} rack`}</b>
                {m.matchPct && <i>{m.matchPct}% match</i>}.{isLong ? " Set the arms and sides above." : " Try any other type below to compare."}
              </span>
            </p>
          )}

          <div className="stage">
            {/* A plan is a landscape box and an elevation a portrait one, so a
                row holding one of each divides its width between them in
                proportion to their shapes. Three drawings will not go that way
                — the plan would have to give up nearly half the row, and its
                height collapses when it does. So a mixed floor gives the plan a
                row of its own and puts the two elevations on the next. */}
            {/* One row, whatever is being stored. A plan and the elevation it
                belongs with have to be read together, and a second row puts one
                of them off the screen. Widths follow the drawings' own shapes,
                so each fills its box and none of them is letterboxed. */}
            <div className="figs">
              {isMixed ? (
                <MixedPlanFigure mixed={mixed} kind={m.kind} box={planBox(true)}
                  head={<PlanHead lengthFt={building.lengthFt} widthFt={building.widthFt} />}
                  buildingLengthFt={building.lengthFt} buildingWidthFt={building.widthFt}
                  frameDepthIn={spec.frameDepthIn} flueIn={layout.flueIn}
                  aisleFt={m.aisleFt} wallClearanceFt={m.wallClearanceFt}
                  orientation={m.config.orientation} boxClass="pl" />
              ) : isLong ? (
                <CantileverPlanFigure layout={runs} box={planBox()}
                  head={<PlanHead lengthFt={building.lengthFt} widthFt={building.widthFt} />}
                  buildingLengthFt={building.lengthFt} buildingWidthFt={building.widthFt}
                  aisleFt={m.aisleFt} wallClearanceFt={m.wallClearanceFt}
                  orientation={m.config.orientation} boxClass="pl" />
              ) : (
                <PlanFigure kind={m.kind} layout={layout} box={planBox()}
                  head={<PlanHead lengthFt={building.lengthFt} widthFt={building.widthFt} />}
                  gridLabel={m.building.columns === 'grid'
                    ? `COLUMN GRID ${m.building.gridXFt}′ × ${m.building.gridYFt}′` : undefined}
                  buildingLengthFt={building.lengthFt} buildingWidthFt={building.widthFt}
                  frameDepthIn={spec.frameDepthIn} flueIn={layout.flueIn}
                  aisleFt={m.aisleFt} wallClearanceFt={m.wallClearanceFt}
                  orientation={m.config.orientation} boxClass="pl" />
              )}

              {isMixed ? (
                <>
                  <ElevationFigure spec={spec} clearHeightFt={building.clearHeightFt}
                    palletWidthIn={m.pallet.widthIn} palletLoadHeightIn={m.pallet.loadHeightIn}
                    box={elBox(building.lengthFt, building.widthFt, true)} boxClass="el"
                    head={<ElHead title="Fig. 2 — Pallet bay"
                      sub={`${spec.palletsPerBay} pallets / bay`} />} />
                  <CantileverElevationFigure layout={mixed.strip} boxClass="el"
                    clearHeightFt={building.clearHeightFt}
                    box={elBox(building.lengthFt, building.widthFt, true)}
                    labelClearHeight={false}
                    head={<ElHead title="Fig. 3 — Cantilever tower"
                      sub={`${mixed.strip.levels} arm levels + base`} />} />
                </>
              ) : isLong ? (
                <CantileverElevationFigure layout={runs} boxClass="el"
                  clearHeightFt={building.clearHeightFt}
                  box={elBox(building.lengthFt, building.widthFt)}
                  head={<ElHead sub={`${runs.levels} arm levels + base · ${runs.armLengthIn} in arm`} />} />
              ) : (
                <ElevationFigure spec={spec} clearHeightFt={building.clearHeightFt} boxClass="el"
                  palletWidthIn={m.pallet.widthIn} palletLoadHeightIn={m.pallet.loadHeightIn}
                  palletDepthIn={m.pallet.depthIn}
                  lane={m.type.onePalletLanes} deep={layout.deep} openEnds={m.type.openEnds}
                  depthSection={m.type.depthSection}
                  box={elBox(building.lengthFt, building.widthFt)}
                  sub={m.type.onePalletLanes
                    ? `1 pallet / lane · ${layout.deep} deep`
                    : `${spec.palletsPerBay} pallets / bay`} />
              )}
            </div>
          </div>

          {m.types.length > 0 && <TypeRow cells={m.types} long={isLong} mixed={isMixed} />}
          <p className="typenote">{m.blurb}</p>

          <div className="summary">
            <div>
            <div className="placard">
              <div className="top">
                {isMixed ? 'MIXED CONFIGURATION — PRELIMINARY'
                  : isLong ? 'CANTILEVER CONFIGURATION — PRELIMINARY'
                  : 'RACK CONFIGURATION — PRELIMINARY'}
              </div>
              <div className="pgrid">
                {/* A figure keeps the mono; a word is set in the body face,
                    where it reads as an answer rather than a code sample. */}
                {m.placard.map((p) => (
                  <div key={p.k}>
                    <span>{p.k}</span>
                    <b className={cx(!/[0-9]/.test(p.v) && 'words')}>{p.v}</b>
                  </div>
                ))}
              </div>
              <p className="fine">
                PRELIMINARY SIZING ONLY. NOT A LOAD RATING. CAPACITIES TO BE CONFIRMED BY A
                QUALIFIED ENGINEER PRIOR TO INSTALLATION.
              </p>
            </div>
            </div>

            {/* The placard sets the height of this row. Everything in here is
                lifted out of the flow so it cannot push the row taller than the
                placard beside it — the column scrolls instead, which is what
                the count in the header is for. */}
            <div className="flagcol">
              <div className="flaginner">
              <div className="flagcount">
                <span>Blocking <b>{blocking}</b></span>
                <span>Check <b>{checks}</b></span>
                <span>Notes <b>{notes}</b></span>
              </div>
              {/* One column for everything Trace has to tell the customer: the
                  notes used to repeat the flags in a stack below the placard,
                  which read as two lists of the same thing. */}
              <div className="flags">
                {m.stripCost && (
                  <p className="stripcost" aria-live="polite">
                    The cantilever strip takes <b>{m.stripCost.widthFt.toFixed(1)} ft</b> of width
                    and costs about <b>{m.stripCost.positions.toLocaleString()} pallet positions</b>.
                    Without it the building would hold ~{m.stripCost.without.toLocaleString()}.
                  </p>
                )}
                {m.cantileverFill && <p className="colnote">{m.cantileverFill}</p>}
                {m.columnNote && <p className="colnote">{m.columnNote}</p>}
                {m.flags.length === 0 ? (
                  <p className="emptyflags">No flags — nothing here needs a second look.</p>
                ) : m.flags.map((f) => <FlagCard key={f.title} flag={f} />)}
                {m.tunnelNote && <p className="advice">{m.tunnelNote}</p>}
                {m.assumptions.length > 0 && (
                  <p className="assumed">
                    <b>Trace assumed:</b> {m.assumptions.join(' · ')}.{' '}
                    <b>Change any of these above.</b>
                  </p>
                )}
              </div>
              </div>
            </div>
          </div>
        </section>

        <BomPanel bom={m.bom} standard={m.standardBom} long={isLong} mixed={isMixed}
          mixedDealer={isMixed && !m.palletBomCountable ? m.type.name : undefined}
          capacity={isMixed
            ? `${mixed.pallets.positions.toLocaleString()} pallet positions · `
              + `~${mixed.strip.linearFt.toLocaleString()} linear ft`
            : isLong ? `~${runs.linearFt.toLocaleString()} linear ft`
            : `${layout.positions.toLocaleString()} pallet positions`}
          typeName={isMixed ? `Cantilever and ${m.type.name}` : isLong ? 'Cantilever' : m.type.name} />

        <footer>
          <div className="rulerow">
            <span>Trace — warehouse layout, procurement and lifecycle</span>
            <span className="ln" /><span>Rev A</span>
          </div>
          <p className="fine">
            Preliminary sizing guidance generated from the dimensions entered above. Not an
            engineered design and carries no load rating. Final beam and upright capacities,
            seismic bracing, base plate and anchor design, flue spacing, sprinkler clearance and
            egress routing must be determined by a qualified engineer and permitted with the local
            authority having jurisdiction.
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ── the schedule ──────────────────────────────────────────────────────── */

/** Fig. 1's heading. It rides inside the box the drawing sizes. */
function PlanHead({ lengthFt, widthFt }: { lengthFt: number; widthFt: number }) {
  return (
    <div className="fighead">
      <span className="t">Fig. 1 — Building plan</span>
      <span className="r mono">{lengthFt} × {widthFt} ft</span>
    </div>
  );
}

/** An elevation's heading. */
function ElHead({ title = 'Fig. 2 — Elevation, one bay', sub }: {
  title?: string; sub: string;
}) {
  return (
    <div className="fighead">
      <span className="t">{title}</span>
      <span className="r mono">{sub}</span>
    </div>
  );
}

function GroupTitle({ no, name, note }: { no: string; name: string; note: string }) {
  return (
    <div className="grptitle">
      <span className="no">{no}</span><h3>{name}</h3><span className="note">{note}</span>
    </div>
  );
}

/**
 * A bounded number field.
 *
 * Clearing the box used to send a zero, and a zero-foot product drew a run with
 * no towers and no overhang. So an unparseable box holds its own text and sends
 * nothing, and the value is clamped into range when the field is left — never
 * while it is being typed, or 4 could not be typed on the way to 40.
 */
const NumField = memo(function NumField({
  label, value, onChange, min, max, step = 1, wide, narrow, roomy, fallback, hint,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; wide?: boolean;
  /** For a label the standard width would clip. */
  roomy?: boolean;
  /** What the value ought to be, shown under the box rather than enforced. */
  hint?: string;
  /** A one- or two-digit count, which needs less room than a dimension. */
  narrow?: boolean;
  /** Where an empty or unreadable box lands on blur. Defaults to the minimum. */
  fallback?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const settle = () => {
    setDraft(null);
    const n = Number.parseFloat(shown);
    const safe = Number.isFinite(n) ? n : fallback ?? min ?? value;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, safe));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className={cx('f', wide && 'w4', narrow && 'w2', roomy && 'w5', hint && 'hashint')}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" value={shown} min={min} max={max} step={step}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={settle}
        onKeyDown={(e) => { if (e.key === 'Enter') settle(); }} />
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
});

/**
 * A figure Trace worked out, with a way to disagree.
 *
 * Not a plain number box: the customer is not being asked for this, they are
 * being shown what was assumed and given the means to override it. So it reads
 * as a figure first, carries an `auto` marker while it is still Trace's, and
 * offers the way back once it is not.
 */
function StepperField({ label, value, auto, min, max, onChange }: {
  label: string; value: number; auto: boolean; min: number; max: number;
  onChange: (v: number | undefined) => void;
}) {
  const id = useId();
  const step = (by: number) => onChange(Math.max(min, Math.min(max, value + by)));
  return (
    <div className="f w5 stepfield">
      <label htmlFor={id}>{label}</label>
      <div className="step">
        <button type="button" onClick={() => step(-1)} disabled={value <= min}
          aria-label={`One fewer ${label.toLowerCase()}`}>&#8722;</button>
        <output id={id}>{value}</output>
        <button type="button" onClick={() => step(1)} disabled={value >= max}
          aria-label={`One more ${label.toLowerCase()}`}>+</button>
      </div>
      {auto
        ? <span className="auto">auto</span>
        : <button type="button" className="reauto" onClick={() => onChange(undefined)}>reset</button>}
    </div>
  );
}

/** A derived figure: shown so the customer knows it exists, never edited. */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="f">
      <label htmlFor={id}>{label}</label>
      <output id={id} className="ro">{value}</output>
    </div>
  );
}

function SelectField<T extends string>({
  label, value, onChange, options, combo, roomy,
}: {
  label: string; value: T; onChange: (v: T) => void;
  options: readonly (readonly [T, string])[]; combo?: boolean;
  /** For a label or an option that will not fit the standard select. */
  roomy?: boolean;
}) {
  const id = useId();
  return (
    <div className={cx('f', combo && 'wcombo', roomy && 'w5')}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
}

function Seg<T extends string>({
  label, value, onChange, options,
}: {
  label: string; value: T; onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  // A div and a span, not a fieldset and a legend: the sheet's .f is a flex
  // column and a legend breaks out of it, drawing its own box across the field.
  return (
    <div className="f w">
      <span className="lbl">{label}</span>
      <div className="segs" role="group" aria-label={label}>
        {options.map(([v, t]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>
        ))}
      </div>
    </div>
  );
}

/* ── comparison, flags, bill of materials ──────────────────────────────── */

/**
 * The only way to change type, now that the duplicate select is gone — so it
 * carries a heading, reads as a control, and moves under the arrow keys.
 */
const TypeRow = memo(function TypeRow(
  { cells, long, mixed }: { cells: readonly TypeCell[]; long: boolean; mixed?: boolean },
) {
  const rowRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = cells.length - 1;
    const current = cells.findIndex((c) => c.selected);
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
    cells[next]?.onSelect();
    rowRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }, [cells]);

  return (
    <>
      <div className="typehead">
        {long ? 'System · rough linear feet' : 'Rack type · rough pallet positions'}
        {mixed && <i> — with the cantilever strip in place</i>}
      </div>
      <div className={cx('typerow', long ? 'five' : 'six')} ref={rowRef} onKeyDown={onKeyDown}
        role="group" aria-label={long ? 'Long-goods systems compared' : 'Rack types compared'}>
        {cells.map((cell, i) => (
          <button key={cell.key} type="button" className="tcellopt" aria-pressed={cell.selected}
            tabIndex={cell.selected || (i === 0 && !cells.some((c) => c.selected)) ? 0 : -1}
            onClick={cell.onSelect}>
            <span className="nm">{cell.name}{cell.densest && <em className="most">most</em>}</span>
            <span className="ct">~{cell.capacity.toLocaleString()}{cell.unit && ` ${cell.unit}`}</span>
            <span className="dl">
              {cell.isBaseline ? 'baseline' : `${cell.deltaPct > 0 ? '+' : ''}${cell.deltaPct}% vs baseline`}
            </span>
            <span className="tr">{cell.tags.map((t) => <i key={t}>{t}</i>)}</span>
          </button>
        ))}
      </div>
    </>
  );
});

const FlagCard = memo(function FlagCard({ flag }: { flag: Flag }) {
  const cls = flag.severity === 'blocking' ? 'flag'
    : flag.severity === 'check' ? 'flag warn' : 'flag note';
  return (
    <div className={cls}>
      <b>{flag.title}<i>{flag.category}</i></b>
      {flag.detail}
    </div>
  );
});

/**
 * Collapsed by default. Where the material is not frames, beam pairs and wire
 * decks, a counted bill would be misleading, so that type gets the dealer
 * hand-off instead of a table.
 */
const BomPanel = memo(function BomPanel({
  bom, standard, long, mixed, capacity, typeName, mixedDealer,
}: {
  bom: BomData; standard: boolean; long: boolean; capacity: string; typeName: string;
  /** Two families in one bill, filed under a heading each. */
  mixed?: boolean;
  /** Mixed sheets whose pallet type has no countable bill: named here. */
  mixedDealer?: string;
}) {
  const [open, setOpen] = useState(false);
  const seen = new Set<string>();

  const csv = () => {
    const rows = [
      ['Group', 'Item', 'Description', 'Qty', 'Unit lb', 'Total lb'],
      ...bom.lines.map((l) => [l.group, l.item, l.description, l.qty, l.unitWeightLb, Math.round(l.totalWeightLb)]),
      ['', 'Total', '', '', '', Math.round(bom.totalWeightLb)],
    ];
    const body = rows.map((r) => r.map((c) => {
      const v = String(c);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-bom-${typeName.toLowerCase().replace(/\W+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bom">
      <div className="bomhead">
        {/* The whole row is the control, not just the chevron — a 26px target
            for a panel this size read as decoration. A native button carries
            Enter and Space for free. */}
        <button type="button" className="bomtog" aria-expanded={open}
          onClick={() => setOpen((v) => !v)}>
          <span className="tog" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </span>
          <h2>Bill of materials</h2>
          <span className="sub">Counted from Fig. 1 as drawn · {capacity}</span>
        </button>
        {standard && (
          <button type="button" className="csv"
            onClick={(e) => { e.stopPropagation(); csv(); }}>Download CSV</button>
        )}
      </div>

      {!standard ? (
        <div className="dealer">
          <b>{typeName} is not a frames-and-beams system</b>
          <p>
            Its material is rails, carts or rollers rather than upright frames, beam pairs and
            wire decks, so a counted bill of materials would be misleading here. A dealer quotes
            this from the layout above.
          </p>
          <button type="button">Send this sheet to a dealer</button>
        </div>
      ) : open ? (
        <>
          <table className="bomt">
            <thead>
              <tr><th>Item</th><th className="q">Qty</th><th className="w">Unit lb</th><th className="w">Total lb</th></tr>
            </thead>
            <tbody>
              {bom.lines.map((l) => {
                const first = !seen.has(l.group);
                if (first) seen.add(l.group);
                return (
                  <Fragment key={`${l.group}-${l.item}`}>
                    {first && <tr className="grp"><td colSpan={4}>{l.group}</td></tr>}
                    <tr>
                      <td>{l.item}<span className="d">{l.description}</span></td>
                      <td className="q">{l.qty.toLocaleString()}</td>
                      <td className="w">{l.unitWeightLb.toLocaleString()}</td>
                      <td className="w">{Math.round(l.totalWeightLb).toLocaleString()}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td className="q" /><td className="w" />
                <td className="w">{Math.round(bom.totalWeightLb).toLocaleString()}</td></tr>
            </tfoot>
          </table>
          <div className="bomfoot">
            <div><div className="k">Capacity</div><div className="v">{capacity.replace('~', '')}</div></div>
            <div><div className="k">Line items</div><div className="v">{bom.lines.length}</div></div>
            <div><div className="k">Steel weight</div><div className="v">{Math.round(bom.totalWeightLb).toLocaleString()}</div></div>
            <div><div className="k">Truckloads approx</div><div className="v">{bom.truckloads}</div></div>
          </div>
          {mixedDealer && (
            // The cantilever parts are countable even where the pallet type's
            // are not, so the table stays and the hand-off joins it.
            <div className="dealer">
              <b>{mixedDealer} is not a frames-and-beams system</b>
              <p>
                The cantilever strip above is counted, but this pallet type&#39;s material is
                rails, carts or rollers rather than upright frames, beam pairs and wire decks,
                so a counted bill for it would be misleading. A dealer quotes that half from the
                layout above.
              </p>
              <button type="button">Send this sheet to a dealer</button>
            </div>
          )}
          <p className="bomnote">
            {mixed ? (
              <>
                Counted from Fig. 1 as drawn — two families, two sections, one total. The
                cantilever strip takes a base per armed face and holds product on the base as
                well as on every arm; the pallet racking takes N+1 upright frames for a row of N
                bays, and its floor level carries no beams or decking.{' '}
                <b>Quantities are ours; capacities are the dealer&#39;s.</b> Unit weights are
                typical figures for sizing freight only.
              </>
            ) : long ? (
              <>
                Counted from the runs as drawn — change any input above and this recounts.
                A base per armed face and two anchors per tower, arms are towers times arm levels
                times sides, and brace sets step with the tower height. Product rests on the base
                as well as on the arms, so the capacity counts one level more than there are
                arms.{' '}
                <b>Quantities are ours; capacities are the dealer&#39;s.</b> Arm capacity comes
                from the manufacturer&#39;s chart for a given profile, arm length and deflection
                limit, and the tower section size comes from the same chart. Nothing here rates
                the steel.
              </>
            ) : (
              <>
                Counted from the layout as drawn — change any input above and this recounts. A row
                of N bays takes N+1 upright frames, beams are supplied in pairs, and the floor
                level carries no beams or decking. Unit weights are typical figures for sizing
                freight only; confirm against your supplier&#39;s catalogue before ordering.
              </>
            )}
          </p>
        </>
      ) : null}
    </section>
  );
});
