'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Everything Trace has to say about what this sheet is not, in one place.
 *
 * One line is always on the sheet, because a reader must not need to click to
 * learn that a figure is not a load rating. The rest is behind the link at the
 * end of that line: it is the same for every building, so it does not earn a
 * place on a sheet that is about this one.
 *
 * The copy is final. Change it with whoever owns it, not to fit a layout.
 */
export default function Assumptions() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  return (
    <>
      <p className="disclaim">
        Preliminary sizing estimate — positions and layout are approximate.{' '}
        <b>Not a load rating.</b> Capacities and final design to be confirmed by a qualified
        engineer or dealer prior to installation.{' '}
        <button type="button" className="disclaimlink" aria-haspopup="dialog"
          aria-expanded={open} onClick={() => setOpen(true)}>
          Assumptions &amp; limits &#8594;
        </button>
      </p>

      {open && (
        /* Anywhere off the panel closes it, as do the control and Escape —
           the same as the figure overlay. */
        <div className="figoverlay" role="dialog" aria-modal="true" aria-labelledby={titleId}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="limitsbox">
            <div className="figoverlaybar">
              <span className="mono">Read before relying on this sheet</span>
              <button type="button" className="figoverlayx" aria-label="Close"
                autoFocus onClick={() => setOpen(false)}>&#215;</button>
            </div>
            <div className="limitsbody">
              <h2 id={titleId}>Assumptions &amp; limits</h2>
              <p className="lede">
                This is a preliminary sizing estimate to help you understand your options — not
                an engineered design or a quote.
              </p>

              <h4>What this estimates</h4>
              <ul>
                <li>
                  Approximate pallet positions, row and bay counts, and a rough layout from the
                  dimensions and rack type you entered.
                </li>
                <li>Beam sizing is approximate, indicative only.</li>
              </ul>

              <h4>What this is not</h4>
              <ul>
                <li>
                  Not a load rating. It does not tell you how much weight a rack can safely
                  carry. Capacities, beam sections and deflection come from the
                  manufacturer&#39;s chart and vary by maker.
                </li>
                <li>Not an engineered or stamped design, and not a quote.</li>
              </ul>

              <h4>What it assumes</h4>
              <ul>
                <li>A rectangular, obstruction-free building at the dimensions entered.</li>
                <li>
                  Standard aisle and flue allowances; your forklift and operation may require
                  different.
                </li>
                <li>
                  Columns, docks and other obstructions are not placed — a real layout works
                  around them.
                </li>
              </ul>

              <h4>What it does not model</h4>
              <ul>
                <li>Seismic category, bracing and anchor design</li>
                <li>Floor slab thickness and point loading</li>
                <li>In-rack sprinklers, flue spacing and commodity classification</li>
                <li>Egress routing and door swings</li>
                <li>Permitting and rack inspection requirements</li>
              </ul>

              <h4>Before you install</h4>
              <p>
                Final capacities, layout and compliance must be confirmed by a qualified
                engineer or dealer.
              </p>
              {/* Neither has a route yet, so they are named rather than linked —
                  a link to nowhere is worse than none. */}
              <p className="limitscta">
                <span>Contact a dealer</span>
                <span>Open in Trace CAD</span>
              </p>

              <h4>Limitation of liability</h4>
              <p>
                This estimate is provided for general information only. Trace accepts no
                liability for any decision, design, purchase, installation or use of racking
                based on it. You are responsible for having capacities, layout and compliance
                confirmed by a qualified engineer or dealer before installation.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
