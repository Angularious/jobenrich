"use client";

import { useMemo, useState } from "react";
import { SearchForm } from "@/components/SearchForm";
import { ResultsSection } from "@/components/ResultsSection";
import { EnrichDrawer, EnrichData } from "@/components/EnrichDrawer";
import { PipelineProgress } from "@/components/PipelineProgress";
import { OrthogonalBadge } from "@/components/OrthogonalBadge";
import type { PersonData } from "@/components/PersonCard";

interface SearchResults {
  jobTitle: string;
  company: string;
  similarRoles: PersonData[];
  similarRolesError: boolean;
  schoolMatches: PersonData[];
  schoolMatchesError: boolean;
  recruiters: PersonData[];
  recruitersError: boolean;
}

export default function Home() {
  const [jobUrl, setJobUrl] = useState("");
  const [school, setSchool] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);

  const [enrichTarget, setEnrichTarget] = useState<PersonData | null>(null);
  const [enrichData, setEnrichData] = useState<EnrichData | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const searchSteps = useMemo(
    () => [
      { label: "Extracting job details from LinkedIn", delay: 0 },
      { label: "Finding people in similar roles", delay: 4000 },
      { label: `Matching ${school.trim() || "school"} alumni`, delay: 4000 },
      { label: "Searching for recruiters", delay: 4000 },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading]
  );

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl, school }),
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
    setEnrichData(null);
    setEnrichError(null);
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
      setEnrichData(data as EnrichData);
    } catch {
      setEnrichError("Enrichment failed. Try again.");
    } finally {
      setEnrichLoading(false);
    }
  }

  function closeDrawer() {
    setEnrichTarget(null);
    setEnrichData(null);
    setEnrichError(null);
  }

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="border-b-4 border-market-black">
        <div className="bg-market-yellow px-6 py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-5xl sm:text-6xl text-market-black leading-none tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              JOB INTEL
            </h1>
            <p className="font-black text-market-red text-xs sm:text-sm mt-1 uppercase tracking-wide">
              ★ 求职情报 · Surface People Behind Any Job ★
            </p>
          </div>
          <OrthogonalBadge size={128} />
        </div>

        {/* Red stripe */}
        <div className="bg-market-red py-2">
          <p className="text-center text-white font-black text-xs uppercase tracking-widest">
            ★ PROFESSIONAL NETWORK INTELLIGENCE TOOL · 职业人脉分析平台 ★
          </p>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="max-w-[880px] mx-auto px-4 sm:px-6 py-8 pb-24">

        {/* Instructional line */}
        <p className="font-bold text-sm text-market-black mb-5 border-l-4 border-market-yellow pl-3">
          Paste any LinkedIn job URL · Enter a school name · Get instant people intelligence
        </p>

        <SearchForm
          jobUrl={jobUrl}
          school={school}
          loading={loading}
          error={error}
          onJobUrlChange={setJobUrl}
          onSchoolChange={setSchool}
          onSubmit={handleSearch}
        />

        {/* Pipeline progress */}
        {loading && (
          <div className="mt-6 border-4 border-market-black bg-white p-6">
            <p className="font-black text-xs text-market-red uppercase tracking-widest mb-4">
              ■ PROCESSING... ■
            </p>
            <PipelineProgress steps={searchSteps} />
          </div>
        )}

        {/* Results */}
        {results && (
          <>
            {/* Job summary banner */}
            <div className="mt-6 bg-market-black text-white px-4 py-3 flex flex-wrap gap-x-6 gap-y-1">
              <span className="font-black text-sm">
                ★ {results.jobTitle || "Role"}
              </span>
              <span className="font-bold text-market-yellow text-sm">
                @ {results.company || "Company"}
              </span>
            </div>

            <ResultsSection
              title="Similar Roles 相似职位"
              people={results.similarRoles}
              hasError={results.similarRolesError}
              onEnrich={handleEnrich}
              variant="red"
            />
            <ResultsSection
              title={`From ${school.trim() || "School"} · 校友`}
              people={results.schoolMatches}
              hasError={results.schoolMatchesError}
              onEnrich={handleEnrich}
              variant="yellow"
            />
            <ResultsSection
              title="Recruiters · 招聘者"
              people={results.recruiters}
              hasError={results.recruitersError}
              onEnrich={handleEnrich}
              variant="green"
            />

            {/* Cost note */}
            <div className="mt-6 border-2 border-market-black bg-market-yellow/40 px-4 py-3">
              <p className="font-bold text-xs text-market-black">
                ★ API Cost: Search ~$0.24 · Enrichment $0.55 per person
              </p>
            </div>
          </>
        )}
      </main>

      {/* ── Footer banner ──────────────────────────────────── */}
      <footer className="border-t-4 border-market-black bg-market-red">
        <div className="max-w-[880px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-white text-center sm:text-left">
            <p className="font-black text-base uppercase tracking-wide">
              ★ POWERED BY ORTHOGONAL ★
            </p>
            <p className="font-bold text-xs text-market-yellow mt-0.5">
              The API marketplace for AI applications
            </p>
          </div>

          <a
            href="https://orthogonal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-market-yellow text-market-black font-black text-sm uppercase tracking-widest px-8 py-4 border-2 border-market-black hover:bg-white inline-block"
            style={{ animation: "marketPulse 1.8s ease-in-out infinite" }}
          >
            TRY ORTHOGONAL NOW →
          </a>
        </div>
      </footer>

      {/* ── Enrich drawer ──────────────────────────────────── */}
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
