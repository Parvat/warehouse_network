# Design targets

Static HTML mockups. Not part of the build — these are the reference Claude Code
matches when porting each screen to React. Open them directly in a browser.

| File | Screen | State |
|---|---|---|
| `a1-landing.html` | A1 — landing, two doors | **Locked** |
| `a2-requirement.html` | A2 — rack finder wizard | **Locked** |
| `a3-sizing-sheet.html` | A3 — layout planner | In progress |
| `wireframes.html` | All 15 screens, low fidelity | Reference |

## Locked visual language

- **Palette** — bg `#F2F1EC`, paper `#FFFFFF`, sand `#E7E4DB`, pine `#14392B`,
  pine-2 `#1D5340`, mint `#E7EFEA`, gold `#C8A34A`, ink `#171A18`,
  line `#DEDACF`. Amber only for warnings.
- **Type** — Oswald 700 for display, IBM Plex Sans for body, IBM Plex Mono for
  labels, figures and anything technical.
- **Radius** — 2px everywhere except cards, which use 3–6px.
- **Rack art** — transparent PNGs in `assets/racks/`. Green uprights, orange
  beams, kraft pallets, yellow only on a forklift.

## A2 — how the recommendation works

Five answers score six rack types. Weights, in order of influence:

1. **Pallets per SKU** decides whether stock can sit behind stock at all.
2. **Rotation** — strict FIFO rules out drive-in and push-back outright, and
   heavily penalises double-deep because the back pallet is stranded.
3. **Throughput** — deep lanes have few pick faces, so heavy traffic pulls back
   toward selective. Drive-in takes an extra penalty because the truck travels
   the lane for every pallet.
4. **SKU count** — many products need many faces; few products reward depth.
5. **Forklift owned** — a sit-down truck cannot reach the back of a double-deep
   bay, and sets the narrowest aisle available.

Tie-breakers are applied *after* the clamp so two systems never show the same
percentage.

Verified against 11 known-answer cases, zero ties. Re-run that check after any
change to the weights.

## Before production

- Rack images are AI-generated and **not licensed**. Replace with rendered or
  photographed racking. `assets/racks/README.md` has the composition brief.
- No image exists for **double-deep** — it currently falls back to selective.
- The hero photo on A1 is also AI-generated and needs replacing.
