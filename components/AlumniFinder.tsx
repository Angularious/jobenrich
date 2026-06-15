"use client";

import { useState } from "react";
import { ResultsSection } from "./ResultsSection";
import { PipelineProgress } from "./PipelineProgress";
import type { PersonData } from "./PersonCard";

interface AlumniFinderProps {
  company: string;
  domain: string | null;
  onEnrich: (person: PersonData) => void;
  enrichedUrls?: Set<string>;
}

export function AlumniFinder({ company, domain, onEnrich, enrichedUrls }: AlumniFinderProps) {
  const [open, setOpen] = useState(false);
  const [school, setSchool] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alumni, setAlumni] = useState<PersonData[] | null>(null);
  const [alumniError, setAlumniError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAlumni(null);
    setAlumniError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/alumni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, domain, school }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't search alumni.");
        return;
      }
      setAlumni(data.alumni ?? []);
      setAlumniError(Boolean(data.alumniError));
    } catch {
      setError("Request failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="nb-btn font-black text-sm uppercase tracking-wider px-5 py-3 w-full sm:w-auto"
        >
          + Find alumni from your school
        </button>
      ) : (
        <div className="nb-card p-5 sm:p-6" style={{ ["--nb" as string]: "var(--color-acc-pink)" }}>
          <p className="font-mono font-bold text-[11px] uppercase tracking-widest text-acc-pink mb-4">
            ▌ alumni at {company || "this company"}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="nb-input flex-1" style={{ ["--nb" as string]: "var(--color-acc-pink)" }}>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="Your school, e.g. UC Berkeley"
                required
                maxLength={100}
                className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="nb-btn font-black text-sm uppercase tracking-wider px-6 py-3 whitespace-nowrap"
            >
              {loading ? "Working…" : "Search →"}
            </button>
          </form>

          {error && (
            <div className="nb-flat bg-acc-pink text-base font-bold text-xs px-3 py-2 mt-4">
              ⚠ {error}
            </div>
          )}

          {loading && (
            <div className="mt-5">
              <PipelineProgress
                steps={[
                  { label: "Matching alumni at the company", delay: 0 },
                  { label: "Widening the search", delay: 3500 },
                ]}
                accent="var(--color-acc-pink)"
              />
            </div>
          )}
        </div>
      )}

      {alumni && !loading && (
        <ResultsSection
          title="Alumni"
          hint={`from ${school.trim()}`}
          people={alumni}
          hasError={alumniError}
          onEnrich={onEnrich}
          variant="pink"
          enrichedUrls={enrichedUrls}
        />
      )}
    </div>
  );
}
