# Trace Platform — Project Brief

**Warehouse intelligence + marketplace.** A separate product from the existing
v16b warehouse CAD tool. Two apps, one company.

This brief records what was decided, why, and what to build. Where a decision
reversed an earlier one, the reversal is noted — those are the ones most likely
to get quietly undone by someone who wasn't in the conversation.

---

## 1. The problem

A warehouse operator who needs racking has to separately find a dealer, work out
what they actually need, get a layout, get a bill of materials, compare pricing,
find an installer, find an engineer, arrange freight, rent lift equipment, buy
accessories, exchange drawings by email, track installation, handle change
orders, and keep the records afterwards.

Today that happens across phone calls, email, PDFs, spreadsheets, text messages
and a dozen separate companies.

Nine user types eventually touch this: warehouse customers, rack dealers,
installers, structural engineers, layout designers, freight carriers, equipment
rental companies, inspectors, and accessory suppliers.

---

## 2. The five decisions that shape everything

### 2.1 Phase 1 is capturing the requirement, not producing a layout

**Phase 1's job is to find out what the customer needs, in the easiest possible
way.** Nothing more.

The sizing sheet is a **planner's aid**, not a gate. It exists for the customer
who doesn't know what they need. A customer who already knows types four fields
and goes straight to matching.

> "Not sure what you need? Let's work it out" — a branch, not a wall.

**Definition of done for phase 1:** *can a provider decide whether to bid?*
That is a much lower bar than a complete specification. A dealer can respond to
"2,600 positions, Allentown, March, new material." They cannot respond to "we
need racking."

### 2.2 A layout may never exist — and it can arrive four ways

Only one of those four is our CAD tool:

1. The customer already has one and uploads it
2. The dealer produces one as part of their quote *(most common today)*
3. A designer is hired for it — a paid service on the marketplace
4. The customer draws it in Trace CAD

**Therefore phase 1 must not couple to CAD.** Matching, quoting and purchasing
all run off the requirement alone.

**But note where the real value sits.** There are three layout states:

| State | What it unlocks |
|---|---|
| No layout | Matching, quotes, purchase — the whole transactional half |
| A *picture* of a layout (PDF, JPEG) | Shareable with an installer. Useless for inspection or labels — it is a document, not a model |
| A **structured** layout | Installation tracking on the drawing, as-built record, inspection, labeling, mini-WMS, reuse for the next expansion |

A customer who buys racking and leaves with a PDF is a one-time transaction.
A customer who ends up with a **structured layout** is ours for twenty years.

**Structured layout — not purchase — is the real conversion event of this
business.** That is where CAD sits strategically: not a required funnel step,
but the thing that turns a transaction into a relationship.

### 2.3 Anonymous users get everything *about* the market. Signed-in users get to *enter* it

Forcing a login to view is a pain point and kills the funnel.

**Free, no account:**
requirement capture · sizing sheet · indicative estimate ranges · who serves
this area · provider capabilities, coverage, ratings · match reasoning

**Requires an account:**
save · export · contact a provider · request a quote · anything that writes to
someone else's inbox

Three constraints inside that boundary:

- **Company names yes, contact details no.** If an anonymous visitor can read a
  dealer's phone number, Trace is a free directory and both sides route around
  us.
- **Providers see demand before they see the customer.** "2,600 positions,
  Allentown, March, no account yet" is genuinely useful to a dealer and proves
  the platform has demand. Identity arrives when the customer chooses to act.
- **Ranges are public; named per-provider pricing is not.** Publishing
  attributed rate cards anonymously hands a competitor the entire rate
  structure.

**The moat is convenience, not information control.** A determined visitor can
read the names and phone around — that is unpreventable. What keeps them inside
is that one requirement reaches five providers, quotes arrive comparable, and
the layout and BOM never get re-emailed.

### 2.4 Warehouse is the root entity, not Project

A project is an **episode** in a warehouse's twenty-year life.

```
Warehouse (permanent — the customer's asset)
├── Layout versions (as-designed → as-quoted → as-built → current)
├── Projects (episodes: initial install, mezzanine addition, reconfiguration)
├── Inspections (recurring, forever)
├── Repairs & service history
├── Labels
├── Inventory (mini-WMS)
└── Documents & permanent record
```

Making Project the root orphans the customer at completion — which is exactly
where the recurring revenue lives.

### 2.5 Two roles in v1, not nine

Model **dealer** and **dealer-invited provider**. Every role added before
product-market fit multiplies auth, onboarding, permissions and support surface.
`organizations.capabilities` is an array — new provider types are rows, not
tables.

---

## 3. Customer journey — how it actually works

### 3.1 Route first, then ask only what that route needs

The first screen is **not a form**. It is *what brings you here?*

Nine entry points: complete project · material only · installation only ·
engineering only · layout/design only · freight only · equipment rental only ·
inspection only · labels/accessories only.

**Four of the nine never touch the sizing engine.** Someone who came for
"inspection only" already has racks — asking their pallet weight is nonsense.
"Freight only" needs an origin, a destination and a date.

### 3.2 Customers arrive in three states

| State | They can say | What they need from us |
|---|---|---|
| **Knows the spec** | "2,400 selective positions, 96 in beams, March" | Let them type it and skip everything. Asking them to derive it from building dimensions is insulting |
| **Knows the outcome** | "I need to store about 3,000 pallets" | The common case. One input almost everyone has |
| **Knows only the problem** | "We're out of space" / "we're moving buildings" | The customer this product is really for — and they cannot answer a single field on the current sizing sheet |

### 3.3 Rank questions by how hard they are to answer

This ranking *is* the design:

- **Everyone knows:** location · roughly how much they store · what they store ·
  when they need it
- **Known awkwardly:** building size (as square footage, not length × width)
- **Guessed badly:** clear height
- **Genuinely unknown:** pallet weight — operators know "a pallet of paper," not
  2,200 lb
- **Known only with a WMS:** SKU count

**Implication:** the easiest path does not ask for specs at all. Ask **what do
you store, how much, and where** — then infer weight and dimensions from a
commodity lookup (beverages are heavy, packaging is light) and show every
assumption as an editable chip.

### 3.4 Assumption chips are the core mechanic

Every inferred value renders as a visible, tappable chip:

> Clear height: **28 ft** — *typical for this building size, tap to change*

This does three jobs at once: makes the output feel honest rather than magical,
turns refinement into a game (tap a chip, watch the range narrow), and does the
legal work of showing this is not a quote — without a disclaimer nobody reads.

**Show range width as progress, not as a defect.** "Wide range — answer four
more questions to narrow it" reframes imprecision as an invitation.

### 3.5 Completeness is a quality signal

Because the sizing sheet is optional, most requirements reaching a provider will
be thin. That is fine for matching — but the provider's inbox must **signal the
difference**. A requirement with a worked-out spec deserves more attention than
"we need racking, Allentown."

This is the honest reason to nudge people through the sizing sheet without
forcing them.

---

## 4. What is already built

A working prototype and a verified engine.

### `packages/rack-engine` — the moat

Pure TypeScript. No React, no DOM, no database, no network, zero dependencies.
`solve(input)` returns spec, layout, flags and BOM. **12 tests passing, strict
typecheck clean.**

Because it is pure, the identical code runs in three places: in the browser as
the customer types, on the server for saved estimates and PDFs, and later inside
the CAD editor. **If it does rack arithmetic, it belongs here and nowhere else.**

Verified output for a 240 × 120 ft building at 28 ft clear:

```
beam 96in | 2 pallets/bay | 5.3in clear
frame 24ft | 4 levels | 17,600lb cap
12 rows x 27 bays = 2,592 positions
bom: 9 lines | 81.4t | 5 truckloads
```

**Domain rules encoded and locked by tests:**

- A row of N bays takes **N+1** upright frames — adjacent bays share one
- The **floor level carries no beams and no decking**
- Pallets per bay comes **from the beam**, not the reverse:
  `floor((beam − gap) / (palletWidth + gap))` — 144 in takes three 40 in
  pallets, 96 in takes two, and 120 in is the wasteful middle ground
- Clearance is shared evenly — N pallets need N+1 gaps, and pallets must never
  touch the uprights
- **Flue space is fire code, not padding.** Zero flue is blocking
- Storage stops short of the sprinklers — clear height is not usable height

**18 domain flags at three severities.** Every flag names the computed number,
the real consequence, and the action. The template:

> **Heavy beam section** — At 6,600 lb per pair you are into heavy beam
> sections; check availability and lead time before committing.

- **Blocking** — frame won't fit under sprinklers · more SKUs than positions ·
  aisle below working width · zero flue
- **Check** — heavy beam · three heavy pallets per bay · point load per
  baseplate · **top level beyond a counterbalance's reach** · height:depth over
  6:1 · flue under 6 in · ceiling sprinklers above 30 ft · wasted beam span
- **Opportunity** — *"trimming the aisle to 10.2 ft fits one more back-to-back
  row, about 640 more positions, but it changes the truck you can use"*

The opportunity category is what makes the tool feel like it is on the
customer's side rather than scolding them.

### The sizing sheet UI

Drawing-sheet visual language, not SaaS. Title block with revision letter,
building plan and rack elevation at true scale, capacity placard rendered as the
yellow signage bolted to real racking, live BOM with CSV export.

Design decisions worth preserving: hover any field and the elevation dims to
just the part it controls; three columns of tiles beat four because labels stay
readable and hover does not exist on a tablet; the plan shows rows as sections
with bay ticks, **not individual pallets** — pallets turn to mud at building
scale and read as a rendering bug.

### `packages/db` — schema

Warehouse as root · `layout_versions` storing whole engine runs as JSONB with
`engine_version` so estimates replay correctly · `quotes.cost_price` marked as
the privacy boundary · two roles with capabilities as an array.

---

## 5. What is missing from the requirement model

The sizing sheet captures **engineering** data. Matching needs **commercial**
data. They barely overlap — the BOM says a provider must supply 336 frames; it
says nothing about whether they serve Allentown or have March capacity.

Not yet modelled:

- **Location** — listed first in the brief, and the primary matching input
- **Service(s) wanted** — which of the nine entry points
- **Target completion date**
- **New / used / either**
- **Rack type if known**
- **Pallet count as a direct input** — the engine currently *derives* positions
  from the building; it must also run in reverse (given a target, does this
  building hold it?)
- **Upload path** — PDF/DWG/image as an alternative to entering dimensions

---

## 6. Build order

The cold-start problem is what kills this. A marketplace with no supply is worth
nothing to the first customer through the door. **Phases 1–3 are deliberately
single-player.**

| Phase | Build | Why this order |
|---|---|---|
| **1** | Entry routing · requirement capture · optional sizing sheet · anonymous by default | Capturing need is the whole job. Prototype exists |
| **2** | Accounts · claim an anonymous requirement · save/resume · PDF export | The value moment is *saving*, not viewing |
| **3** | Dealer invites **their own** installer/engineer into a shared project | Single-player-plus. Seeds supply with relationships that already exist — the dealer does provider recruitment for us |
| **4** | Price books → real estimate ranges | Only works on a dealer already running projects in Trace |
| **5** | Open matching · turnkey / build-my-team / hybrid | Only now is it a marketplace, because supply exists |
| **6** | Project workspace · installation tracking · issues · completion record | |
| **7** | Post-completion: inspection · repair · labeling · mini-WMS · expansion | The recurring revenue, and where CAD integrates |

**Launch metro by metro, not nationally.** With sparse coverage the estimator
shows empty results everywhere, which is worse than not launching. Treat
regional provider density as a launch gate — and suppress ranges below ~5
contributors, or a thin market becomes de-facto published pricing for two firms.

---

## 7. Technical decisions

| Layer | Choice | Rationale |
|---|---|---|
| App | Next.js 15 App Router + TypeScript | Estimator is the acquisition channel — needs SSR for SEO, and the engine must run client-side |
| Engine | `packages/rack-engine`, pure TS | Runs in browser, on server, and later in CAD — from one codebase |
| DB | Postgres + PostGIS | Provider service-area matching is genuinely geospatial |
| ORM | Drizzle | Thin, SQL-shaped |
| **Permissions** | **Postgres row-level security** | Dealer margin must never leak. Policies live next to the data so a forgotten `WHERE` in a future endpoint cannot expose cost |
| Auth | Clerk | Organizations, invites, roles map onto provider companies |
| History | Append-only `events` table | Chronological project history is a first-class deliverable — never derive it from `updated_at` |
| Completion | Immutable JSONB snapshot | Later edits must not rewrite the accepted record |
| Files | Cloudflare R2 | Inspection photos are the volume driver — thousands per warehouse per year |
| Jobs | Inngest | Matching, PDFs, notifications, annual inspection reminders |
| PDFs | Playwright print-to-PDF | Sheets already render as HTML — print them, don't build a second renderer |
| Realtime | Postgres LISTEN/NOTIFY + SSE | Several companies in one workspace. Don't buy Pusher yet |
| Search | Postgres FTS + PostGIS | No Elasticsearch. Not at this scale |
| Field | PWA, offline-first, IndexedDB + sync queue | Two field workflows — installer progress and inspector findings. Warehouse interiors have no signal |

### Why TypeScript and not Spring Boot

The full scope is genuinely ERP-shaped and Spring is home ground for the
founder's 12 years of Java. Three reasons it still loses:

1. **The engine must run client-side regardless.** A split stack means
   maintaining it in TypeScript anyway — Java adds a language rather than
   removing one.
2. **Development is outsourced.** One language means one contractor pool and one
   type system from database to SVG.
3. **Two deploy targets, two auth integrations and a network hop between your
   own services** is real overhead for a solo founder.

**Where this flips:** if the plan becomes hiring a Java team rather than
contracting TypeScript developers, reverse it. The stack should match who is
building — that is a business decision, not a technical one.

---

## 8. Deliberately not building

- **Mini-WMS beyond occupied/empty, SKU, pallet ID, find/move.** Add receiving,
  picking and waves and you are competing with Manhattan, and losing.
- **A TMS.** The brief already scopes freight as record-keeping. Hold that line.
- **Payments.** Nothing in the brief requires taking money; adding it drags in
  PCI, escrow and disputes.
- **Nine roles in v1.**
- **CAD coupling in phase 1.**

---

## 9. Open questions

1. **Coverage detection in Build My Team.** A customer can assemble a team with
   no freight in it. Detecting and warning about gaps is the real problem there
   — not the comparison UI.
2. **What "matched" means before supply exists.** Early requirements will match
   two providers or none. An empty result is worse than not offering the
   feature.
3. **Position ID stability.** Labels, inspection findings, repair records and
   pallet locations all address positions. IDs must be minted at commit and
   survive edits — if `A01-03-02` is derived from index, inserting a bay in year
   two silently repoints last year's inspection findings.
4. **BOM from document vs from parameters.** The current BOM is arithmetic
   (`rows × bays × levels`), valid only while the layout is parametric. Once
   anyone edits a real layout, the BOM must be counted from the object graph or
   it will quote steel that does not match the drawing.
5. **Naming.** If the marketplace is also called Trace, v16b becomes the pro
   editor module and the layout engine is shared. Separate names mean
   maintaining two layout engines — the expensive version.

---

## 10. Numbers to verify before this reaches a customer

All in `packages/rack-engine/src/constants.ts`. **An estimate a dealer cannot
stand behind is worse than no estimate.**

- `PALLET_OVERHANG_IN` = 3 — drives frame depth
- `SPRINKLER_CLEARANCE_IN` — 36 in ceiling-only, 24 in with in-rack
- **The 4 in clearance default in `palletsPerBay`** — at 6 in, three 40 in
  pallets need a 168 in beam instead of 144 in, which changes **every**
  recommendation the tool makes. Check this first
- `UNIT_WEIGHTS` in `bom.ts` — freight sizing only, replace with catalogue data
- **Column guards** are counted on every aisle-facing column — the conservative
  read. Many dealers guard only row ends and high-traffic positions
