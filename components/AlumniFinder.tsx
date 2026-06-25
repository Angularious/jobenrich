"use client";

import { useState } from "react";
import { apiPost, errorMessage } from "@/lib/security/client";
import { ResultsSection } from "./ResultsSection";
import { PipelineProgress } from "./PipelineProgress";
import type { PersonData } from "./PersonCard";

// A completed alumni search, persisted on the owning SearchSession so results
// survive tab switches (the finder is keyed per session → remounts on switch
// and restores from this).
export interface SavedAlumni {
  people: PersonData[];
  school: string;
  error: boolean;
}

interface AlumniFinderProps {
  company: string;
  domain: string | null;
  onEnrich: (person: PersonData) => void;
  onProfile?: (person: PersonData) => void;
  enrichedUrls?: Set<string>;
  profiledUrls?: Set<string>;
  // Persisted result for THIS session (restored on tab switch) + a setter to
  // save a new search back onto the session.
  initial?: SavedAlumni | null;
  onResult: (r: SavedAlumni) => void;
}

export function AlumniFinder({ company, domain, onEnrich, onProfile, enrichedUrls, profiledUrls, initial, onResult }: AlumniFinderProps) {
  // Initialize from any persisted result for this session (the component is
  // keyed by session id in page.tsx, so these run fresh on every tab switch).
  const [open, setOpen] = useState(() => !!initial);
  const [school, setSchool] = useState(initial?.school ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alumni, setAlumni] = useState<PersonData[] | null>(initial?.people ?? null);
  const [alumniError, setAlumniError] = useState(initial?.error ?? false);
  // The school that produced the shown results (so the hint stays correct even
  // while the user types a new school into the input before searching).
  const [resultSchool, setResultSchool] = useState(initial?.school ?? "");
  // Bumped on each successful search so the results' "show more" reveal resets.
  const [searchSeq, setSearchSeq] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const honeypot = String(new FormData(e.currentTarget as HTMLFormElement).get("website") ?? "");
    setError(null);
    setAlumni(null);
    setAlumniError(false);
    setLoading(true);
    try {
      const r = await apiPost<{ alumni?: PersonData[]; alumniError?: boolean; error?: string }>(
        "/api/alumni",
        { company, domain, school },
        { honeypot, timed: true }
      );
      if (!r.ok) {
        setError(errorMessage(r, "Couldn't search alumni."));
        return;
      }
      const people = r.data.alumni ?? [];
      const err = Boolean(r.data.alumniError);
      setAlumni(people);
      setAlumniError(err);
      setResultSchool(school.trim());
      setSearchSeq((n) => n + 1);
      // Persist onto the session so it survives switching tabs.
      onResult({ people, school: school.trim(), error: err });
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
            {/* Honeypot — hidden from users, only bots fill it. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ display: "none" }}
            />
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
          key={`alumni-${searchSeq}`}
          title="Alumni"
          hint={`from ${resultSchool}`}
          people={alumni}
          hasError={alumniError}
          onEnrich={onEnrich}
          onProfile={onProfile}
          variant="pink"
          enrichedUrls={enrichedUrls}
          profiledUrls={profiledUrls}
        />
      )}
    </div>
  );
}
