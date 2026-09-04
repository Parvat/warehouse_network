import './sheet.css';
import Planner, { type PlannerHandoff } from '@/components/Planner';

/**
 * A3 — the rack sizing sheet.
 *
 * Search params are read here rather than in the client component, so the page
 * renders server-side instead of falling back to a loading state.
 *
 * No SiteHeader or SiteFooter: the sheet carries its own masthead and its own
 * footer rule, as the approved design does. Putting the app chrome around it
 * would give the page two headers.
 */
export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const one = (k: keyof PlannerHandoff) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };

  // Built explicitly, so a new query parameter is dropped unless it is added
  // here too — `goods` and `long` carry the long-products family across.
  const handoff: PlannerHandoff = {
    goods: one('goods'), rack: one('rack'), long: one('long'), truck: one('truck'),
    aisle: one('aisle'), pd: one('pd'), pw: one('pw'),
    plh: one('plh'), pwt: one('pwt'), from: one('from'), match: one('match'),
  };

  return <Planner handoff={handoff} />;
}
