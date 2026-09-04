'use client';

import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import RackFinder from '@/components/RackFinder';
import { useRackFinder } from '@/lib/useRackFinder';

/**
 * A2 — the rack finder wizard.
 *
 * The page owns the wizard state because two children need it: the header
 * shows progress, the wizard shows the recommendation. Holding it here is
 * what lets the wizard render without calling back into its parent.
 */
export default function RackFinderPage() {
  const model = useRackFinder();

  return (
    <>
      <SiteHeader crumb="New racking" answered={model.answered} total={model.total} />
      <main className="wrap">
        <RackFinder model={model} />
      </main>
      <SiteFooter />
    </>
  );
}
