/**
 * Side "ad" promoting Orthogonal's open role. Fixed to the bottom-right on
 * wide screens only (xl+) so it sits in the margin beside the centered column
 * and never crowds the form or the mobile layout. Pure link, no JS.
 */
export function HiringAd() {
  return (
    <a
      href="https://www.orthogonal.com/careers/founding-engineer"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Orthogonal is hiring a Founding Engineer — apply"
      className="hidden xl:block fixed bottom-6 right-6 z-30 w-[240px] nb-flat bg-acc-yellow border-[3px] border-line p-4"
    >
      <p className="font-mono text-[10px] font-black uppercase tracking-widest text-acc-red mb-2">
        ★ orthogonal is hiring
      </p>
      <p className="font-display text-2xl uppercase text-ink leading-[0.9] mb-2">
        Founding Engineer
      </p>
      <p className="font-mono text-[11px] font-bold text-ink mb-3 leading-snug">
        San Francisco · $150–220K + equity · YC W26
      </p>
      <span className="nb-btn block text-center px-3 py-2 text-[11px] font-black uppercase tracking-wider">
        Apply →
      </span>
    </a>
  );
}
