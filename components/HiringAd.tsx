"use client";

/**
 * Orthogonal hiring promo.
 *  - Desktop (xl+): a yellow box pinned bottom-right, in the margin.
 *  - Mobile/tablet (< xl): a collapsed right-edge tab with a blinking red dot;
 *    tapping it opens the full card. X dismisses (box) or collapses (mobile).
 */
import { useState } from "react";

const CAREERS_URL = "https://www.orthogonal.com/careers/founding-engineer";

function AdCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative nb-flat bg-acc-yellow border-[3px] border-line p-4 w-full">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center font-black text-ink leading-none hover:bg-ink hover:text-base"
      >
        ×
      </button>
      <p className="font-display text-2xl uppercase text-ink leading-[0.9] mb-1 pr-5">
        Join the team
      </p>
      <p className="font-mono text-[10px] font-black uppercase tracking-widest text-acc-red mb-3">
        ★ orthogonal is hiring
      </p>
      <p className="font-mono text-sm font-bold text-ink leading-snug">Founding Engineer</p>
      <p className="font-mono text-[11px] font-bold text-ink mb-3 leading-snug">
        San Francisco · $150–220K + equity · YC W26
      </p>
      <a
        href={CAREERS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="nb-btn block text-center px-3 py-2 text-[11px] font-black uppercase tracking-wider"
      >
        Apply →
      </a>
    </div>
  );
}

export function HiringAd() {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  if (dismissed) return null;

  return (
    <>
      {/* Desktop: box on the side */}
      <div className="hidden xl:block fixed bottom-6 right-6 z-30 w-[240px]">
        <AdCard onClose={() => setDismissed(true)} />
      </div>

      {/* Mobile/tablet: collapsed tab → expands */}
      {open ? (
        <div className="xl:hidden fixed bottom-4 right-4 z-30 w-[240px] max-w-[calc(100vw-2rem)]">
          <AdCard onClose={() => setOpen(false)} />
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Orthogonal is hiring — open"
          className="xl:hidden fixed top-1/2 right-0 -translate-y-1/2 z-30 nb-flat bg-acc-yellow border-[3px] border-r-0 border-line px-2 py-4 flex items-center gap-2"
        >
          {/* blinking red notification dot */}
          <span
            aria-hidden="true"
            className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-acc-red border-2 border-line"
            style={{ animation: "nbBlink 1.2s steps(2) infinite" }}
          />
          <span className="font-black text-ink text-base leading-none">‹</span>
          <span className="[writing-mode:vertical-rl] rotate-180 font-mono text-[10px] font-black uppercase tracking-widest text-ink">
            we&apos;re hiring
          </span>
        </button>
      )}
    </>
  );
}
