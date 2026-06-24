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
  source: "apollo" | "bytemine" | "contactout" | "none";
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
  onGetPhone?: () => void;
  phoneLoading?: boolean;
  phoneAttempted?: boolean; // a phone lookup already ran for this person (even if empty)
  phoneError?: string | null;
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim mt-8 mb-3">
      {children}
    </div>
  );
}

export function EnrichDrawer({
  person,
  data,
  loading,
  error,
  onClose,
  onGetPhone,
  phoneLoading,
  phoneAttempted,
  phoneError,
}: EnrichDrawerProps) {
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
  const hasEmails = emails.length > 0;
  const hasPhones = phones.length > 0;
  const hasLinks = links.length > 0;
  const hasContact = hasEmails || hasPhones;
  const hasProfile = Boolean(data?.company || data?.location || hasLinks);
  const nothing = !loading && !error && data && !hasContact && !hasProfile;

  // ContactOut already told us if they have a phone in the search response.
  const phoneAvailable = person?.searchProfile?.contactAvailability?.phone === true;

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
        className="fixed top-0 right-0 h-full w-full sm:w-[440px] max-w-full box-border bg-base border-l-[3px] border-line z-50 overflow-y-auto overflow-x-hidden"
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
              {/* Header — pr-14 keeps the long name clear of the close button */}
              <div
                className="border-b-[3px] border-line px-6 pt-12 pb-5 pr-14"
                style={{ backgroundColor: "var(--color-acc-yellow)" }}
              >
                <h2 className="font-display text-2xl sm:text-3xl leading-none tracking-tight text-ink uppercase break-words">
                  {person.name || "—"}
                </h2>
                {(person.title || data?.position) && (
                  <p className="font-bold text-ink/70 text-sm mt-1 break-words">
                    {person.title || data?.position}
                  </p>
                )}
                {(data?.company || data?.location) && (
                  <p className="font-mono font-bold text-ink/70 text-[11px] uppercase tracking-wide mt-1 break-words">
                    {[data?.company, data?.location].filter(Boolean).join("  ·  ")}
                  </p>
                )}
              </div>

              <div className="px-6">
                {/* Email section */}
                {hasEmails && (
                  <>
                    <Band>■ Email</Band>
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
                    </div>
                  </>
                )}

                {/* Phone section — always shown once we have an email */}
                {hasEmails && (
                  <>
                    <Band>■ Phone</Band>
                    {hasPhones ? (
                      <div className="space-y-2">
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
                    ) : phoneError ? (
                      // Lookup failed (rate limit / cap / network) — let them retry.
                      <div>
                        <p className="font-mono text-[11px] font-bold text-acc-pink mb-2">{phoneError}</p>
                        <button
                          onClick={onGetPhone}
                          disabled={phoneLoading}
                          className="nb-btn px-4 py-2 text-[11px] font-black uppercase tracking-wider"
                        >
                          {phoneLoading ? "Finding phone…" : "Try again →"}
                        </button>
                      </div>
                    ) : phoneAvailable && !phoneAttempted ? (
                      <button
                        onClick={onGetPhone}
                        disabled={phoneLoading}
                        className="nb-btn px-4 py-2 text-[11px] font-black uppercase tracking-wider"
                      >
                        {phoneLoading ? "Finding phone…" : "Get phone →"}
                      </button>
                    ) : (
                      // No phone signal, or we already looked and found none.
                      <p className="font-mono text-[11px] text-dim">No phone found.</p>
                    )}
                  </>
                )}

                {/* Links */}
                {hasLinks && (
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
