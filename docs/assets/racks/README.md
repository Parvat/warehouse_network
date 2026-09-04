# Rack type reference cards

Five reference images, one per rack type, in the Trace palette — deep green
uprights, orange beams, kraft pallets on a warm off-white ground.

| File | Type | Badge in the reference |
|---|---|---|
| `selective.jpg` | Selective | Most versatile |
| `push-back.jpg` | Push-back | High density |
| `drive-in.jpg` | Drive-in | Maximum density |
| `drive-through.jpg` | Drive-through | FIFO friendly |
| `pallet-flow.jpg` | Pallet flow | Maximum density, FIFO high throughput |

## What to copy from these

- **Card shape.** Title, a single pill badge, two or three lines of plain
  description, four ticked bullets, then a footer strip: *Best for: …* on the
  left and a *Learn more →* on the right.
- **The rack is the hero.** It sits right of the copy, roughly half the card,
  isometric, viewed from slightly above, shadow beneath.
- **Colour discipline.** Green uprights, orange beams, kraft pallets, grey
  rollers and carts. Yellow appears only on a forklift, never on the racking.
- **Show the mechanism, not just the shape.** Rollers for pallet flow, sloped
  carts for push-back, a forklift inside the structure for drive-in and
  drive-through. That is what makes the types distinguishable at a glance.

## Long goods: one image, one option

The finder recommends a single long-products option — **Cantilever racking** —
not the engine's five variants. Roll-formed against structural is a load
question a dealer settles once the bundle weights are known, so the variants
stay in `packages/rack-engine/src/longgoods.ts` for a later screen while the
customer is shown the decision that is actually theirs.

`cantilever.png` covers it. The source render is `cantilever-source.png` in
this folder: it arrived 1254x1254 with an opaque near-white backdrop, and the
served file was flood-filled to transparency from the edges, feathered, and
matched to the other five — 420x420, content at ~94.5% of the frame, palette
PNG with tRNS.

## Notes

Missing from the set: **double-deep**. It is a real type in the wizard and
currently falls back to the selective image.

Four of the five pallet renders shipped with a 1–2px vertical line baked in at
the right edge of the content — selective (x378–379), push-back (x381),
drive-in (x361), drive-through (x386), spanning ~94% of the image height in a
warm grey. It read as a stray border down each carousel card. Erased from the
served PNGs; if these are ever re-exported from the source renders, check for
it again.
