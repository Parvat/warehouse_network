import { SIZING_RELEVANT, type Completeness, type Requirement } from './types.js';

/**
 * "Done" is not a complete specification — it is:
 *   can a provider decide whether to bid?
 *
 * A dealer can answer "2,600 positions, Allentown, March, new material".
 * They cannot answer "we need racking".
 */
export function assess(req: Requirement): Completeness {
  const missingForBid: string[] = [];
  const missingForFull: string[] = [];

  if (!req.location?.raw) missingForBid.push('location');
  if (!req.services?.length) missingForBid.push('what you need');

  const needsSize = req.services.some((s) => SIZING_RELEVANT.has(s));
  const hasSize =
    !!req.palletPositions || !!req.buildingAreaSqFt ||
    (!!req.buildingLengthFt && !!req.buildingWidthFt);
  if (needsSize && !hasSize) missingForBid.push('how much you store');

  if (!req.targetDate) missingForFull.push('target date');
  if (needsSize) {
    if (!req.clearHeightFt) missingForFull.push('clear height');
    if (!req.commodity && !req.palletWeightLb) missingForFull.push('what you store');
    if (!req.rackTypeIfKnown) missingForFull.push('rack type');
    if (!req.sizingResult) missingForFull.push('worked-out sizing');
  }

  const biddable = missingForBid.length === 0;

  // Score is what renders as dots in the provider inbox.
  let score = 0;
  if (req.location?.raw) score += 1;
  if (req.services?.length) score += 1;
  if (hasSize || !needsSize) score += 1;
  if (req.targetDate) score += 1;
  if (req.sizingResult || req.files.some((f) => f.kind.startsWith('layout'))) score += 1;

  const band: Completeness['band'] = score >= 5 ? 'full' : score >= 3 ? 'workable' : 'outline';
  return { score, band, biddable, missingForBid, missingForFull };
}

/** The single most useful thing to ask for next. */
export function nextBestQuestion(req: Requirement): string | null {
  const c = assess(req);
  return c.missingForBid[0] ?? c.missingForFull[0] ?? null;
}
