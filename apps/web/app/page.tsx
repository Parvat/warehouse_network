import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';

/** A1 — two doors. Do you have racking already, or not? */
export default function Landing() {
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link href="/" className="logo"><b />TRACE</Link>
          <span className="tagline">Plan. Price. Install.</span>
          <span className="prog">Eastern PA</span>
          <span className="acct">
            Sign in
            <svg className="ic" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0114 0" />
            </svg>
          </span>
        </div>
      </header>

      <section className="hero">
        <div className="heroimg" />
        <div className="wrap">
          <div>
            <h1>Pallet racking for your warehouse<em>Planned, priced, installed.</em></h1>
            <p className="sub">
              Work out what you need, see what it costs, and find the companies who do it.
              Nothing here needs an account.
            </p>
            <div className="feats">
              <Feat title="See pricing" note="in minutes" />
              <Feat title="Compare" note="qualified providers" />
              <Feat title="No account" note="required" />
            </div>
            <div className="mini">
              <div><span className="n">14+</span><span className="l">providers serve Eastern PA</span></div>
              <div><span className="n">1 min</span><span className="l">to an answer, no sales call</span></div>
            </div>
          </div>

          <div className="doors">
            <div className="door">
              <span className="no">01</span>
              <h2>I need racking</h2>
              <p>A new building, more storage, or replacing racking that has had its day.</p>
              <Link href="/rack-finder" className="startrow">
                <span className="fld">
                  <svg className="ic" viewBox="0 0 24 24">
                    <path d="M12 21s-7-5.3-7-10a7 7 0 1114 0c0 4.7-7 10-7 10z" />
                    <circle cx="12" cy="11" r="2.6" />
                  </svg>
                  Where is the warehouse?
                </span>
                <span className="go">Start
                  <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
                </span>
              </Link>
              <p className="hint">About a minute · no sales calls until you ask</p>
            </div>

            <div className="door">
              <span className="no">02</span>
              <h2>I already have racking</h2>
              <p>Get it inspected, repaired, labelled, or add more to it.</p>
              <div className="svc">
                {['Inspection', 'Repair', 'Labels', 'Add more'].map((s) => (
                  <a key={s} href="#">
                    {s}
                    <svg className="ic ic-xs ch" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="wrap">
        <section className="known">
          <span>Know exactly what you want?</span>
          <div className="list">
            {['Rack material only', 'Installation only', 'Engineering', 'Layout design',
              'Freight', 'Equipment rental'].map((s) => <a key={s} href="#">{s}</a>)}
          </div>
        </section>

        <section className="assure">
          <Assure k="Cost" v="Free to use, no account to look" />
          <Assure k="Contact" v="Nobody calls you until you ask" />
          <Assure k="Coverage" v="14 providers serve Eastern PA" />
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Feat({ title, note }: { title: string; note: string }) {
  return (
    <div className="feat">
      <span className="ib">
        <svg className="ic" viewBox="0 0 24 24">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8M8 11h3M8 15h3M15 11v4" />
        </svg>
      </span>
      <span><b>{title}</b>{note}</span>
    </div>
  );
}

function Assure({ k, v }: { k: string; v: string }) {
  return (
    <div className="a">
      <span className="ib">
        <svg className="ic" viewBox="0 0 24 24">
          <path d="M12 3l7 3v6c0 4.2-2.9 8-7 9-4.1-1-7-4.8-7-9V6z" /><path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <div><div className="k">{k}</div><div className="v">{v}</div></div>
    </div>
  );
}
