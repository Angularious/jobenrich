"use client";

import { ExternalLink } from "lucide-react";
import type { JobListing } from "@/types/job";

interface JobListingCardProps {
  job: JobListing;
  onFindPeople: (job: JobListing) => void;
  searched?: boolean; // people already pulled for this listing
}

// "3d ago" / "today" from an ISO date — best-effort, never throws.
function postedAgo(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function salaryLabel(job: JobListing): string | null {
  const s = job.salary;
  if (!s || (s.min === null && s.max === null)) return null;
  const cur = s.currency === "USD" ? "$" : s.currency ? `${s.currency} ` : "";
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  const range =
    s.min !== null && s.max !== null
      ? `${cur}${fmt(s.min)}–${fmt(s.max)}`
      : `${cur}${fmt((s.min ?? s.max) as number)}`;
  const unit = s.unit === "YEAR" ? "/yr" : s.unit === "HOUR" ? "/hr" : "";
  return `${range}${unit}`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="nb-flat border-[2px] border-line px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-ink">
      {children}
    </span>
  );
}

export function JobListingCard({ job, onFindPeople, searched }: JobListingCardProps) {
  const posted = postedAgo(job.datePosted);
  const salary = salaryLabel(job);

  return (
    <div className="nb-card mt-4 p-4">
      <div className="flex items-start gap-3">
        {/* Logo / monogram */}
        <div
          className="flex-none w-11 h-11 border-[3px] border-line bg-panel2 overflow-hidden flex items-center justify-center"
          style={{ ["--nb" as string]: "var(--color-acc-blue)" }}
        >
          {job.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.logoUrl}
              alt={job.company}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className="text-ink font-black text-lg">
              {job.company ? job.company[0]!.toUpperCase() : "?"}
            </span>
          )}
        </div>

        {/* Title + company */}
        <div className="flex-1 min-w-0">
          <p className="text-ink text-sm font-black leading-snug">{job.title}</p>
          <p className="text-acc-red text-sm font-bold truncate">{job.company}</p>
          {job.location && (
            <p className="text-muted text-xs font-bold truncate">{job.location}</p>
          )}
        </div>

        {salary && (
          <span className="flex-none font-mono font-bold text-xs text-acc-green whitespace-nowrap">
            {salary}
          </span>
        )}
      </div>

      {/* Meta chips */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {job.workArrangement && <Chip>{job.workArrangement}</Chip>}
        {job.employmentType && <Chip>{job.employmentType.replace(/_/g, " ")}</Chip>}
        {job.experienceLevel && <Chip>{job.experienceLevel} yrs</Chip>}
        {job.source && <Chip>{job.source}</Chip>}
        {posted && <Chip>{posted}</Chip>}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-acc-blue underline text-[11px] font-mono font-bold uppercase tracking-widest hover:bg-acc-blue hover:text-base"
        >
          View posting <ExternalLink size={12} strokeWidth={3} />
        </a>
        <button
          onClick={() => onFindPeople(job)}
          className={`nb-btn flex-none px-4 py-2 text-[11px] font-black uppercase tracking-wider whitespace-nowrap ${
            searched ? "nb-btn-primary" : ""
          }`}
        >
          {searched ? "People ↓" : "Find people →"}
        </button>
      </div>
    </div>
  );
}
