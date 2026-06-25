"use client";

import { useEffect, useState } from "react";

interface SearchFormProps {
  jobUrl: string;
  loading: boolean;
  error: string | null;
  onJobUrlChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  // Manual company search (fallback for links we can't read).
  showManual: boolean;
  onToggleManual: () => void;
  onManualSubmit: (e: React.FormEvent) => void;
}

// Rotating placeholder examples — signals "any source", not just LinkedIn.
const EXAMPLES = [
  "linkedin.com/jobs/view/4398396153",
  "wayfair.com/careers/job/curation-planner…",
  "boards.greenhouse.io/acme/jobs/6092574…",
  "roberthalf.wd1.myworkdayjobs.com/…",
  "acme.com/careers/senior-engineer",
];

// Always-visible proof that many sources work. Filled accent blocks with
// high-contrast text (colored text on white was unreadable for yellow/green).
const SOURCES: { label: string; cls: string }[] = [
  { label: "LinkedIn", cls: "bg-acc-blue text-base" },
  { label: "Indeed", cls: "bg-acc-red text-base" },
  { label: "Greenhouse", cls: "bg-acc-green text-ink" },
  { label: "Workday", cls: "bg-acc-yellow text-ink" },
  { label: "+ any careers page", cls: "bg-base text-ink" },
];

// Hidden field only bots fill — each form carries its own.
function Honeypot() {
  return (
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={{ display: "none" }}
    />
  );
}

export function SearchForm({
  jobUrl,
  loading,
  error,
  onJobUrlChange,
  onSubmit,
  showManual,
  onToggleManual,
  onManualSubmit,
}: SearchFormProps) {
  const [exampleIdx, setExampleIdx] = useState(0);

  // Hard-cut rotation (brutalism = no transitions). Pause once the user types.
  useEffect(() => {
    if (jobUrl) return;
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 2500);
    return () => clearInterval(id);
  }, [jobUrl]);

  return (
    <div className="nb-card p-5 sm:p-6" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
      {/* ── Paste-a-link form ── */}
      <form onSubmit={onSubmit}>
        <Honeypot />
        <p className="font-bold text-sm text-ink mb-4 text-center">
          Paste a job posting → find recruiters, alumni, and teammates → get their contact
        </p>

        <div className="nb-input mb-3" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
          <input
            type="text"
            value={jobUrl}
            onChange={(e) => onJobUrlChange(e.target.value)}
            placeholder={EXAMPLES[exampleIdx]}
            aria-label="Job posting or careers page URL"
            required
            className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
          />
        </div>

        {/* Source chips — always-visible "works with anything" signal. */}
        <div className="flex flex-wrap justify-center gap-2 mb-4" aria-hidden="true">
          {SOURCES.map((s) => (
            <span
              key={s.label}
              className={`nb-flat border-[2px] border-line px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${s.cls}`}
            >
              {s.label}
            </span>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="nb-btn nb-btn-primary font-black text-sm uppercase tracking-wider px-10 py-4 w-full"
        >
          {loading ? "Working…" : "Find people →"}
        </button>
      </form>

      {/* Shared error (URL or manual search). */}
      {error && (
        <div className="nb-flat bg-acc-pink text-base font-bold text-xs px-3 py-2 mt-4">
          ⚠ {error}
        </div>
      )}

      {/* ── Manual search: toggle + form ── */}
      <button
        type="button"
        onClick={onToggleManual}
        className="block w-full text-center mt-4 font-mono text-[11px] font-bold uppercase tracking-widest text-acc-blue hover:bg-acc-blue hover:text-base"
      >
        {showManual ? "▴ Hide manual search" : "▾ Or search by company instead"}
      </button>

      {showManual && (
        <form onSubmit={onManualSubmit} className="mt-3 border-t-[3px] border-line pt-4">
          <Honeypot />
          <p className="font-bold text-xs text-ink mb-3 text-center">
            Can&apos;t read the link? Search by company instead.
          </p>

          <div className="nb-input mb-2" style={{ ["--nb" as string]: "var(--color-acc-blue)" }}>
            <input
              type="text"
              name="company"
              required
              maxLength={100}
              placeholder="Company — e.g. JPMorgan"
              aria-label="Company name"
              className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
            />
          </div>
          <div className="nb-input mb-2" style={{ ["--nb" as string]: "var(--color-acc-blue)" }}>
            <input
              type="text"
              name="role"
              maxLength={100}
              placeholder="Role title (optional) — e.g. software engineer"
              aria-label="Role title (optional)"
              className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
            />
          </div>
          <div className="nb-input mb-2" style={{ ["--nb" as string]: "var(--color-acc-blue)" }}>
            <input
              type="text"
              name="location"
              maxLength={100}
              placeholder="Location (optional) — e.g. London"
              aria-label="Location (optional)"
              className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
            />
          </div>
          <p className="font-mono text-[10px] text-dim mb-3 text-center">
            Use the company&apos;s common name, not a ticker or abbreviation.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="nb-btn font-black text-sm uppercase tracking-wider px-10 py-3 w-full"
            style={{ ["--nb" as string]: "var(--color-acc-blue)" }}
          >
            {loading ? "Working…" : "Search →"}
          </button>
        </form>
      )}
    </div>
  );
}
