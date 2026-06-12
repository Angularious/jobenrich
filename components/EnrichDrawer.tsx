"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PersonData } from "./PersonCard";
import { PipelineProgress } from "./PipelineProgress";

const ENRICH_STEPS = [
  { label: "Fetching profile data", delay: 0 },
  { label: "Loading contact information", delay: 1100 },
  { label: "Retrieving work history", delay: 2200 },
];

interface ContactInfo {
  emails?: unknown;
  work_emails?: unknown;
  personal_emails?: unknown;
  phones?: unknown;
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
  experience?: unknown;
  education?: unknown;
  skills?: unknown;
}

interface EnrichDrawerProps {
  person: PersonData | null;
  data: EnrichData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function SectionBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-market-red text-white font-black text-xs uppercase tracking-widest px-4 py-2 mt-8">
      {children}
    </div>
  );
}

// Safely coerce an unknown value to an array of strings.
function toStrings(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === "string") return val ? [val] : [];
  if (!Array.isArray(val)) return [];
  return val.flatMap((item) => {
    if (!item) return [];
    if (typeof item === "string") return [item];
    if (typeof item === "object") {
      const o = item as Record<string, unknown>;
      const s = o.value ?? o.number ?? o.phone ?? o.email ?? o.text ?? "";
      return typeof s === "string" && s ? [s] : [];
    }
    return [];
  });
}

// Safely coerce an unknown value to an array of Experience objects.
function toExperiences(val: unknown): Experience[] {
  if (!val || !Array.isArray(val)) return [];
  return val.filter((v) => v && typeof v === "object") as Experience[];
}

// Format an education entry that may be a string or an object.
function formatEdu(edu: unknown): string {
  if (typeof edu === "string") return edu;
  if (edu && typeof edu === "object") {
    const o = edu as Record<string, unknown>;
    return [
      o.school_name ?? o.school ?? o.institution ?? o.name,
      o.degree,
      o.major ?? o.field_of_study,
    ]
      .filter((x): x is string => typeof x === "string" && Boolean(x))
      .join(" · ");
  }
  return String(edu ?? "");
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
    ...toStrings(data?.contact_info?.work_emails),
    ...toStrings(data?.contact_info?.personal_emails),
    ...toStrings(data?.contact_info?.emails),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const phones = toStrings(data?.contact_info?.phones);
  const experience = toExperiences(data?.experience);
  const education: string[] = Array.isArray(data?.education)
    ? (data.education as unknown[]).map(formatEdu).filter(Boolean)
    : [];
  const skills = toStrings(data?.skills);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          backgroundColor: "rgba(26,26,26,0.6)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-market-bg border-l-4 border-market-black z-50 overflow-y-auto"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-market-black text-white p-1 hover:bg-market-red"
          aria-label="Close"
        >
          <X size={16} strokeWidth={2} />
        </button>

        <div className="pb-16">
          {loading && (
            <div className="px-6 pt-12">
              <p className="font-black text-sm text-market-red uppercase tracking-widest mb-6">
                ■ LOADING... ■
              </p>
              <PipelineProgress steps={ENRICH_STEPS} />
            </div>
          )}

          {error && (
            <div className="bg-market-dark-red text-white font-bold text-sm px-6 py-4 mx-6 mt-12">
              ⚠ {error}
            </div>
          )}

          {!loading && !error && person && (
            <>
              {/* Header */}
              <div className="bg-market-yellow border-b-4 border-market-black px-6 pt-10 pb-5">
                <h2 className="font-black text-2xl text-market-black">
                  {data?.full_name ?? person.name}
                </h2>
                {(data?.title ?? person.title) && (
                  <p className="font-bold text-market-dark-red text-sm mt-1">
                    {data?.title ?? person.title}
                  </p>
                )}
                {data?.company && (
                  <p className="font-bold text-market-black text-xs mt-0.5">
                    {data.company}
                  </p>
                )}
              </div>

              <div className="px-6">
                {/* CONTACT */}
                {(allEmails.length > 0 || phones.length > 0) && (
                  <>
                    <SectionBand>■ Contact / 联系方式</SectionBand>
                    <div className="mt-3 space-y-1">
                      {allEmails.map((email) => (
                        <p key={email} className="text-sm font-bold">
                          <a
                            href={`mailto:${email}`}
                            className="text-market-red hover:underline"
                          >
                            {email}
                          </a>
                        </p>
                      ))}
                      {phones.map((phone) => (
                        <p key={phone} className="text-sm font-bold text-ink">
                          {phone}
                        </p>
                      ))}
                    </div>
                  </>
                )}

                {/* EXPERIENCE */}
                {experience.length > 0 && (
                  <>
                    <SectionBand>■ Experience / 工作经历</SectionBand>
                    <div className="mt-3 space-y-4">
                      {experience.map((exp, i) => (
                        <div key={i} className="border-l-4 border-market-yellow pl-3">
                          <p className="text-sm font-black text-ink">{exp.title}</p>
                          <p className="text-xs font-bold text-muted">
                            {exp.company}
                            {exp.start_date &&
                              ` · ${exp.start_date}–${exp.end_date ?? "present"}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* EDUCATION */}
                {education.length > 0 && (
                  <>
                    <SectionBand>■ Education / 教育背景</SectionBand>
                    <div className="mt-3 space-y-2">
                      {education.map((edu, i) => (
                        <p
                          key={i}
                          className="text-sm font-bold text-ink border-l-4 border-market-red pl-3"
                        >
                          {edu}
                        </p>
                      ))}
                    </div>
                  </>
                )}

                {/* SKILLS */}
                {skills.length > 0 && (
                  <>
                    <SectionBand>■ Skills / 技能</SectionBand>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {skills.map((skill, i) => (
                        <span
                          key={i}
                          className="text-xs font-bold text-market-black bg-market-yellow border-2 border-market-black px-2 py-0.5"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {/* Nothing found at all */}
                {allEmails.length === 0 &&
                  phones.length === 0 &&
                  experience.length === 0 &&
                  education.length === 0 &&
                  skills.length === 0 && (
                    <p className="mt-8 text-sm font-bold text-muted text-center">
                      ── No additional data found for this profile ──
                    </p>
                  )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
