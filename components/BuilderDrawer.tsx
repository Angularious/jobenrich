"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";


// Capability-level breakdown — we describe WHAT each call does, never the
// underlying vendor (the whole pitch is "one Orthogonal key, 50+ APIs").
const API_CALLS = [
  {
    step: "Resolve LinkedIn job",
    provider: "LinkedIn job extractor",
    cost: "$0.09",
    note: "Purpose-built for auth-walled LinkedIn pages",
  },
  {
    step: "Resolve any other job URL",
    provider: "JS-rendering scraper → LLM extractor",
    cost: "$0.02 – $0.045",
    note: "Renders SPAs; an LLM parses the result when there's no structured data",
  },
  {
    step: "Find people + recruiters",
    provider: "People search API",
    cost: "$0.05 / call",
    note: "Domain-first waterfall, country-filtered first, then broadened",
  },
  {
    step: "People fallback",
    provider: "Employee database preview",
    cost: "$0.021 / call",
    note: "Fires only when the primary search returns zero",
  },
  {
    step: "Contact reveal — email",
    provider: "Cheap → rich → deep enrichment waterfall",
    cost: "$0.01 → $0.03 → $0.33",
    note: "Next step fires only if no email yet (email only — never phone)",
  },
  {
    step: "Alumni search",
    provider: "People search API (education filter)",
    cost: "$0.05 – $0.10",
    note: "Same domain-first waterfall as the main people search",
  },
];

export function BuilderDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] font-bold text-dim uppercase tracking-widest hover:text-acc-blue"
      >
        Built with Orthogonal in a weekend — see how →
      </button>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          backgroundColor: "rgba(0,0,0,0.7)",
          opacity: open ? 1 : 0,
          transition: "opacity 120ms steps(3)",
        }}
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[500px] max-w-full box-border bg-base border-l-[3px] border-line z-50 overflow-y-auto overflow-x-hidden"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 140ms steps(4)",
        }}
        aria-label="How this was built"
      >
        <button
          onClick={() => setOpen(false)}
          className="nb-btn absolute top-4 right-4 p-1.5"
          aria-label="Close"
        >
          <X size={16} strokeWidth={3} />
        </button>

        {/* Header */}
        <div
          className="border-b-[3px] border-line px-6 pt-12 pb-5"
          style={{ backgroundColor: "var(--color-acc-green)" }}
        >
          <h2 className="font-display text-3xl leading-none tracking-tight text-ink uppercase">
            How this was built
          </h2>
          <p className="font-mono text-[11px] font-bold text-ink/70 uppercase tracking-widest mt-1">
            Orthogonal API
          </p>
        </div>

        <div className="px-6 pb-16">
          {/* API calls */}
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mt-8 mb-3">
            ■ Live API calls (per search)
          </div>
          <div className="space-y-3">
            {API_CALLS.map((c) => (
              <div key={c.step} className="nb-flat px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="font-black text-xs text-ink uppercase tracking-wide">{c.step}</span>
                  <span
                    className="flex-none font-mono text-[11px] font-black px-1.5 py-0.5 border-[2px] border-line"
                    style={{ backgroundColor: "var(--color-acc-yellow)" }}
                  >
                    {c.cost}
                  </span>
                </div>
                <div className="font-mono text-[11px] font-bold text-acc-blue">{c.provider}</div>
                <div className="font-mono text-[11px] text-dim mt-0.5">{c.note}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-8 nb-flat bg-panel px-5 py-5 text-center">
            <p className="font-mono font-bold text-xs text-ink mb-1">
              Build your own tool like this
            </p>
            <p className="font-mono text-[11px] text-dim mb-4">
              Access 50+ data APIs through one key. Ship in a weekend.
            </p>
            <a
              href="https://orthogonal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="nb-btn inline-block px-6 py-3 font-black text-xs uppercase tracking-wider"
            >
              Get started at orthogonal.com →
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
