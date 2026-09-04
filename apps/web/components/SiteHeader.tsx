import Link from 'next/link';

/** Progress dots are only shown where a flow has steps to report. */
export default function SiteHeader({
  crumb, answered, total,
}: { crumb?: string; answered?: number; total?: number }) {
  const steps = total ?? 5;
  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="logo"><b />TRACE</Link>
        {crumb && (
          <span className="crumb">
            <svg className="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
            {crumb}
          </span>
        )}
        {typeof answered === 'number' && (
          <span className="prog">
            Progress
            {/* The dots are the only progress cue on screen, so they carry the count. */}
            <span className="dots" role="progressbar"
              aria-valuemin={0} aria-valuemax={steps} aria-valuenow={answered}
              aria-valuetext={`${answered} of ${steps} questions answered`}>
              {Array.from({ length: steps }, (_, i) => (
                <i key={i} className={i < answered ? 'on' : ''} />
              ))}
            </span>
          </span>
        )}
        <span className="acct">
          Sign in
          <svg className="ic" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0114 0" />
          </svg>
        </span>
      </div>
    </header>
  );
}
