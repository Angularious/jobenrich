"use client";

import { useState } from "react";
import { SearchForm } from "@/components/SearchForm";
import { ResultsSection } from "@/components/ResultsSection";
import { EnrichDrawer, EnrichData } from "@/components/EnrichDrawer";
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
      <main className="max-w-[880px] mx-auto px-6 pt-16 pb-24">
        {/* Wordmark */}
        <h1 className="font-serif text-2xl text-ink mb-2">Job Intel</h1>
        <p className="text-muted text-sm mb-16">
          Enter a LinkedIn job posting URL and a school name to surface relevant people.
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

        {results && (
          <div className="mt-24">
            <ResultsSection
              title="Similar Roles"
              people={results.similarRoles}
              hasError={results.similarRolesError}
              onEnrich={handleEnrich}
            />
            <ResultsSection
              title={`From ${school.trim() || "School"}`}
              people={results.schoolMatches}
              hasError={results.schoolMatchesError}
              onEnrich={handleEnrich}
            />
            <ResultsSection
              title="Recruiters"
              people={results.recruiters}
              hasError={results.recruitersError}
              onEnrich={handleEnrich}
            />

            <p className="mt-24 text-dim text-xs text-center">
              Search ~$0.24 · Enrichment $0.55
            </p>
          </div>
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
