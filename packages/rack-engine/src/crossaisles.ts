import { CROSS_AISLE_SEGMENT_FT, CROSS_AISLE_WIDTH_FT, crossAislesFor } from './constants.js';

/**
 * Where the cross aisles fall, computed once for the building.
 *
 * A cross aisle is a route through the building — for circulation, for egress,
 * and for a truck crossing from one zone to the other. Two zones that each work
 * out their own positions from their own run length do not give you a route:
 * they give you two staggered dead ends, and the fire officer will say so.
 *
 * So the positions are placed once for the floor, measured from the same edge
 * after the same wall clearance and dock apron, and every zone on it is laid
 * into the same segments. `crossAislePlan` places them on module boundaries —
 * the pallet bay, on a floor that has one — so an aisle never cuts a bay, and
 * a zone with a coarser module fits what it can between them.
 *
 * The segments are as equal as whole modules allow: a route two thirds of the
 * way along is no more useful than one in the middle, and an even split is the
 * one a reader can predict.
 */

export interface AisleSegment {
  /** Envelope feet from the datum both zones measure from. */
  startFt: number;
  lengthFt: number;
}

export interface CrossAisleSpans {
  /** The stretches of floor between the aisles, in order. */
  segments: readonly AisleSegment[];
  /** Where each aisle starts, in the same envelope feet. */
  atFt: readonly number[];
  /** What is left for racking once the aisles are taken out. */
  rackableFt: number;
  widthFt: number;
}

export function crossAisleSpans(
  alongFt: number,
  crossAisles: number,
  widthFt: number = CROSS_AISLE_WIDTH_FT,
): CrossAisleSpans {
  const n = Math.max(0, Math.round(crossAisles));
  const along = Math.max(0, alongFt);
  const rackableFt = Math.max(0, along - n * widthFt);
  const segLen = rackableFt / (n + 1);

  const segments: AisleSegment[] = [];
  const atFt: number[] = [];
  for (let i = 0; i <= n; i++) {
    const startFt = +(i * (segLen + widthFt)).toFixed(3);
    segments.push({ startFt, lengthFt: +segLen.toFixed(3) });
    if (i < n) atFt.push(+(startFt + segLen).toFixed(3));
  }
  return { segments, atFt, rackableFt, widthFt };
}

/**
 * The segments either side of aisles already placed, for a zone that has to
 * break where another zone broke rather than where its own modules would.
 */
export function crossAisleSpansAt(
  alongFt: number,
  atFt: readonly number[],
  widthFt: number = CROSS_AISLE_WIDTH_FT,
): CrossAisleSpans {
  const along = Math.max(0, alongFt);
  const at = atFt.filter((a) => a < along).slice().sort((a, b) => a - b);
  const segments: AisleSegment[] = [];
  let startFt = 0;
  for (const a of at) {
    segments.push({ startFt: +startFt.toFixed(3), lengthFt: +Math.max(0, a - startFt).toFixed(3) });
    startFt = a + widthFt;
  }
  segments.push({ startFt: +startFt.toFixed(3), lengthFt: +Math.max(0, along - startFt).toFixed(3) });
  const rackableFt = segments.reduce((s, x) => s + x.lengthFt, 0);
  return { segments, atFt: at, rackableFt, widthFt };
}

/**
 * Where the cross aisles go for racking of a given module, in whole modules.
 *
 * Every aisle stands on a module boundary: the racking stops at the end of a
 * bay (or a run) and the aisle starts there, so no aisle cuts a bay and no
 * remainder of floor is stranded in front of one. The modules are shared out
 * as evenly as they go — the segments differ by one module at most, the longer
 * ones first — and whatever the last module leaves is spare at the far end.
 *
 * Left to itself the count is one aisle per 120 ft started, and one more if a
 * coarse module would still leave a segment over 120 ft. Given a count, it
 * takes it.
 *
 * `pitchFt` is a module plus the gap that follows it; the last module in a
 * segment needs no gap after it, because the aisle is the gap.
 */
export function crossAislePlan(a: {
  usableAlongFt: number;
  moduleFt: number;
  pitchFt?: number;
  offsetFt?: number;
  crossAisles?: number;
  widthFt?: number;
}): CrossAisleSpans {
  const widthFt = a.widthFt ?? CROSS_AISLE_WIDTH_FT;
  const along = Math.max(0, a.usableAlongFt);
  const m = a.moduleFt;
  const p = Math.max(m, a.pitchFt ?? m);
  const gap = p - m;
  const off = Math.max(0, a.offsetFt ?? 0);
  const fixed = a.crossAisles !== undefined;
  if (!(m > 0)) return crossAisleSpans(along, a.crossAisles ?? crossAislesFor(along), widthFt);

  // Modules that fit across n + 1 segments with n aisles between them.
  const fits = (n: number) =>
    Math.max(0, Math.floor((along - off - n * widthFt + (n + 1) * gap) / p + 1e-9));
  const share = (n: number) => {
    const k = fits(n);
    const base = Math.floor(k / (n + 1));
    const extra = k - base * (n + 1);
    return Array.from({ length: n + 1 }, (_, i) => base + (i < extra ? 1 : 0));
  };
  const len = (k: number) => (k > 0 ? k * p - gap : 0);

  let n = Math.max(0, Math.round(a.crossAisles ?? crossAislesFor(along)));
  if (!fixed) {
    while (n + 1 < fits(n) && Math.max(...share(n).map(len)) > CROSS_AISLE_SEGMENT_FT + 1e-9) n += 1;
  }
  const counts = share(n);
  // Fewer modules than segments: there is nothing to break, so the old even
  // split stands rather than aisles stacked against each other.
  if (counts.some((k) => k === 0)) return crossAisleSpans(along, n, widthFt);

  const segments: AisleSegment[] = [];
  const atFt: number[] = [];
  let startFt = off;
  counts.forEach((k, i) => {
    const lengthFt = len(k);
    segments.push({ startFt: +startFt.toFixed(3), lengthFt: +lengthFt.toFixed(3) });
    if (i < n) {
      atFt.push(+(startFt + lengthFt).toFixed(3));
      startFt += lengthFt + widthFt;
    }
  });
  const rackableFt = segments.reduce((s, x) => s + x.lengthFt, 0);
  return { segments, atFt, rackableFt, widthFt };
}

/**
 * Where each module starts, laid into the segments between the aisles.
 *
 * Nothing straddles an aisle: a segment holds as many whole modules as fit and
 * the remainder is spare floor. `pitchFt` is the module plus whatever gap
 * follows it — a bay has none, a cantilever run has its access gap.
 */
export function fillSegments(
  spans: CrossAisleSpans,
  moduleFt: number,
  pitchFt: number = moduleFt,
  offsetFt = 0,
): number[] {
  const out: number[] = [];
  if (moduleFt <= 0) return out;
  for (const seg of spans.segments) {
    const room = seg.lengthFt - offsetFt;
    // the last module in a segment needs no gap after it
    const n = Math.max(0, Math.floor((room + (pitchFt - moduleFt)) / pitchFt + 1e-9));
    for (let i = 0; i < n; i++) {
      out.push(+(seg.startFt + offsetFt + i * pitchFt).toFixed(3));
    }
  }
  return out;
}
