"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost, primeSecurity, errorMessage } from "@/lib/security/client";
import { SearchForm } from "@/components/SearchForm";
import { ResultsSection } from "@/components/ResultsSection";
import { AlumniFinder } from "@/components/AlumniFinder";
import { SampleResults } from "@/components/SampleResults";
import { HiringAd } from "@/components/HiringAd";
import { EnrichDrawer, EnrichData } from "@/components/EnrichDrawer";
import { ProfileDrawer, ProfileData, ProfileJob, ProfileEducation } from "@/components/ProfileDrawer";
import type { SearchProfile } from "@/components/PersonCard";
import type { CompanyMeta } from "@/lib/people";
import { PipelineProgress } from "@/components/PipelineProgress";
import { SessionTabs } from "@/components/SessionTabs";
import { BuilderDrawer } from "@/components/BuilderDrawer";
import type { PersonData } from "@/components/PersonCard";

interface SearchResults {
  jobTitle: string | null;
  company: string;
  domain: string | null;
  companyMeta: CompanyMeta | null;
  people: PersonData[];
  peopleError: boolean;
  recruiters: PersonData[];
  recruitersError: boolean;
}

interface SearchSession {
  id: string;
  jobUrl: string;
  results: SearchResults;
}

const SESSION_KEY = "jobenrich_sessions";
const ACTIVE_KEY = "jobenrich_active_id";
const MAX_SESSIONS = 10;

const SEARCH_STEPS = [
  { label: "Reading the job posting", delay: 0 },
  { label: "Finding people at the company", delay: 3500 },
  { label: "Tracking down recruiters", delay: 3500 },
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function exportCSV(session: SearchSession, enrichCache: Record<string, EnrichData>) {
  const { results } = session;
  const header = ["Name", "Title", "Type", "LinkedIn URL", "Email"];
  const toRow = (p: PersonData, type: string) => {
    const e = enrichCache[p.linkedinUrl];
    return [p.name, p.title, type, p.linkedinUrl, e?.emails[0] ?? ""];
  };
  const rows = [
    header,
    ...results.people.map((p) => toRow(p, "People")),
    ...results.recruiters.map((p) => toRow(p, "Recruiter")),
  ];
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${results.company.replace(/\s+/g, "-").toLowerCase()}-contacts.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Parse ContactOut's formatted experience string into a structured job entry.
// Format: "Title at Company in YYYY - YYYY/Present"
function parseExpStr(s: string): ProfileJob | null {
  const m = s.match(/^(.+?)\s+at\s+(.+?)\s+in\s+(\d{4})\s+-\s+(\d{4}|Present)$/i);
  if (!m) return null;
  const current = m[4].toLowerCase() === "present";
  return {
    title: m[1].trim(),
    company: m[2].trim(),
    startYear: parseInt(m[3]),
    endYear: current ? null : parseInt(m[4]),
    current,
  };
}

// Parse ContactOut's formatted education string into a structured entry.
// Format: "Degree at School in YYYY - YYYY"
function parseEduStr(s: string): ProfileEducation | null {
  const m = s.match(/^(.+?)\s+at\s+(.+?)\s+in\s+(\d{4})\s+-\s+(\d{4})$/);
  if (!m) return null;
  return {
    school: m[2].trim(),
    degree: m[1].trim() || null,
    field: null,
    endYear: parseInt(m[4]),
  };
}

// Convert a ContactOut searchProfile (free, already fetched) into ProfileData.
function profileFromSearch(sp: SearchProfile): ProfileData {
  return {
    bio: sp.bio,
    photo: null,
    jobs: sp.experience.map(parseExpStr).filter((j): j is ProfileJob => j !== null).slice(0, 4),
    education: sp.education.map(parseEduStr).filter((e): e is ProfileEducation => e !== null).slice(0, 5),
    skills: [],
    links: [],
  };
}

export default function Home() {
  const [jobUrl, setJobUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SearchSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Load from sessionStorage on mount (survives refresh; cleared on new tab/window).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const storedActive = sessionStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SearchSession[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          const restoredId =
            storedActive && parsed.some((s) => s.id === storedActive)
              ? storedActive
              : parsed[parsed.length - 1].id;
          setActiveId(restoredId);
        }
      }
    } catch {
      // Ignore corrupt storage
    }
  }, []);

  // Keep sessionStorage in sync.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
    } catch {
      // Ignore quota errors
    }
  }, [sessions]);
  useEffect(() => {
    try {
      if (activeId) sessionStorage.setItem(ACTIVE_KEY, activeId);
    } catch {}
  }, [activeId]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  // Enriched contacts are cached per LinkedIn URL — shared across sessions so
  // reopening the same contact from a different search tab is instant and free.
  const [enrichCache, setEnrichCache] = useState<Record<string, EnrichData>>({});
  const [enrichTarget, setEnrichTarget] = useState<PersonData | null>(null);
  const [enrichData, setEnrichData] = useState<EnrichData | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const enrichedUrls = new Set(Object.keys(enrichCache));

  const [profileCache, setProfileCache] = useState<Record<string, ProfileData>>({});
  const [profileTarget, setProfileTarget] = useState<PersonData | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const profiledUrls = new Set(Object.keys(profileCache));

  const [companyInfoOpen, setCompanyInfoOpen] = useState(false);
  // Reset dropdown when switching tabs.
  const prevActiveId = useRef(activeId);
  if (prevActiveId.current !== activeId) {
    prevActiveId.current = activeId;
    if (companyInfoOpen) setCompanyInfoOpen(false);
  }

  useEffect(() => {
    primeSecurity();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const honeypot = String(
      new FormData(e.currentTarget as HTMLFormElement).get("website") ?? ""
    );
    setError(null);
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
      const newSession: SearchSession = {
        id: makeId(),
        jobUrl,
        results: r.data,
      };
      setSessions((prev) => [...prev, newSession].slice(-MAX_SESSIONS));
      setActiveId(newSession.id);
      setJobUrl("");
    } catch {
      setError("Request failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function closeTab(id: string) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeId === id) {
        setActiveId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }

  async function handleEnrich(person: PersonData) {
    setEnrichTarget(person);
    setEnrichError(null);

    const cached = enrichCache[person.linkedinUrl];
    if (cached) {
      setEnrichData(cached);
      setEnrichLoading(false);
      return;
    }

    setEnrichData(null);
    setEnrichLoading(true);
    try {
      // Pass only the email-availability hint (the route uses it to skip the
      // ContactOut email reveal when the search already said there's none).
      const emailHint = person.searchProfile?.contactAvailability
        ? { email: person.searchProfile.contactAvailability.email }
        : null;
      const r = await apiPost<EnrichData & { error?: string }>("/api/enrich", {
        linkedinUrl: person.linkedinUrl,
        ...(emailHint ? { contactHint: emailHint } : {}),
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

  function closeDrawer() {
    setEnrichTarget(null);
    setEnrichData(null);
    setEnrichError(null);
  }

  async function handleProfile(person: PersonData) {
    setProfileTarget(person);
    setProfileError(null);

    const cached = profileCache[person.linkedinUrl];
    if (cached) {
      setProfileData(cached);
      setProfileLoading(false);
      return;
    }

    // ContactOut search already includes experience/education/bio at no extra
    // cost. Use it directly — no API call needed for ContactOut results.
    if (person.searchProfile) {
      const result = profileFromSearch(person.searchProfile);
      setProfileData(result);
      setProfileLoading(false);
      setProfileCache((prev) => ({ ...prev, [person.linkedinUrl]: result }));
      return;
    }

    // Coresignal results have no searchProfile — fall back to Apollo ($0.01).
    setProfileData(null);
    setProfileLoading(true);
    try {
      const r = await apiPost<ProfileData & { error?: string }>("/api/profile", {
        linkedinUrl: person.linkedinUrl,
      });
      if (!r.ok) {
        setProfileError(errorMessage(r, "Profile lookup failed."));
        return;
      }
      const result = r.data as ProfileData;
      setProfileData(result);
      setProfileCache((prev) => ({ ...prev, [person.linkedinUrl]: result }));
    } catch {
      setProfileError("Profile lookup failed. Try again.");
    } finally {
      setProfileLoading(false);
    }
  }

  function closeProfileDrawer() {
    setProfileTarget(null);
    setProfileData(null);
    setProfileError(null);
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
          <a
            href="https://orthogonal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-none font-mono text-[10px] sm:text-[11px] text-dim uppercase tracking-widest whitespace-nowrap hover:text-acc-red"
          >
            powered by orthogonal
          </a>
        </div>

        {/* Marquee stripe — decorative, hidden from screen readers */}
        <div className="bg-acc-red overflow-hidden border-t-[3px] border-line py-1.5" aria-hidden="true">
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
        <h2 className="font-display text-4xl sm:text-5xl text-ink leading-[0.92] tracking-tight uppercase mb-3 break-words text-center">
          Meet the people who can get you in
        </h2>

        <p className="font-mono font-bold text-sm text-center text-dim mb-6">
          LinkedIn won&apos;t give you their contact. We will.
        </p>

        <SearchForm
          jobUrl={jobUrl}
          loading={loading}
          error={error}
          onJobUrlChange={setJobUrl}
          onSubmit={handleSearch}
        />

        {!activeSession && !loading && (
          <div className="mt-10">
            <SampleResults />
          </div>
        )}

        {loading && (
          <div
            className="nb-card mt-6 p-6"
            style={{ ["--nb" as string]: "var(--color-acc-blue)" }}
          >
            <p className="font-mono font-bold text-xs text-acc-blue uppercase tracking-widest mb-4">
              ▌ working…
            </p>
            <PipelineProgress steps={SEARCH_STEPS} accent="var(--color-acc-blue)" />
          </div>
        )}

        {/* Tab bar — appears once there's at least one saved search */}
        {sessions.length > 0 && !loading && (
          <SessionTabs
            sessions={sessions}
            activeId={activeId ?? ""}
            onSelect={setActiveId}
            onClose={closeTab}
          />
        )}

        {activeSession && (
          <>
            {/* Job banner + company context */}
            {(() => {
              const meta = activeSession.results.companyMeta;
              const hasInfo = meta && (meta.overview || meta.size || meta.hq || meta.founded);
              return (
                <div className="nb-flat mt-6 bg-panel">
                  <div className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Company logo */}
                      {meta?.logoUrl && (
                        <div className="flex-none w-9 h-9 sm:w-10 sm:h-10 border-[2px] border-line bg-base overflow-hidden flex items-center justify-center mt-0.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={meta.logoUrl}
                            alt={activeSession.results.company}
                            className="w-full h-full object-contain p-0.5"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-black text-base sm:text-lg text-ink leading-tight truncate">
                          {activeSession.results.jobTitle || "Role"}
                        </p>
                        <p className="font-bold text-sm text-acc-red mt-0.5">
                          {activeSession.results.company}
                        </p>
                        {activeSession.jobUrl && (
                          <a
                            href={activeSession.jobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-1 font-mono text-[10px] font-bold text-acc-blue underline hover:bg-acc-blue hover:text-base uppercase tracking-wide break-all"
                          >
                            ↗ View original posting
                          </a>
                        )}
                      </div>
                    </div>
                    {hasInfo && (
                      <button
                        onClick={() => setCompanyInfoOpen((v) => !v)}
                        className="flex-none mt-1 font-mono text-[10px] font-bold text-dim uppercase tracking-widest hover:text-ink whitespace-nowrap"
                      >
                        {companyInfoOpen ? "▲ less" : "▼ about"}
                      </button>
                    )}
                  </div>
                  {companyInfoOpen && meta && (
                    <div className="border-t-[2px] border-line px-4 py-3">
                      {meta.overview && (
                        <p className="font-mono text-[11px] text-ink leading-relaxed mb-2">
                          {meta.overview.length > 200 ? meta.overview.slice(0, 200) + "…" : meta.overview}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {meta.size && (
                          <span className="font-mono text-[10px] font-bold text-dim uppercase tracking-wide">
                            {meta.size.toLocaleString()}+ employees
                          </span>
                        )}
                        {meta.hq && (
                          <span className="font-mono text-[10px] font-bold text-dim uppercase tracking-wide">
                            HQ · {meta.hq}
                          </span>
                        )}
                        {meta.founded && (
                          <span className="font-mono text-[10px] font-bold text-dim uppercase tracking-wide">
                            Est. {meta.founded}
                          </span>
                        )}
                        {meta.revenue && meta.revenue >= 1_000_000 && (
                          <span className="font-mono text-[10px] font-bold text-dim uppercase tracking-wide">
                            ~${meta.revenue >= 1_000_000_000
                              ? (meta.revenue / 1_000_000_000).toFixed(1) + "B"
                              : Math.round(meta.revenue / 1_000_000) + "M"} revenue
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* key per session so the "show more" reveal resets when switching tabs */}
            <ResultsSection
              key={`people-${activeSession.id}`}
              title="People to talk to"
              hint="at the company"
              people={activeSession.results.people}
              hasError={activeSession.results.peopleError}
              onEnrich={handleEnrich}
              onProfile={handleProfile}
              variant="blue"
              enrichedUrls={enrichedUrls}
              profiledUrls={profiledUrls}
              emptyMessage="No matching people surfaced for this company yet. Try a broader role, or check the recruiters below."
            />
            <ResultsSection
              key={`recruiters-${activeSession.id}`}
              title="Recruiters"
              hint="hiring now"
              people={activeSession.results.recruiters}
              hasError={activeSession.results.recruitersError}
              onEnrich={handleEnrich}
              onProfile={handleProfile}
              variant="green"
              enrichedUrls={enrichedUrls}
              profiledUrls={profiledUrls}
              emptyMessage="No recruiters found at this company — early-stage teams often hire directly, so reach out to the people above."
            />

            <AlumniFinder
              company={activeSession.results.company}
              domain={activeSession.results.domain}
              onEnrich={handleEnrich}
              onProfile={handleProfile}
              enrichedUrls={enrichedUrls}
              profiledUrls={profiledUrls}
            />

            {/* Export + builder drawer */}
            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <BuilderDrawer />
              <button
                onClick={() => exportCSV(activeSession, enrichCache)}
                className="nb-btn flex-none font-black text-[11px] uppercase tracking-wider px-4 py-2"
              >
                ↓ Export CSV
              </button>
            </div>
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

      <ProfileDrawer
        person={profileTarget}
        data={profileData}
        loading={profileLoading}
        error={profileError}
        onClose={closeProfileDrawer}
      />

      <HiringAd />
    </>
  );
}
