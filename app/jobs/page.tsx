"use client";

import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { apiPost, primeSecurity, errorMessage } from "@/lib/security/client";
import { JobSearchForm } from "@/components/jobs/JobSearchForm";
import { JobListingCard } from "@/components/jobs/JobListingCard";
import { ResultsSection } from "@/components/ResultsSection";
import { EnrichDrawer, EnrichData } from "@/components/EnrichDrawer";
import { PipelineProgress } from "@/components/PipelineProgress";
import type { PersonData } from "@/components/PersonCard";
import type { JobListing, JobSearchParams, JobSearchResult } from "@/types/job";

// People + recruiters surfaced for one listing (the v1 /api/search response).
interface PeopleResult {
  jobTitle: string | null;
  company: string;
  domain: string | null;
  people: PersonData[];
  peopleError: boolean;
  recruiters: PersonData[];
  recruitersError: boolean;
}

// One in-app search "tab" — a saved search the user can switch back to. The
// data fields persist to sessionStorage; the loading flags are transient (reset
// to false on hydrate, never trusted from storage).
interface SearchTab {
  id: string;
  title: string;
  params: JobSearchParams | null;
  jobs: JobListing[] | null;
  loading: boolean;
  error: string | null;
  selectedListingId: string | null;
  peopleLoading: boolean;
  peopleError: string | null;
  people: Record<string, PeopleResult>; // keyed by listing id
}

// ── Session persistence ─────────────────────────────────────────────
// sessionStorage = one browser tab, one session: survives reload/navigation
// within the tab, but a NEW browser tab starts empty and closing the tab wipes
// it. This honors the no-cross-user-persistence policy (it's per-tab, never
// shared) — see CLAUDE.md. There is deliberately no server-side job cache.
const STORE = {
  tabs: "jobsearch.tabs.v1",
  active: "jobsearch.activeTab.v1",
  enrich: "jobsearch.enrich.v1",
  search: "jobsearch.searchCache.v1",
} as const;

const SEARCH_STEPS = [
  { label: "Searching live job postings", delay: 0 },
  { label: "Ranking the freshest matches", delay: 2500 },
];
const PEOPLE_STEPS = [
  { label: "Finding people at the company", delay: 0 },
  { label: "Tracking down recruiters", delay: 3500 },
];

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
  }
}

function emptyTab(): SearchTab {
  return {
    id: newId(),
    title: "New search",
    params: null,
    jobs: null,
    loading: false,
    error: null,
    selectedListingId: null,
    peopleLoading: false,
    peopleError: null,
    people: {},
  };
}

function tabTitle(params: JobSearchParams): string {
  return [params.role, params.location].filter(Boolean).join(" · ") || "Search";
}

// ── Empty-state helpers ──────────────────────────────────────────────
// A zero-result search is usually a too-narrow filter combo (e.g. a rare
// role + internship + a specific city + a tight time window), not a failure.
// Tell the user exactly what they searched and which filters to loosen.
const EMP_LABEL: Record<string, string> = {
  FULL_TIME: "full-time",
  PART_TIME: "part-time",
  CONTRACTOR: "contract",
  INTERN: "internship",
};
const FRESH_LABEL: Record<string, string> = {
  "1h": "the past hour",
  "24h": "the past 24 hours",
  "7d": "the past week",
  "6m": "the past 6 months",
};

function emptyHeadline(p: JobSearchParams | null): string {
  if (!p) return "No postings matched.";
  const role = p.role ? `“${p.role}”` : "matching";
  const type = p.employmentType ? ` ${EMP_LABEL[p.employmentType] ?? ""}` : "";
  const loc = p.location ? ` in ${p.location}` : "";
  const when = p.freshness ? ` posted in ${FRESH_LABEL[p.freshness] ?? "this window"}` : "";
  return `No ${role}${type} roles${loc}${when}.`;
}

function emptySuggestions(p: JobSearchParams | null): string[] {
  const s: string[] = [];
  if (p?.employmentType) {
    s.push(`remove the ${EMP_LABEL[p.employmentType] ?? "employment-type"} filter`);
  }
  if (p?.remoteOnly) s.push("turn off remote-only");
  if (p?.location) s.push("widen or drop the location");
  if (p?.freshness && p.freshness !== "6m") s.push("expand the time window");
  s.push("try a broader or related role");
  return s;
}

// Loading flags must never be restored as true (a reload mid-fetch would wedge
// the UI). Strip them on read and write.
function sanitizeTab(t: SearchTab): SearchTab {
  return { ...t, loading: false, peopleLoading: false };
}

export default function JobsPage() {
  const [tabs, setTabs] = useState<SearchTab[]>(() => [emptyTab()]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  // Session-wide caches, shared across ALL in-app tabs (so re-running the same
  // search, or re-opening the same contact, is free for the rest of the visit).
  const [searchCache, setSearchCache] = useState<Record<string, JobListing[]>>({});
  const [enrichCache, setEnrichCache] = useState<Record<string, EnrichData>>({});
  const [hydrated, setHydrated] = useState(false);

  // Enrich drawer state (transient — mirrors app/page.tsx).
  const [enrichTarget, setEnrichTarget] = useState<PersonData | null>(null);
  const [enrichData, setEnrichData] = useState<EnrichData | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;
  const enrichedUrls = new Set(Object.keys(enrichCache));

  // ── Hydrate from sessionStorage on mount (client-only) ─────────────
  useEffect(() => {
    primeSecurity();
    try {
      const rawTabs = sessionStorage.getItem(STORE.tabs);
      if (rawTabs) {
        const parsed = JSON.parse(rawTabs) as SearchTab[];
        if (Array.isArray(parsed) && parsed.length) {
          const clean = parsed.map(sanitizeTab);
          setTabs(clean);
          const storedActive = sessionStorage.getItem(STORE.active);
          setActiveTabId(
            storedActive && clean.some((t) => t.id === storedActive)
              ? storedActive
              : clean[0]!.id
          );
        }
      }
      const rawSearch = sessionStorage.getItem(STORE.search);
      if (rawSearch) setSearchCache(JSON.parse(rawSearch));
      const rawEnrich = sessionStorage.getItem(STORE.enrich);
      if (rawEnrich) setEnrichCache(JSON.parse(rawEnrich));
    } catch {
      /* corrupt storage — fall back to the seeded empty tab */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Make sure an active tab is always selected.
  useEffect(() => {
    if (!activeTabId && tabs.length) setActiveTabId(tabs[0]!.id);
  }, [tabs, activeTabId]);

  // ── Persist (only after hydration, so we never overwrite stored state
  //    with the seeded empty tab before we've read it) ────────────────
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORE.tabs, JSON.stringify(tabs.map(sanitizeTab)));
      sessionStorage.setItem(STORE.active, activeTabId);
    } catch {
      /* storage full / unavailable — in-memory state still works this session */
    }
  }, [tabs, activeTabId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORE.search, JSON.stringify(searchCache));
    } catch {
      /* ignore */
    }
  }, [searchCache, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORE.enrich, JSON.stringify(enrichCache));
    } catch {
      /* ignore */
    }
  }, [enrichCache, hydrated]);

  function patchTab(id: string, patch: Partial<SearchTab>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  // ── Tab management ─────────────────────────────────────────────────
  function openNewTab() {
    const t = emptyTab();
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = emptyTab();
        setActiveTabId(fresh.id);
        return [fresh];
      }
      if (id === activeTabId) setActiveTabId(next[next.length - 1]!.id);
      return next;
    });
  }

  // ── Search → fills the ACTIVE tab ──────────────────────────────────
  async function handleSearch(params: JobSearchParams, honeypot: string) {
    const id = activeTab.id;
    const key = JSON.stringify(params);
    patchTab(id, {
      params,
      title: tabTitle(params),
      error: null,
      selectedListingId: null,
      peopleError: null,
    });

    // Already run this exact search this session → free, no API call.
    const cached = searchCache[key];
    if (cached) {
      patchTab(id, { jobs: cached, loading: false });
      return;
    }

    patchTab(id, { jobs: null, loading: true });
    try {
      const r = await apiPost<JobSearchResult & { error?: string }>(
        "/api/jobs/search",
        { ...params },
        { honeypot }
      );
      if (!r.ok) {
        patchTab(id, { loading: false, error: errorMessage(r, "Couldn't load job listings.") });
        return;
      }
      const list = r.data.jobs ?? [];
      patchTab(id, { jobs: list, loading: false });
      setSearchCache((prev) => ({ ...prev, [key]: list }));
    } catch {
      patchTab(id, { loading: false, error: "Request failed. Check your connection." });
    }
  }

  // "Find people" → run the v1 people/recruiter waterfall via /api/search,
  // skipping its scrape/LLM resolve by passing the structured fields Fantastic
  // Jobs already gave us (Option B). `timed: true` is REQUIRED — the "search"
  // step is timing-gated, so the page-load stamp must be sent or it 403s.
  async function handleFindPeople(job: JobListing) {
    const id = activeTab.id;
    patchTab(id, { selectedListingId: job.id, peopleError: null });

    if (activeTab.people[job.id]) return; // already pulled — just re-expand

    patchTab(id, { peopleLoading: true });
    try {
      const r = await apiPost<PeopleResult & { error?: string }>(
        "/api/search",
        {
          companyName: job.company,
          companyDomain: job.companyDomain ?? undefined,
          jobTitle: job.title,
          jobLocation: job.location ?? undefined,
        },
        { timed: true }
      );
      if (!r.ok) {
        patchTab(id, {
          peopleLoading: false,
          peopleError: errorMessage(r, "Couldn't find people for this listing."),
        });
        return;
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, peopleLoading: false, people: { ...t.people, [job.id]: r.data } }
            : t
        )
      );
    } catch {
      patchTab(id, { peopleLoading: false, peopleError: "Request failed. Check your connection." });
    }
  }

  // Per-person contact reveal — identical to app/page.tsx's handleEnrich, but
  // the cache is session-wide (shared across tabs).
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
          <a href="/jobs" className="min-w-0">
            <span className="font-display text-2xl sm:text-3xl text-ink leading-none tracking-tight uppercase">
              Job Search
            </span>
          </a>
          <div className="flex-none flex items-center gap-3 sm:gap-4">
            {/* Back to the v1 URL-paste flow. */}
            <a
              href="/"
              className="font-mono font-bold text-[10px] sm:text-[11px] text-ink uppercase tracking-widest whitespace-nowrap underline hover:text-acc-red"
            >
              Paste a URL →
            </a>
            <a
              href="https://orthogonal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] sm:text-[11px] text-dim uppercase tracking-widest whitespace-nowrap hover:text-acc-red"
            >
              powered by orthogonal
            </a>
          </div>
        </div>
        <div className="bg-acc-red overflow-hidden border-t-[3px] border-line py-1.5">
          <div className="flex w-max" style={{ animation: "nbMarquee 40s linear infinite" }}>
            {[0, 1].map((i) => (
              <span
                key={i}
                className="whitespace-nowrap font-mono font-bold text-base text-xs uppercase tracking-widest"
              >
                {"★ search a role ★ pick a job ★ meet the team ".repeat(8)}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="border-b-[3px] border-line bg-panel2">
        <div className="max-w-[780px] mx-auto px-2 sm:px-4 flex items-stretch gap-0 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.id === activeTab.id;
            return (
              <div
                key={t.id}
                className={`flex items-center gap-2 border-r-[3px] border-line px-3 py-2 cursor-pointer whitespace-nowrap ${
                  active ? "bg-ink text-base" : "bg-transparent text-ink hover:bg-panel"
                }`}
                onClick={() => setActiveTabId(t.id)}
              >
                <span className="font-mono font-bold text-[11px] uppercase tracking-widest max-w-[160px] truncate">
                  {t.title}
                </span>
                <button
                  type="button"
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="flex-none hover:text-acc-red"
                >
                  <X size={13} strokeWidth={3} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={openNewTab}
            aria-label="New search"
            className="flex items-center gap-1 px-3 py-2 font-mono font-bold text-[11px] uppercase tracking-widest text-ink hover:bg-panel whitespace-nowrap"
          >
            <Plus size={13} strokeWidth={3} /> New
          </button>
        </div>
      </div>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="max-w-[780px] mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24">
        <h2 className="font-display text-4xl sm:text-5xl text-ink leading-[0.92] tracking-tight uppercase mb-6 break-words text-center">
          Search the role. Meet the team.
        </h2>

        <JobSearchForm
          key={activeTab.id}
          loading={activeTab.loading}
          error={activeTab.error}
          onSearch={handleSearch}
          initial={activeTab.params ?? undefined}
        />

        {activeTab.loading && (
          <div className="nb-card mt-6 p-6" style={{ ["--nb" as string]: "var(--color-acc-blue)" }}>
            <p className="font-mono font-bold text-xs text-acc-blue uppercase tracking-widest mb-4">
              ▌ searching…
            </p>
            <PipelineProgress steps={SEARCH_STEPS} accent="var(--color-acc-blue)" />
          </div>
        )}

        {activeTab.jobs && !activeTab.loading && (
          <div className="mt-8">
            <p className="font-mono font-bold text-[11px] uppercase tracking-widest text-dim mb-2">
              {activeTab.jobs.length > 0
                ? `${activeTab.jobs.length} listing${activeTab.jobs.length === 1 ? "" : "s"}`
                : "No listings"}
            </p>

            {activeTab.jobs.length === 0 && (
              <div className="nb-flat bg-panel px-4 py-6 text-dim text-xs font-bold font-mono leading-relaxed">
                <p className="text-ink mb-3">{emptyHeadline(activeTab.params)}</p>
                <p className="mb-1 uppercase tracking-widest text-[10px]">Try one of these:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {emptySuggestions(activeTab.params).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {/* One-tap re-search on the LinkedIn/Wellfound/YC feed (better for
                    interns + startups). Only a deliberate click spends another $0.40. */}
                {activeTab.params &&
                  activeTab.params.board !== "jb" &&
                  activeTab.params.employmentType?.toUpperCase() !== "INTERN" && (
                    <button
                      type="button"
                      onClick={() => handleSearch({ ...activeTab.params!, board: "jb" }, "")}
                      className="nb-btn mt-4 px-4 py-2 text-[11px] font-black uppercase tracking-wider"
                    >
                      Search LinkedIn &amp; startups instead →
                    </button>
                  )}
              </div>
            )}

            {activeTab.jobs.map((job) => (
              <div key={job.id}>
                <JobListingCard
                  job={job}
                  onFindPeople={handleFindPeople}
                  searched={Boolean(activeTab.people[job.id])}
                />

                {/* People for the currently-expanded listing render inline. */}
                {activeTab.selectedListingId === job.id && (
                  <div className="ml-3 sm:ml-6 border-l-[3px] border-line/30 pl-3 sm:pl-5">
                    {activeTab.peopleLoading && (
                      <div className="nb-card mt-4 p-6" style={{ ["--nb" as string]: "var(--color-acc-blue)" }}>
                        <p className="font-mono font-bold text-xs text-acc-blue uppercase tracking-widest mb-4">
                          ▌ finding people…
                        </p>
                        <PipelineProgress steps={PEOPLE_STEPS} accent="var(--color-acc-blue)" />
                      </div>
                    )}

                    {activeTab.peopleError && !activeTab.peopleLoading && (
                      <div className="nb-flat bg-acc-pink text-base font-bold text-sm px-4 py-3 mt-4">
                        ⚠ {activeTab.peopleError}
                      </div>
                    )}

                    {activeTab.people[job.id] && !activeTab.peopleLoading && (
                      <>
                        <ResultsSection
                          title="People to talk to"
                          hint="at the company"
                          people={activeTab.people[job.id]!.people}
                          hasError={activeTab.people[job.id]!.peopleError}
                          onEnrich={handleEnrich}
                          variant="blue"
                          enrichedUrls={enrichedUrls}
                          emptyMessage="No matching people surfaced for this company yet. Check the recruiters below."
                        />
                        <ResultsSection
                          title="Recruiters"
                          hint="hiring now"
                          people={activeTab.people[job.id]!.recruiters}
                          hasError={activeTab.people[job.id]!.recruitersError}
                          onEnrich={handleEnrich}
                          variant="green"
                          enrichedUrls={enrichedUrls}
                          emptyMessage="No recruiters found — early-stage teams often hire directly, so reach out to the people above."
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
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
