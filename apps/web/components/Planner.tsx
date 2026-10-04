'use client';

import { memo, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';
import type { Flag, Orientation, TruckKind } from '@trace/rack-engine';
import PlanFigure from './planner/PlanFigure';
import ElevationFigure from './planner/ElevationFigure';
import { CantileverPlanFigure, CantileverElevationFigure } from './planner/CantileverFigures';
import MixedPlanFigure from './planner/MixedPlanFigure';
import Assumptions from './planner/Assumptions';
import { FIG_BOX, planBox, elBox } from './planner/figText';
import { cx } from '@/lib/cx';
import {
  usePlannerModel,
  type PlannerHandoff, type TypeCell,
} from '@/lib/usePlannerModel';
import { BUILDING_FT, ftIn } from '@trace/rack-engine';


export type { PlannerHandoff } from '@/lib/usePlannerModel';

const STORING_OPTIONS: readonly (readonly ['pallets' | 'long' | 'both', string])[] = [
  ['pallets', 'Pallets'], ['long', 'Long'], ['both', 'Both'],
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

  /*
   * What this floor came to, in one line under the sheet.
   *
   * It read under Fig. 1, where it described the plan alone; it is about the
   * whole run, so it reads under the whole sheet. The figures are set bold and
   * the words that name them are not, because a reader scanning it is after
   * the numbers and the words are only there to say which number is which.
   */
  const n = (v: React.ReactNode, ...rest: React.ReactNode[]) => (
    <><b>{v}</b>{rest.length > 0 ? <> {rest}</> : null}</>
  );
  /*
   * The aisle width, said once for the floor rather than on every gap in the
   * plan, where it repeated one figure down the drawing and crowded the rows.
   * Read off the aisles the layout actually has — on a mixed floor the strip's
   * own, the one both zones share and the pallet zone's — so where they are not
   * all one width the strip gives the range. A floor of one row has no aisle,
   * and says nothing.
   */
  const aisleCell = (aislesFt: readonly number[]): React.ReactNode[] => {
    const widths = [...new Set(aislesFt.map((a) => +a.toFixed(1)))].sort((a, b) => a - b);
    const lo = widths[0], hi = widths[widths.length - 1];
    if (lo === undefined || hi === undefined) return [];
    return lo === hi
      ? [n(`${lo}′`, 'AISLE')]
      : [<><b>{lo}–{hi}′</b> AISLES</>];
  };
  const aisles = aisleCell(isMixed
    ? [...mixed.strip.aislesFt.map((a) => a.depth), mixed.sharedAisleFt,
      ...mixed.pallets.aislesFt.map((a) => a.depth)]
    : (isLong ? runs : layout).aislesFt.map((a) => a.depth));
  const runSummary: React.ReactNode[] = isLong
    ? [
      n(`${runs.productLengthFt}′`, 'PRODUCT'),
      <><b>{runs.towersPerRun}</b> TOWERS AT <b>{ftIn(runs.towerCentresFt)}</b></>,
      n(`${runs.overhangFt}′`, 'OVER EACH END'),
      n(runs.rows, runs.rows === 1 ? 'ROW' : 'ROWS'),
      n(runs.runsPerRow, 'RUNS/ROW'),
      n(runs.towersPerRun, 'TOWERS/RUN'),
      ...(runs.lastRowPartial
        ? [<>LAST ROW <b>{runs.runsInLastRow}</b> OF <b>{runs.runsPerRow}</b></>] : []),
      ...aisles,
      n(`${runs.spareFt.toFixed(0)}′`, 'SPARE'),
    ]
    // A mixed floor reads its own pallet zone, which is narrower than the
    // building and — with the floor given as an area — longer along it. The
    // whole-building pallet layout described a floor that was not drawn.
    : isMixed
      ? [
        n(mixed.cantileverRows, 'CANT', mixed.cantileverRows === 1 ? 'ROW' : 'ROWS'),
        n(mixed.pallets.rows, 'PALLET ROWS'),
        n(mixed.pallets.bays, 'BAYS/ROW'),
        ...(mixed.strip.lastRowPartial
          ? [<>STRIP LAST ROW <b>{mixed.strip.runsInLastRow}</b> OF <b>{mixed.strip.runsPerRow}</b></>]
          : []),
        ...aisles,
        n(`${Math.max(0, mixed.pallets.spareFt).toFixed(0)}′`, 'SPARE'),
      ]
      : m.type.onePalletLanes
        ? [
          n(layout.blocks, layout.blocks === 1 ? 'BLOCK' : 'BLOCKS'),
          n(layout.bays, 'LANES'),
          n(layout.deep, 'DEEP'),
          n(layout.levels, 'HIGH'),
          n(layout.palletsAcross, 'WIDE'),
          ...aisles,
          n(`${Math.max(0, layout.spareFt).toFixed(0)}′`, 'SPARE'),
        ]
        : [
          n(layout.rows, 'ROWS'),
          n(layout.bays, 'BAYS/ROW'),
          // Depth, height and width tell one deep type from another, so they
          // are named together wherever a type has depth to speak of.
          ...(layout.deep > 1
            ? [n(layout.deep, 'DEEP'), n(layout.levels, 'HIGH'), n(layout.palletsAcross, 'WIDE')]
            : []),
          ...aisles,
          n(`${Math.max(0, layout.spareFt).toFixed(0)}′`, 'SPARE'),
        ];

  const blocking = m.flags.filter((f) => f.severity === 'blocking').length;
  const checks = m.flags.filter((f) => f.severity === 'check').length;
  const notes = m.flags.filter((f) => f.severity === 'opportunity').length;

  /*
   * Which severity the column is showing.
   *
   * The tally used to be a readout: three numbers over a list that ignored
   * them. On a sheet with a dozen flags the one blocking item is the thing a
   * reader is looking for, and it was somewhere down a scroll among the notes.
   * The counts are the way in now — press a number and the column is that.
   *
   * Presentation state, so it lives here rather than in the model.
   */
  const [flagTab, setFlagTab] = useState<Flag['severity'] | 'all' | 'context'>('all');
  // A tab whose count has gone to zero is a dead end, so the column falls back
  // to all rather than showing nothing and leaving the reader to work out why.
  // The trade notes are always there, so All always has at least them and the
  // count on each tab is what pressing it shows.
  const counted: Record<Flag['severity'] | 'all' | 'context', number> = {
    all: m.flags.length + GOOD_TO_KNOW.length,
    blocking, check: checks, opportunity: notes, context: GOOD_TO_KNOW.length,
  };
  const tab = counted[flagTab] > 0 ? flagTab : 'all';
  const shown = tab === 'all' || tab === 'context'
    ? (tab === 'all' ? m.flags : [])
    : m.flags.filter((f) => f.severity === tab);
  const showsTrade = tab === 'all' || tab === 'context';

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
          {/* The schedule and the thing it changes, side by side.
              Three cards across the top of the sheet took the width the plan
              needed and put every field a screen away from the drawing that
              answers it. One panel down the left costs the drawing 296px and
              gives the reader a field and its consequence in one glance. */}
          <div className="deck">
            <aside className={cx('panel', isMixed && 'tall')} aria-label="Rack schedule">
              {/* Lifted out of the flow, so a long schedule scrolls inside the
                  panel instead of making the row taller than the drawing. The
                  same trick the flag column uses. */}
              <div className="panelinner">
                <PanelGroup no="01" name="Building" note="the box you are filling">
                  {/* Any real building, at the size it actually is. The upper
                      bound left on these is a guard against a mistyped dimension,
                      not a size the planner refuses to draw — a floor past about
                      750 ft raises a flag advising it be zoned, and is drawn in
                      full anyway. */}
                  <div className="row r3">
                    <NumField label="Length" unit="ft" value={building.lengthFt} onChange={m.onBuilding.lengthFt}
                      min={BUILDING_FT.min} max={BUILDING_FT.max} step={5} />
                    <NumField label="Width" unit="ft" value={building.widthFt} onChange={m.onBuilding.widthFt}
                      min={BUILDING_FT.min} max={BUILDING_FT.max} step={5} />
                    <NumField label="Clear" unit="ft" value={building.clearHeightFt}
                      onChange={m.onBuilding.clearHeightFt} min={10} />
                  </div>
                  {/* A footprint is not a storage area: staging, shipping, offices
                      and charging take a fifth to a third of it. Typed as a
                      percentage of the floor, and an empty box is all of it. */}
                  <div className="row r2">
                    <Seg label="Sprinklers" value={m.sprinklers} onChange={m.setSprinklers}
                      options={[['ceiling', 'Ceiling'], ['in-rack', 'In-rack']] as const} />
                    <NumField label="Rack area" unit="%" value={m.building.availablePct}
                      onChange={m.setAvailablePct} min={1} max={100} fallback={100} />
                  </div>
                </PanelGroup>

                {/* A long-goods customer has no pallet to describe, so the
                    section is not asked at all rather than asked empty — and the
                    numbering closes up behind it. */}
                {asksPallet && (
                  <PanelGroup no="02" name="Pallet" note="sets beam length and capacity">
                    {/* Four figures describing one object, on one line. The
                        units ride inside the boxes, so the labels stay one word
                        and the weight gets the extra width a four-figure load
                        needs. */}
                    <div className="row r4w">
                      <NumField label="Depth" unit="in" value={m.pallet.depthIn} onChange={m.onPallet.depthIn} min={24} />
                      <NumField label="Width" unit="in" value={m.pallet.widthIn} onChange={m.onPallet.widthIn} min={24} />
                      <NumField label="Load" unit="in" value={m.pallet.loadHeightIn} onChange={m.onPallet.loadHeightIn} min={12} />
                      <NumField label="Weight" unit="lb" value={m.pallet.weightLb} onChange={m.onPallet.weightLb} min={100} step={50} />
                    </div>
                  </PanelGroup>
                )}

                <PanelGroup no={asksPallet ? '03' : '02'} name="Configuration" note="how it is laid out">
                  <div className="row rstore">
                    <Seg label="Storing" value={m.family}
                      onChange={m.setFamily} options={STORING_OPTIONS} />
                    {/* One control rather than two: the rows run one way or the
                        other, so the question is which. The button says where it
                        is and turning it is the other answer. */}
                    <ToggleField label="Rows run"
                      value={m.config.orientation === 'length' ? '↔ Length' : '↕ Width'}
                      onToggle={() => m.setOrientation(
                        m.config.orientation === 'length' ? 'width' : 'length')} />
                    {/* No cross-aisle control: the engine puts one in every
                        120 ft of run, on a bay boundary, and the egress flag
                        says so. */}
                  </div>

                  {asksPallet && (
                    <>
                      <div className="glabel">Pallet racking</div>
                      <div className="row r2">
                        {/* "AISLE: 12.5" means nothing to somebody who has never
                            specified racking; everybody knows their truck, and
                            the truck is what decides the aisle. */}
                        <SelectField label="Forklift" value={m.config.truck}
                          onChange={(v) => m.setTruck(v as TruckKind)}
                          options={m.truckOptions} />
                        {/* A drive-in lane has no beam across it — the pallet
                            rests on rails along the uprights, because a beam
                            would be in the truck path. So there is nothing to
                            ask. Lane and cart depth is the building's answer,
                            not a question: it is derived and reported. */}
                        {!m.type.onePalletLanes && (
                          <SelectField label="Beam" unit="in" value={String(m.config.beamIn)}
                            onChange={(v) => m.setBeamIn(Number(v))}
                            options={m.beamOptions.map((b) => [String(b), String(b)] as const)} />
                        )}
                      </div>
                    </>
                  )}

                  {/* What goes on the arms and how much of it, then how far
                      apart the arms are: the long-goods questions, together. */}
                  {asksCant && (
                    <>
                      <div className="glabel">Cantilever</div>
                      <div className="row r3">
                        <NumField label="Product" unit="ft" value={m.cant.productLengthFt}
                          onChange={m.onCant.productLengthFt} min={m.productFt.min}
                          max={m.productFt.max} fallback={m.productFt.fallback} />
                        {/* Rows follow from this: a customer knows how much stock
                            they have, not how many rows it takes. */}
                        <NumField label="Linear" unit="ft" value={m.cant.linearFeetNeededFt}
                          onChange={m.onCant.linearFeetNeededFt} min={50} step={50}
                          fallback={500} />
                        {/* Typed, nothing offered: an arm pitch is a measurement
                            off a drawing, not a choice from a list. Any positive
                            figure stands; the engine floors it at an inch. Arm
                            levels follow from this and the clear height. */}
                        <NumField label="Arm spacing" unit="in" value={m.cant.armSpacingIn}
                          onChange={m.onCant.armSpacingIn} min={1}
                          fallback={24} />
                      </div>
                    </>
                  )}
                </PanelGroup>
              </div>
            </aside>

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
                  buildingLengthFt={building.lengthFt} buildingWidthFt={building.widthFt}
                  frameDepthIn={spec.frameDepthIn} flueIn={layout.flueIn}
                  aisleFt={m.aisleFt} wallClearanceFt={m.wallClearanceFt}
                  orientation={m.config.orientation} boxClass="pl" />
              ) : isLong ? (
                <CantileverPlanFigure layout={runs} box={planBox()}
                  buildingLengthFt={building.lengthFt} buildingWidthFt={building.widthFt}
                  aisleFt={m.aisleFt} wallClearanceFt={m.wallClearanceFt}
                  orientation={m.config.orientation} boxClass="pl" />
              ) : (
                <PlanFigure kind={m.kind} layout={layout} box={planBox()}
                  buildingLengthFt={building.lengthFt} buildingWidthFt={building.widthFt}
                  frameDepthIn={spec.frameDepthIn} flueIn={layout.flueIn}
                  aisleFt={m.aisleFt} wallClearanceFt={m.wallClearanceFt}
                  orientation={m.config.orientation} boxClass="pl" />
              )}

              {isMixed ? (
                <>
                  {/* The pallet bay is the same bay on a mixed floor as on a
                      floor of nothing else, so it is told the same things about
                      itself, and it builds its own heading as it does there.
                      Left out, it had no section to offer; handed a ready-made
                      heading, it had no control to reach one with — the control
                      that turns the bay lives in the heading the figure builds.
                      Between them, this was the one figure on the sheet whose
                      second view could not be got to. */}
                  <ElevationFigure spec={spec} clearHeightFt={building.clearHeightFt}
                    palletWidthIn={m.pallet.widthIn} palletLoadHeightIn={m.pallet.loadHeightIn}
                    palletDepthIn={m.pallet.depthIn}
                    lane={m.type.onePalletLanes} deep={layout.deep} openEnds={m.type.openEnds}
                    depthSection={m.type.depthSection}
                    box={elBox(true)} boxClass="el"
                    title="Fig. 2 — Pallets" sub={`${spec.palletsPerBay} pallets / bay`} />
                  <CantileverElevationFigure layout={mixed.strip} boxClass="el"
                    clearHeightFt={building.clearHeightFt}
                    box={elBox(true)}
                    labelClearHeight={false}
                    head={<ElHead title="Fig. 3 — Cantilever"
                      sub={`${mixed.strip.levels} arm levels + base`} />} />
                </>
              ) : isLong ? (
                <CantileverElevationFigure layout={runs} boxClass="el"
                  clearHeightFt={building.clearHeightFt}
                  box={elBox()}
                  head={<ElHead sub={`${runs.levels} arm levels + base`} />} />
              ) : (
                <ElevationFigure spec={spec} clearHeightFt={building.clearHeightFt} boxClass="el"
                  palletWidthIn={m.pallet.widthIn} palletLoadHeightIn={m.pallet.loadHeightIn}
                  palletDepthIn={m.pallet.depthIn}
                  lane={m.type.onePalletLanes} deep={layout.deep} openEnds={m.type.openEnds}
                  depthSection={m.type.depthSection}
                  box={elBox()}
                  sub={m.type.onePalletLanes
                    ? `1 pallet / lane · ${layout.deep} deep`
                    : `${spec.palletsPerBay} pallets / bay`} />
              )}
            </div>
          </div>
          </div>

          <RunSummary cells={runSummary} />

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
            </div>
            </div>

            {/* The placard sets the height of this row. Everything in here is
                lifted out of the flow so it cannot push the row taller than the
                placard beside it — the column scrolls instead, which is what
                the count in the header is for. */}
            <div className="flagcol">
              <div className="flaginner">
              {/* Only the severities this sheet actually has. A tab reading
                  zero is not a filter — pressing it can only empty the column —
                  and a row of them says most of what is on the sheet is what is
                  not on it. Nothing to report is the empty list's to say. */}
              {counted.all > 0 && (
                <div className="flagcount" role="tablist" aria-label="Filter by severity">
                  {([
                    ['all', 'All', counted.all],
                    ['blocking', 'Blocking', blocking],
                    ['check', 'Check', checks],
                    ['opportunity', 'Notes', notes],
                    ['context', 'Good to know', counted.context],
                  ] as const).filter(([, , count]) => count > 0).map(([key, label, count]) => (
                    <button key={key} type="button" role="tab" className={cx('flagtab', tab === key && 'on')}
                      aria-selected={tab === key} onClick={() => setFlagTab(key)}>
                      {label} <b>{count}</b>
                    </button>
                  ))}
                </div>
              )}
              {/* One column for everything Trace has to tell the customer: the
                  notes used to repeat the flags in a stack below the placard,
                  which read as two lists of the same thing. */}
              <div className="flags">
                {/* Everything in this column that is not a flag belongs to the
                    whole sheet rather than to one severity, so it reads on All
                    and stands aside while the reader is looking at one kind. */}
                {tab === 'all' && m.stripCost && (
                  <p className="stripcost" aria-live="polite">
                    The cantilever strip takes <b>{m.stripCost.widthFt.toFixed(1)} ft</b> of width
                    and costs about <b>{m.stripCost.positions.toLocaleString()} pallet positions</b>.
                    Without it the building would hold ~{m.stripCost.without.toLocaleString()}.
                  </p>
                )}
                {tab === 'all' && m.cantileverFill && <p className="colnote">{m.cantileverFill}</p>}
                {tab !== 'context' && (shown.length === 0 ? (
                  <p className="emptyflags">No flags — nothing here needs a second look.</p>
                ) : shown.map((f) => <FlagCard key={f.title} flag={f} />))}
                {/* After the flags about this building, because that is the
                    order a reader wants them in: what needs attention here,
                    then what is worth knowing anywhere. */}
                {showsTrade && GOOD_TO_KNOW.map((note) => (
                  <GoodToKnowCard key={note.label} note={note} />
                ))}
                {tab === 'all' && m.tunnelNote && <p className="advice">{m.tunnelNote}</p>}
                {/* Fire code is the AHJ's call, not ours: Trace names the reading
                    it worked from so a customer can disagree with it knowingly. It
                    reads here rather than under the stepper it explains — the
                    schedule is controls, everything Trace has to say is this
                    column, and a standing caveat comes after the flags that are
                    about this building in particular. */}
                {tab === 'all' && (
                  <p className="advice">
                    A continuous rack row longer than about 100 ft usually needs a cross aisle for
                    circulation and egress. Fire code requirements vary by jurisdiction, commodity
                    and storage height — confirm with your dealer.
                  </p>
                )}
                {tab === 'all' && m.assumptions.length > 0 && (
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

        <NextStep />

        <footer>
          <div className="rulerow">
            <span>Trace — warehouse layout, procurement and lifecycle</span>
            <span className="ln" /><span>Rev A</span>
          </div>
          {/* The sheet's one disclaimer. The placard and this footer each used
              to carry their own, in different words; the rest lives in the
              panel this line opens. */}
          <Assumptions />
        </footer>
      </div>
    </div>
  );
}

/* ── the schedule ──────────────────────────────────────────────────────── */

/**
 * An elevation's heading.
 *
 * One word after the number: the head is a fixed two lines, so figures keep a
 * shared baseline, and an elevation's box is only as wide as its drawing. A
 * longer caption did not wrap, it was cut. On a mixed sheet the two figures are
 * named by family rather than by view, because that is what tells them apart.
 */
function ElHead({ title = 'Fig. 2 — Elevation', sub }: {
  title?: string; sub: string;
}) {
  return (
    <div className="fighead">
      <span className="t">{title}</span>
      <span className="r mono">{sub}</span>
    </div>
  );
}


/**
 * The run summary, across the foot of the sheet.
 *
 * Mono throughout, because it is a row of figures; the figures are bold and
 * the words naming them are not.
 */
function RunSummary({ cells }: { cells: React.ReactNode[] }) {
  return (
    <p className="runsummary mono">
      {cells.map((c, i) => (
        // The cells are positional and fixed for a given sheet, so the index
        // is the identity there is.
        // eslint-disable-next-line react/no-array-index-key
        <span key={i}>{i > 0 ? <i aria-hidden="true"> · </i> : null}{c}</span>
      ))}
    </p>
  );
}

/**
 * One numbered group of the schedule, with a way to fold it away.
 *
 * Open to begin with, all three of them: a customer who has not filled the
 * sheet in yet needs to see what it is going to ask before they can judge
 * whether to start, and a panel that opens shut hides the question. Folding is
 * for afterwards — once the building is settled it is a heading, not six
 * fields, and the room goes to whichever group is still being argued with.
 *
 * The open flag lives with the group. It is presentation state: nothing below
 * this panel and nothing in the engine can tell whether a group is folded, and
 * every field keeps driving the drawing while it is out of sight, because the
 * inputs stay mounted and only the body is hidden.
 */
function PanelGroup({ no, name, note, children }: {
  no: string; name: string; note: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <div className={cx('pgrp', !open && 'shut')}>
      <button type="button" className="grptitle" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((v) => !v)}>
        <span className="no">{no}</span>
        <h3>{name}</h3>
        <span className="note">{note}</span>
        <span className="tog" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {/* Hidden, not unmounted: a folded group's fields are still bound, so
          nothing is lost by folding one and nothing has to be restored when it
          comes back. */}
      <div className="pgrpbody" id={id} hidden={!open}>{children}</div>
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
  label, value, onChange, min, max, step = 1, wide, narrow, roomy, fallback, hint, unit,
}: {
  label: string; value: number; onChange: (v: number) => void;
  /**
   * What the figure is in, set faintly inside the box after it. In the box
   * rather than the label, so the label stays one word and the unit sits
   * against the number it belongs to.
   */
  unit?: string;
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
      <Boxed unit={unit} id={id}>
        <input id={id} type="number" value={shown} min={min} max={max} step={step}
          aria-describedby={cx(unit && `${id}-unit`, hint && `${id}-hint`) || undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number.parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={settle}
          onKeyDown={(e) => { if (e.key === 'Enter') settle(); }} />
      </Boxed>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
});

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

/**
 * A field's box, with its unit set inside it after the value.
 *
 * The unit is drawn over the control rather than typed into it, so it never
 * reaches the value and is never selected with it. Its length is handed to the
 * CSS so the control keeps clear of it.
 */
function Boxed({ unit, id, select, children }: {
  unit?: string; id: string; select?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cx('fbox', select && 'sel', unit && 'hasunit')}
      style={unit ? { ['--u' as string]: unit.length } : undefined}>
      {children}
      {unit && <span className="unit" id={`${id}-unit`}>{unit}</span>}
    </div>
  );
}

function SelectField<T extends string>({
  label, value, onChange, options, combo, roomy, mid, unit,
}: {
  label: string; value: T; onChange: (v: T) => void;
  options: readonly (readonly [T, string])[]; combo?: boolean;
  /** For a label or an option that will not fit the standard select. */
  roomy?: boolean;
  /** Between the two: a percentage, or one short word. */
  mid?: boolean;
  /** As on a number field: the unit inside the box, after the value. */
  unit?: string;
}) {
  const id = useId();
  return (
    <div className={cx('f', combo && 'wcombo', mid && 'w3', roomy && 'w5')}>
      <label htmlFor={id}>{label}</label>
      <Boxed unit={unit} id={id} select>
        {/* Mono is for numbers: a list of words reads in the sans. */}
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}
          className={cx(!options.every(([, t]) => /^[\d.,\s]+$/.test(t)) && 'words') || undefined}
          aria-describedby={unit ? `${id}-unit` : undefined}>
          {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </Boxed>
    </div>
  );
}

/**
 * A two-state answer, given as the state itself.
 *
 * The sheet's segmented control shows both options and marks one — right where
 * the options are worth seeing side by side. Where there are only two and they
 * are opposites, that spends a field's width saying what the answer is not.
 * This says what it is, and pressing it gives the other.
 */
function ToggleField({ label, value, onToggle }: {
  label: string; value: string; onToggle: () => void;
}) {
  const id = useId();
  return (
    <div className="f w3">
      <label htmlFor={id}>{label}</label>
      <button id={id} type="button" className="toggle" onClick={onToggle}>{value}</button>
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

/* ── comparison, flags, next step ──────────────────────────────────────── */

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

/**
 * What a buyer should know about racking, as against this racking.
 *
 * The computed flags are about the sheet in front of you — this beam, this
 * frame, this floor — and every one of them names a number the layout produced.
 * These name none, because they are true of the trade rather than of the
 * building: they do not depend on an input and so they never change, never
 * fire and never clear. That is exactly why they sit in their own category
 * instead of being mixed in with the checks, where a reader learns to read a
 * flag as "something about my building needs attention".
 *
 * Static by intention. If one of these ever needs a number in it, it has stopped
 * being trade knowledge and belongs in `flags.ts` with the rest of the checks.
 */
const GOOD_TO_KNOW: readonly { label: string; body: string; warn?: true }[] = [
  {
    label: 'Columns',
    body: 'Building columns affect how much racking fits: a column in a rack flue costs '
      + 'nothing, but one in a bay or aisle can cost pallet positions. This estimate '
      + "doesn't place your columns — a dealer or Trace CAD lays rows out to work around them.",
  },
  {
    label: 'Safety',
    body: 'Racking must be inspected at least annually by a qualified inspector, with '
      + 'regular in-house visual checks (ANSI/RMI MH16.1, OSHA). A load-capacity placard '
      + 'must be posted on every installed rack.',
  },
  {
    label: 'Fire',
    body: 'In-rack sprinklers, flue spacing and commodity classification are set by fire '
      + 'code and vary by jurisdiction — confirm with your dealer and local authority.',
  },
  {
    label: 'Beams',
    body: "Beam size shown is approximate. Final capacity, deflection and load limits come "
      + "from the manufacturer's chart and vary by maker — your dealer confirms the section.",
  },
  {
    // The one of the five that is about what this sheet does not do, so it keeps
    // the check colour's marker inside the calmer category.
    label: 'Not modelled',
    warn: true,
    body: 'Seismic bracing and anchors, floor slab and point loading, and egress routing '
      + 'are not modelled here — a dealer or structural engineer confirms these.',
  },
];

const GoodToKnowCard = memo(function GoodToKnowCard(
  { note }: { note: (typeof GOOD_TO_KNOW)[number] },
) {
  return (
    <div className="flag know">
      <b>
        {note.label}
        {note.warn && <i className="knowwarn" aria-label="not modelled">⚠</i>}
      </b>
      {note.body}
    </div>
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
 * Where the sheet hands off, in the place the bill of materials used to sit.
 *
 * The bill counted frames and beams off a preliminary layout, and a counted
 * list reads as a quote however it is captioned. Quantities are a dealer's to
 * confirm against a real building, so the sheet ends by saying who does that.
 *
 * Neither destination exists yet. Connecting with a dealer is an action, so it
 * will sit behind sign-in (everything above stays anonymous); until there is a
 * sign-in and a dealer flow, both buttons say so rather than going nowhere.
 */
function NextStep() {
  const [pending, setPending] = useState<'dealer' | 'cad' | null>(null);
  return (
    <section className="nextstep" aria-labelledby="nextstep-h">
      <div className="nscopy">
        <h2 id="nextstep-h">Ready for an accurate layout?</h2>
        <p>A dealer confirms quantities, capacities and a build-ready plan for your building.</p>
      </div>
      <div className="nsact">
        <div className="nsbtns">
          <button type="button" className="nsprimary" onClick={() => setPending('dealer')}>
            Connect with a dealer
          </button>
          <button type="button" className="nssecondary" onClick={() => setPending('cad')}>
            Open in Trace CAD
          </button>
        </div>
        <p className="nssoon" aria-live="polite">
          {pending === 'dealer' && 'Coming soon — dealer connections open with sign-in.'}
          {pending === 'cad' && 'Coming soon — Trace CAD is not open yet.'}
        </p>
      </div>
    </section>
  );
}
