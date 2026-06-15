"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PersonData } from "./PersonCard";
import { PipelineProgress } from "./PipelineProgress";

const ENRICH_STEPS = [
  { label: "Searching for their email", delay: 0 },
  { label: "Pulling their full profile", delay: 1400 },
];

export interface EnrichLink {
  label: string;
  url: string;
}

export interface EnrichData {
  emails: string[];
  phones: string[];
  source: "tomba" | "contactout" | "none";
  company: string | null;
  position: string | null;
  location: string | null;
  links: EnrichLink[];
}

interface EnrichDrawerProps {
  person: PersonData | null;
  data: EnrichData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mt-8 mb-3">
      {children}
    </div>
  );
}

export function EnrichDrawer({ person, data, loading, error, onClose }: EnrichDrawerProps) {
  const isOpen = person !== null;

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const emails = data?.emails ?? [];
  const phones = data?.phones ?? [];
  const links = data?.links ?? [];
  const hasContact = emails.length > 0 || phones.length > 0;
  const hasProfile = Boolean(data?.company || data?.location || links.length > 0);
  const nothing = !loading && !error && data && !hasContact && !hasProfile;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          backgroundColor: "rgba(0,0,0,0.7)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 120ms steps(3)",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-base border-l-[3px] border-line z-50 overflow-y-auto"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 140ms steps(4)",
        }}
      >
        <button
          onClick={onClose}
          className="nb-btn absolute top-4 right-4 p-1.5"
          aria-label="Close"
        >
          <X size={16} strokeWidth={3} />
        </button>

        <div className="pb-16">
          {loading && (
            <div className="px-6 pt-14">
              <p className="font-mono font-bold text-xs text-acc-red uppercase tracking-widest mb-6">
                ▌ resolving contact…
              </p>
              <PipelineProgress steps={ENRICH_STEPS} accent="var(--color-acc-yellow)" />
            </div>
          )}

          {error && (
            <div className="mx-6 mt-14 nb-flat bg-acc-pink text-base font-bold text-sm px-4 py-3">
              ⚠ {error}
            </div>
          )}

          {!loading && !error && person && (
            <>
              {/* Header */}
              <div
                className="border-b-[3px] border-line px-6 pt-12 pb-5"
                style={{ backgroundColor: "var(--color-acc-yellow)" }}
              >
                <h2 className="font-display text-3xl leading-none tracking-tight text-ink uppercase">
                  {person.name || "—"}
                </h2>
                {(person.title || data?.position) && (
                  <p className="font-bold text-ink/70 text-sm mt-1">
                    {person.title || data?.position}
                  </p>
                )}
                {(data?.company || data?.location) && (
                  <p className="font-mono font-bold text-ink/70 text-[11px] uppercase tracking-wide mt-1">
                    {[data?.company, data?.location].filter(Boolean).join("  ·  ")}
                  </p>
                )}
              </div>

              <div className="px-6">
                {hasContact && (
                  <>
                    <Band>■ Contact</Band>
                    <div className="space-y-2">
                      {emails.map((email) => (
                        <a
                          key={email}
                          href={`mailto:${email}`}
                          className="nb-flat block bg-panel px-3 py-2 text-sm font-bold font-mono text-acc-blue underline hover:bg-acc-blue hover:text-base break-all"
                        >
                          {email}
                        </a>
                      ))}
                      {phones.map((phone) => (
                        <a
                          key={phone}
                          href={`tel:${phone}`}
                          className="nb-flat block bg-panel px-3 py-2 text-sm font-bold font-mono text-acc-blue underline hover:bg-acc-blue hover:text-base"
                        >
                          {phone}
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {links.length > 0 && (
                  <>
                    <Band>■ Around the web</Band>
                    <div className="space-y-2">
                      {links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="nb-flat flex items-center justify-between gap-3 bg-panel px-3 py-2 text-sm font-bold font-mono text-acc-blue underline hover:bg-acc-blue hover:text-base break-all"
                        >
                          <span className="flex-none no-underline opacity-60 text-[11px] uppercase tracking-widest">
                            {link.label}
                          </span>
                          <span className="truncate">{link.url.replace(/^https?:\/\//, "")}</span>
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {nothing && (
                  <div className="mt-12 nb-flat bg-panel px-4 py-6 text-center">
                    <p className="text-sm font-bold text-muted font-mono">
                      No contact info found.
                    </p>
                    <a
                      href={person.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-3 text-acc-blue font-bold text-sm hover:underline"
                    >
                      Open LinkedIn profile →
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
