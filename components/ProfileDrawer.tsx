"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { PersonData } from "./PersonCard";

export interface ProfileJob {
  company: string;
  title: string;
  startYear: number | null;
  endYear: number | null;
  current: boolean;
}

export interface ProfileEducation {
  school: string;
  degree: string | null;
  field: string | null;
  endYear: number | null;
}

export interface ProfileData {
  bio: string | null;
  photo: string | null;
  jobs: ProfileJob[];
  education: ProfileEducation[];
  skills: string[];
  links: { label: string; url: string }[];
}

interface ProfileDrawerProps {
  person: PersonData | null;
  data: ProfileData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function YearRange({
  start,
  end,
  current,
}: {
  start: number | null;
  end: number | null;
  current: boolean;
}) {
  if (!start && !current) return null;
  return (
    <span className="font-mono text-[10px] text-dim flex-none whitespace-nowrap">
      {start ?? "?"} – {current ? "Present" : (end ?? "?")}
    </span>
  );
}

export function ProfileDrawer({ person, data, loading, error, onClose }: ProfileDrawerProps) {
  const open = Boolean(person);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const hasContent =
    data && (data.bio || data.jobs.length || data.education.length || data.skills.length);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          backgroundColor: "rgba(0,0,0,0.7)",
          opacity: open ? 1 : 0,
          transition: "opacity 120ms steps(3)",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[480px] max-w-full box-border bg-base border-l-[3px] border-line z-50 overflow-y-auto overflow-x-hidden"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 140ms steps(4)",
        }}
        aria-label="Profile research"
      >
        {person && (
          <>
            <button
              onClick={onClose}
              className="nb-btn absolute top-4 right-4 p-1.5 z-10"
              aria-label="Close"
            >
              <X size={16} strokeWidth={3} />
            </button>

            {/* Header — pr-14 keeps content clear of the close button */}
            <div
              className="border-b-[3px] border-line px-6 pt-12 pb-5 pr-14"
              style={{ backgroundColor: "var(--color-acc-yellow)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 border-[3px] border-line bg-panel flex-none overflow-hidden flex items-center justify-center">
                  {person.profilePictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={person.profilePictureUrl}
                      alt={person.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-black text-xl text-ink">
                      {person.name[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-xl sm:text-2xl leading-none tracking-tight text-ink uppercase break-words">
                    {person.name}
                  </h2>
                  <p className="font-mono text-[11px] font-bold text-ink/70 mt-0.5 truncate">
                    {person.title}
                  </p>
                </div>
              </div>
              <p className="font-mono text-[10px] font-bold text-ink/60 uppercase tracking-widest">
                ■ profile research
              </p>
            </div>

            <div className="px-6 pb-16">
              {/* Loading */}
              {loading && (
                <p className="mt-8 font-mono text-[11px] font-bold text-dim uppercase tracking-widest animate-pulse">
                  ▌ pulling profile…
                </p>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="mt-8 nb-flat bg-panel px-4 py-3">
                  <p className="font-mono text-[11px] font-bold text-acc-pink">{error}</p>
                </div>
              )}

              {/* No data */}
              {!loading && data && !hasContent && (
                <div className="mt-8 nb-flat bg-panel px-4 py-3">
                  <p className="font-mono text-[11px] font-bold text-dim">
                    No profile data found. Try enriching contact info — Apollo returns richer
                    profiles for verified contacts.
                  </p>
                </div>
              )}

              {/* Profile data */}
              {!loading && data && hasContent && (
                <>
                  {data.bio && (
                    <div className="mt-8">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mb-2">
                        ■ Bio
                      </p>
                      <p className="font-mono text-xs text-ink leading-relaxed">{data.bio}</p>
                    </div>
                  )}

                  {data.jobs.length > 0 && (
                    <div className="mt-8">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mb-3">
                        ■ Career
                      </p>
                      <div className="space-y-2">
                        {data.jobs.map((j, i) => (
                          <div key={i} className="nb-flat px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-black text-xs text-ink uppercase tracking-wide leading-snug">
                                  {j.title}
                                </p>
                                {j.company && (
                                  <p className="font-mono text-[11px] font-bold text-acc-blue mt-0.5">
                                    {j.company}
                                  </p>
                                )}
                              </div>
                              <YearRange start={j.startYear} end={j.endYear} current={j.current} />
                            </div>
                            {j.current && (
                              <span
                                className="inline-block mt-1.5 font-mono text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 border-[2px] border-line"
                                style={{ backgroundColor: "var(--color-acc-green)" }}
                              >
                                Current
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.education.length > 0 && (
                    <div className="mt-8">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mb-3">
                        ■ Education
                      </p>
                      <div className="space-y-2">
                        {data.education.map((e, i) => (
                          <div key={i} className="nb-flat px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-black text-xs text-ink uppercase tracking-wide leading-snug">
                                  {e.school}
                                </p>
                                {(e.degree || e.field) && (
                                  <p className="font-mono text-[11px] font-bold text-dim mt-0.5">
                                    {[e.degree, e.field].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                              {e.endYear && (
                                <span className="font-mono text-[10px] text-dim flex-none">
                                  {e.endYear}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.skills.length > 0 && (
                    <div className="mt-8">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mb-3">
                        ■ Skills
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {data.skills.map((s) => (
                          <span
                            key={s}
                            className="font-mono text-[11px] font-bold px-2 py-1 border-[2px] border-line text-ink"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.links.length > 0 && (
                    <div className="mt-8">
                      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mb-3">
                        ■ Links
                      </p>
                      <div className="space-y-2">
                        {data.links.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-mono text-xs text-acc-blue underline hover:bg-acc-blue hover:text-base px-1 -mx-1"
                          >
                            {l.label} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Footer nudge */}
              {!loading && data && (
                <div className="mt-10 nb-flat bg-panel px-4 py-3">
                  <p className="font-mono text-[11px] text-dim">
                    Find career, education, or skill overlap — then open with something specific
                    rather than a generic template.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
