# Mixed layouts — a cantilever strip plus pallet racking

What `layoutMixed` in `packages/rack-engine/src/mixedlayout.ts` decides, and why.
Written for whoever changes that solver next. The rules below are the reasoning;
the tests in `test/mixedlayout.test.ts` are the same rules made enforceable.

A mixed floor is **one strip and one remainder**, not two arbitrary zones.

---

## 1. Why the strip goes against a wall

Three reasons, and all three have to hold or the layout is worse than either
family on its own.

- **Long stock needs a clear run.** A 20 ft piece is placed and picked along its
  length, so its row wants an unbroken line down the building, not a pocket in
  the middle of a pallet floor.
- **It is awkward to handle mid-floor.** A truck carrying 20 ft of material
  swings 20 ft. Putting that traffic between two pallet rows means every aisle
  it crosses has to be sized for it.
- **A wall run can be single-sided, which halves its footprint.** Nobody can
  reach the far face of a row against a wall, so that row is armed on one face
  and is `(armLength + column) / 12` deep instead of `(armLength × 2 + column) / 12`.
  At a 48 in arm that is 4.5 ft rather than 8.5 ft.

So the strip is placed against one wall — `top` or `bottom` of the plan, the
customer's choice — and the pallet solver takes what is left. The choice of wall
changes nothing in the arithmetic; it is drawn from the same numbers, mirrored.

## 2. How the width divides

The strip is solved **first**, because its rows are asked for rather than
fitted. The pallet solver then runs against the remainder and is otherwise
untouched.

```
stripDepthFt   = singleRowDepthFt
               + (cantileverRows − 1) × doubleRowDepthFt
               + (cantileverRows − 1) × cantileverAisleFt

palletWidthFt  = buildingWidthFt − wallClearanceFt × 2
               − stripDepthFt − sharedAisleFt
```

`stripDepthFt` covers the strip's rows and the aisles **between** them. The
aisle on its open side is the shared one and belongs to neither zone, so it is
counted once, in the line above.

The across axis is the building width when rows run along the length, and the
building length when they run across the width. Everything below says "width"
for readability, but it is whichever axis the rows are stacked on.

### Worked example — 240 × 120 ft, one cantilever row

Selective racking, 48 in arms, 42 in frames, 96 in beams, 12.5 ft pallet aisle,
6 in flue, 2.5 ft wall clearance, 3 pallet levels, 2 pallets per bay.

```
across available     120 − 2 × 2.5                    = 115.0 ft
strip                (48 + 6) / 12, one row, no internal aisles
                                                      =   4.5 ft
shared aisle         max(12.5, 14)                    =  14.0 ft
pallet zone          115 − 4.5 − 14                   =  96.5 ft

pallet rows          1 wall row (3.5 ft)
                     + floor((96.5 − 3.5) / (7.5 + 12.5)) = 4 pairs
                                                      =   9 rows
bays per row         floor((240 − 5 − 12) / 8.25)      =  27 bays
pallet positions     9 rows × 27 bays × 2 per bay × 3 levels
                                                      = 1,458
linear feet of arm   9 runs × 3 bays × 6 ft centres
                     × 13 storage levels × 1 armed side
                                                      = 2,106 ft
```

The strip's 13 levels are 12 arm levels — what a 28 ft clear height allows at
24 in spacing over a 6 in base — plus the base itself, which carries product
like any arm above it.

Without the strip the same racking gets two wall rows and ten rows in total —
**1,620 positions**. The strip therefore costs **162 positions** for its
**18.5 ft** of width. That difference is reported to the customer verbatim; it
is the one figure they cannot work out for themselves.

Adding rows moves it steeply: three cantilever rows take 63.5 ft of the 115 and
leave 810 positions.

## 3. The shared aisle takes the larger width

**This is a safety constraint, not a preference.** A truck handling 20 ft stock
needs more room to turn than one handling pallets, and the aisle between the
last cantilever row and the first pallet row is used by both.

```
cantileverAisleFt = max(palletAisleFt, CANTILEVER_AISLE_MIN_FT)   // 14 ft
sharedAisleFt     = max(palletAisleFt, cantileverAisleFt)
```

The floor of 14 ft is a typical counterbalance truck on long loads. A sideloader
needs less and a wide-body needs more; that is a dealer's call against the actual
truck, so the constant is a sizing figure, not a rating. Where the customer asks
for a pallet aisle wider than 14 ft, that wider figure wins on its own account —
hence the `max`, not a substitution.

The consequence to keep in mind when changing this: the strip costs more floor
than its rack depth. At the default 12.5 ft pallet aisle the strip is 4.5 ft of
steel and 14 ft of aisle. Anyone reading only `stripDepthFt` will understate it
by three times. Use `stripTotalDepthFt` for anything the customer sees.

## 4. Why the two capacities are never added

A mixed floor has two capacities in two units:

- **pallet positions** — a count of unit loads
- **linear feet of arm** — a length of shelf

There is no exchange rate between them. How many linear feet a pallet position
is worth depends on what the customer stores, which is exactly what the sheet is
trying to find out. A combined number would be arithmetic without meaning, and
worse, it would look authoritative.

So they are reported side by side and never summed — in the placard, in the
bill's capacity line, and in the flags. If a future feature needs a single
figure to rank layouts, it needs a stated conversion the customer has agreed to,
not a silent addition here.

## 5. The wall-row rule inside each zone

Both families already have the rule; the mix is where it gets subtle.

**A wall forces a single row.** Nobody can reach the far side of a row that
backs onto a wall, so that row is armed or racked on one face only.

**Inside the strip:** the row hard against the wall is single-sided; every
further cantilever row is out on the floor and is double-sided. That is why
`cantileverRows` is not simply a multiplier — the first row is roughly half the
depth of the rest, and half the capacity.

**Inside the pallet zone — the exception that is easy to get wrong:** the zone
has *one* wall, not two. Its far edge is a real building wall and takes a single
row. Its near edge faces the shared aisle, and **an aisle is not a wall**: a row
there is reached from the aisle, so it takes a full back-to-back pair like any
interior row.

Treating that edge as a wall would silently lose a row of racking. Both solvers
therefore take a count of the real walls bounding them (`wallsAcross` for pallet
racking, `stripRows` for the cantilever strip) rather than assuming two.

## 6. The orientation conflict

Rows run one way for the whole building. Both families are laid out on that one
axis, and they do not always want the same one:

- **Cantilever runs want the long axis.** A run is the product length plus its
  access gap; the longer the axis, the fewer runs and the fewer end towers per
  foot of arm.
- **Pallet rows often want the other one.** Bays tile the along axis and rows
  stack the across axis, so which way round wins depends on the beam length and
  the aisle far more than on the building's proportions.

The solver does not choose. It lays the mix out both ways and, where the
alternative would help one family at the other's expense, raises a **check** —
never a blocking flag, because a trade is a decision and not a fault. The flag
names both sides of it in their own units: roughly how many pallet positions and
how many linear feet of arm the switch would move, and which family gains.

Where the other orientation is better for *both*, that is not a trade and the
flag says so plainly instead.

Do not let the two families take different orientations to resolve this. The
drawing would not describe a building anyone could build, and the customer would
have nothing to act on.

## 7. What the bill covers, and what it does not

One bill, two sections — `Cantilever` and `Pallet racking` — each counted by its
own family's rules, with one set of totals across both: line count, steel weight
and truckloads.

**Countable:** cantilever towers, bases, arms, bracing and anchors, and
frames-and-beams pallet racking. These are modular parts that follow directly
from the layout as drawn.

**Not countable, and never guessed:**

- **Capacities of any kind.** Arm capacity comes from the manufacturer's chart
  for a given profile, arm length and deflection limit; tower and beam sections
  come from the same charts. Nothing in the bill rates steel.
- **Non-selective pallet types.** Drive-in, drive-through, push-back and pallet
  flow are rails, carts and rollers, not frames and beam pairs. A counted bill
  for them would be misleading, so that section is replaced by the dealer
  hand-off — while the cantilever section stays, because those parts are
  countable regardless of what the pallet half is.

Unit weights throughout are typical figures for sizing freight, not catalogue
data. They exist so a truckload count is roughly right, and should be replaced
with real catalogue weights before any of this reaches a quote.

---

## Where to look

| Question | File |
|---|---|
| How the width divides, the shared aisle, the flags | `packages/rack-engine/src/mixedlayout.ts` |
| The strip's rows, towers, arms and bracing | `packages/rack-engine/src/cantileverruns.ts` |
| The pallet zone's rows and bays | `packages/rack-engine/src/racklayout.ts` |
| The rules above, made enforceable | `packages/rack-engine/test/mixedlayout.test.ts` |
