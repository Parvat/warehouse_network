import { CROSS_AISLE_WIDTH_FT } from './constants.js';

/**
 * Where the cross aisles fall, computed once for the building.
 *
 * A cross aisle is a route through the building — for circulation, for egress,
 * and for a truck crossing from one zone to the other. Two zones that each work
 * out their own positions from their own run length do not give you a route:
 * they give you two staggered dead ends, and the fire officer will say so.
 *
 * So the positions come from the building's rackable length and nothing else,
 * measured from the same edge after the same wall clearance and dock apron. A
 * zone whose module is 8 ft and one whose module is 21 ft both break at 80 ft,
 * and each simply fits what it can into the segments between.
 *
 * The segments are equal: a route two thirds of the way along is no more useful
 * than one in the middle, and an even split is the one a reader can predict.
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
    const n = Math.max(0, Math.floor((room + (pitchFt - moduleFt)) / pitchFt));
    for (let i = 0; i < n; i++) {
      out.push(+(seg.startFt + offsetFt + i * pitchFt).toFixed(3));
    }
  }
  return out;
}
