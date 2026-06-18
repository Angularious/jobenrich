"use client";

import { useEffect, useState } from "react";
import { apiPost, primeSecurity, errorMessage } from "@/lib/security/client";
import { SearchForm } from "@/components/SearchForm";
import { ResultsSection } from "@/components/ResultsSection";
import { AlumniFinder } from "@/components/AlumniFinder";
import { SampleResults } from "@/components/SampleResults";
import { HiringAd } from "@/components/HiringAd";
import { EnrichDrawer, EnrichData } from "@/components/EnrichDrawer";
import { PipelineProgress } from "@/components/PipelineProgress";
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

  // Prime the request token + page-load stamp as early as possible.
  useEffect(() => {
    primeSecurity();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const honeypot = String(new FormData(e.currentTarget as HTMLFormElement).get("website") ?? "");
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      const r = await apiPost<SearchResults & { error?: string }>(
        "/api/search",
        { jobUrl },
        { honeypot, timed: true }
      );
      if (!r.ok) {
        setError(errorMessage(r, "Something went wrong."));
        return;
      }
      setResults(r.data);
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
      const r = await apiPost<EnrichData & { error?: string }>("/api/enrich", {
        linkedinUrl: person.linkedinUrl,
      });
      if (!r.ok) {
        setEnrichError(errorMessage(r, "Enrichment failed. Try again."));
        return;
      }
      const result = r.data as EnrichData;
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
        <div className="max-w-[1040px] mx-auto px-5 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="font-display text-2xl sm:text-3xl text-ink leading-none tracking-tight uppercase">
              Job Enrich
            </span>
          </div>
          {/* Simple linked text credit on all sizes (no animated badge). */}
          <a
            href="https://orthogonal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-none font-mono text-[10px] sm:text-[11px] text-dim uppercase tracking-widest whitespace-nowrap hover:text-acc-red"
          >
            powered by orthogonal
          </a>
        </div>

        {/* Marquee stripe — two identical tracks for a seamless −50% loop. */}
        <div className="bg-acc-red overflow-hidden border-t-[3px] border-line py-1.5">
          <div className="flex w-max" style={{ animation: "nbMarquee 40s linear infinite" }}>
            {[0, 1].map((i) => (
              <span
                key={i}
                className="whitespace-nowrap font-mono font-bold text-base text-xs uppercase tracking-widest"
              >
                {"★ paste a job ★ meet the team ★ get the intro ".repeat(8)}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="max-w-[780px] mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24">
        {/* Value prop is the focal point; form below, sample preview under it. */}
        <h2 className="font-display text-4xl sm:text-5xl text-ink leading-[0.92] tracking-tight uppercase mb-6 break-words text-center">
          Meet the people who can get you in
        </h2>

        <SearchForm
          jobUrl={jobUrl}
          loading={loading}
          error={error}
          onJobUrlChange={setJobUrl}
          onSubmit={handleSearch}
        />

        {!results && !loading && (
          <div className="mt-10">
            <SampleResults />
          </div>
        )}

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

      <HiringAd />
    </>
  );
}
