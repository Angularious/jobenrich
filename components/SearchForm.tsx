"use client";

import { useEffect, useState } from "react";

interface SearchFormProps {
  jobUrl: string;
  loading: boolean;
  error: string | null;
  onJobUrlChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
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

export function SearchForm({
  jobUrl,
  loading,
  error,
  onJobUrlChange,
  onSubmit,
}: SearchFormProps) {
  const [exampleIdx, setExampleIdx] = useState(0);

  // Hard-cut rotation (brutalism = no transitions). Pause once the user types.
  useEffect(() => {
    if (jobUrl) return;
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 2500);
    return () => clearInterval(id);
  }, [jobUrl]);

  return (
    <form onSubmit={onSubmit}>
      <div className="nb-card p-5 sm:p-6" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
        {/* Honeypot — hidden from users, only bots fill it. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ display: "none" }}
        />
        <p className="font-bold text-sm text-ink mb-4 text-center">
          Drop a job posting — or a company careers page — and we surface who to
          reach out to, plus the recruiters hiring.
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

        {error && (
          <div className="nb-flat bg-acc-pink text-base font-bold text-xs px-3 py-2 mb-4">
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="nb-btn nb-btn-primary font-black text-sm uppercase tracking-wider px-10 py-4 w-full"
        >
          {loading ? "Working…" : "Find people →"}
        </button>
      </div>
    </form>
  );
}
