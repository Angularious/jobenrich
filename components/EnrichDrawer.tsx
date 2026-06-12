"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PersonData } from "./PersonCard";

interface ContactInfo {
  emails?: string[];
  work_emails?: string[];
  personal_emails?: string[];
  phones?: string[];
}

interface Experience {
  company?: string;
  title?: string;
  start_date?: string;
  end_date?: string;
}

export interface EnrichData {
  full_name?: string;
  title?: string;
  company?: string;
  contact_info?: ContactInfo;
  experience?: Experience[];
  education?: string[];
  skills?: string[];
}

interface EnrichDrawerProps {
  person: PersonData | null;
  data: EnrichData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.15em] text-dim mb-3">
      {children}
    </p>
  );
}

export function EnrichDrawer({
  person,
  data,
  loading,
  error,
  onClose,
}: EnrichDrawerProps) {
  const isOpen = person !== null;

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const allEmails = [
    ...(data?.contact_info?.work_emails ?? []),
    ...(data?.contact_info?.personal_emails ?? []),
    ...(data?.contact_info?.emails ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const phones = data?.contact_info?.phones ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          backgroundColor: "rgba(26,26,26,0.2)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-surface border-l border-hairline z-50 overflow-y-auto"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-muted hover:text-ink"
          aria-label="Close"
        >
          <X size={16} strokeWidth={1.5} />
        </button>

        <div className="px-8 pt-12 pb-16">
          {loading && (
            <p className="text-muted text-sm mt-4">Loading…</p>
          )}

          {error && (
            <p className="text-crimson text-sm mt-4">{error}</p>
          )}

          {!loading && !error && person && (
            <>
              <h2 className="font-serif text-2xl text-ink mb-1">
                {data?.full_name ?? person.name}
              </h2>
              {(data?.title ?? person.title) && (
                <p className="text-muted text-sm mb-1">
                  {data?.title ?? person.title}
                </p>
              )}
              {data?.company && (
                <p className="text-dim text-xs">{data.company}</p>
              )}

              {/* CONTACT */}
              {(allEmails.length > 0 || phones.length > 0) && (
                <section className="mt-12">
                  <SectionLabel>Contact</SectionLabel>
                  <div className="space-y-1">
                    {allEmails.map((email) => (
                      <p key={email} className="text-ink text-sm">
                        <a
                          href={`mailto:${email}`}
                          className="hover:text-crimson"
                        >
                          {email}
                        </a>
                      </p>
                    ))}
                    {phones.map((phone) => (
                      <p key={phone} className="text-ink text-sm">
                        {phone}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {/* EXPERIENCE */}
              {data?.experience && data.experience.length > 0 && (
                <section className="mt-12">
                  <SectionLabel>Experience</SectionLabel>
                  <div className="space-y-5">
                    {data.experience.map((exp, i) => (
                      <div key={i}>
                        <p className="text-ink text-sm font-medium">
                          {exp.title}
                        </p>
                        <p className="text-muted text-xs">
                          {exp.company}
                          {exp.start_date &&
                            ` · ${exp.start_date}–${exp.end_date ?? "present"}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* EDUCATION */}
              {data?.education && data.education.length > 0 && (
                <section className="mt-12">
                  <SectionLabel>Education</SectionLabel>
                  <div className="space-y-2">
                    {data.education.map((edu, i) => (
                      <p key={i} className="text-ink text-sm">
                        {edu}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {/* SKILLS */}
              {data?.skills && data.skills.length > 0 && (
                <section className="mt-12">
                  <SectionLabel>Skills</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {data.skills.map((skill) => (
                      <span
                        key={skill}
                        className="text-xs text-muted border border-hairline px-2 py-1"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
