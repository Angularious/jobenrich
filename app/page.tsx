"use client";

import { useState } from "react";
import { SearchForm } from "@/components/SearchForm";
import { ResultsSection } from "@/components/ResultsSection";
import { AlumniFinder } from "@/components/AlumniFinder";
import { EnrichDrawer, EnrichData } from "@/components/EnrichDrawer";
import { PipelineProgress } from "@/components/PipelineProgress";
import { OrthogonalBadge } from "@/components/OrthogonalBadge";
import type { PersonData } from "@/components/PersonCard";

interface SearchResults {
  jobTitle: string;
  company: string;
  domain: string | null;
  people: PersonData[];
  peopleError: boolean;
  recruiters: PersonData[];
  recruitersError: boolean;
}

const SEARCH_STEPS = [
  { label: "Reading the job posting", delay: 0 },
  { label: "Finding people at the company", delay: 3500 },
  { label: "Tracking down recruiters", delay: 3500 },
];

export default function Home() {
  const [jobUrl, setJobUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);

  // Enriched contacts are cached per LinkedIn URL so reopening is instant + free.
  const [enrichCache, setEnrichCache] = useState<Record<string, EnrichData>>({});
  const [enrichTarget, setEnrichTarget] = useState<PersonData | null>(null);
  const [enrichData, setEnrichData] = useState<EnrichData | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const enrichedUrls = new Set(Object.keys(enrichCache));

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResults(data);
    } catch {
      setError("Request failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrich(person: PersonData) {
    setEnrichTarget(person);
    setEnrichError(null);

    // Already pulled — just reopen the cached result, no re-fetch.
    const cached = enrichCache[person.linkedinUrl];
    if (cached) {
      setEnrichData(cached);
      setEnrichLoading(false);
      return;
    }

    setEnrichData(null);
    setEnrichLoading(true);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: person.linkedinUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEnrichError(data.error ?? "Enrichment failed. Try again.");
        return;
      }
      const result = data as EnrichData;
      setEnrichData(result);
      setEnrichCache((prev) => ({ ...prev, [person.linkedinUrl]: result }));
    } catch {
      setEnrichError("Enrichment failed. Try again.");
    } finally {
      setEnrichLoading(false);
    }
  }

  // Close only hides the drawer — the cache (and search results) are kept.
  function closeDrawer() {
    setEnrichTarget(null);
    setEnrichData(null);
    setEnrichError(null);
  }

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="border-b-[3px] border-line">
        <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-6xl sm:text-7xl text-ink leading-[0.85] tracking-tight uppercase">
              Job Intel
            </h1>
            <p className="font-mono font-bold text-acc-red text-xs sm:text-sm mt-2 uppercase tracking-wide">
              ▌ surface the people behind any job
            </p>
          </div>
          <OrthogonalBadge size={116} />
        </div>

        {/* Marquee stripe */}
        <div className="bg-acc-red overflow-hidden border-t-[3px] border-line py-1.5">
          <div
            className="whitespace-nowrap font-mono font-bold text-base text-xs uppercase tracking-widest"
            style={{ animation: "nbMarquee 18s linear infinite" }}
          >
            {Array(6)
              .fill("★ paste a job ★ meet the team ★ get the intro ")
              .join("")}
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="max-w-[860px] mx-auto px-4 sm:px-6 py-8 pb-24">
        <p className="font-bold text-sm text-muted mb-5 border-l-[3px] border-acc-red pl-3">
          Paste a LinkedIn job URL. We surface people at that company you should
          reach out to — plus the recruiters hiring for it.
        </p>

        <SearchForm
          jobUrl={jobUrl}
          loading={loading}
          error={error}
          onJobUrlChange={setJobUrl}
          onSubmit={handleSearch}
        />

        {loading && (
          <div className="nb-card mt-6 p-6" style={{ ["--nb" as string]: "var(--color-acc-blue)" }}>
            <p className="font-mono font-bold text-xs text-acc-blue uppercase tracking-widest mb-4">
              ▌ working…
            </p>
            <PipelineProgress steps={SEARCH_STEPS} accent="var(--color-acc-blue)" />
          </div>
        )}

        {results && (
          <>
            {/* Job banner */}
            <div className="nb-flat mt-6 bg-panel px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[11px] text-dim uppercase tracking-widest">
                hiring for
              </span>
              <span className="font-black text-sm text-ink">{results.jobTitle || "Role"}</span>
              <span className="font-bold text-acc-red text-sm">@ {results.company}</span>
            </div>

            <ResultsSection
              title="People to talk to"
              hint="at the company"
              people={results.people}
              hasError={results.peopleError}
              onEnrich={handleEnrich}
              variant="blue"
              enrichedUrls={enrichedUrls}
            />
            <ResultsSection
              title="Recruiters"
              hint="hiring now"
              people={results.recruiters}
              hasError={results.recruitersError}
              onEnrich={handleEnrich}
              variant="green"
              enrichedUrls={enrichedUrls}
            />

            <AlumniFinder
              company={results.company}
              domain={results.domain}
              onEnrich={handleEnrich}
              enrichedUrls={enrichedUrls}
            />
          </>
        )}
      </main>

      <EnrichDrawer
        person={enrichTarget}
        data={enrichData}
        loading={enrichLoading}
        error={enrichError}
        onClose={closeDrawer}
      />
    </>
  );
}
