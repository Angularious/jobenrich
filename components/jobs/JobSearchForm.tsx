"use client";

import { useState } from "react";
import type { JobSearchParams } from "@/types/job";

interface JobSearchFormProps {
  loading: boolean;
  error: string | null;
  onSearch: (params: JobSearchParams, honeypot: string) => void;
  // Prefill from the active tab's last search. The page remounts this form
  // (via `key={tab.id}`) on tab switch, so these become the initial values.
  initial?: Partial<JobSearchParams>;
}

const EMPLOYMENT_TYPES = [
  { value: "", label: "Any type" },
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACTOR", label: "Contract" },
  { value: "INTERN", label: "Internship" },
];

const FRESHNESS = [
  { value: "24h", label: "Past 24 hours" },
  { value: "7d", label: "Past week" },
  { value: "6m", label: "Past 6 months" },
];

export function JobSearchForm({ loading, error, onSearch, initial }: JobSearchFormProps) {
  const [role, setRole] = useState(initial?.role ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [employmentType, setEmploymentType] = useState(initial?.employmentType ?? "");
  const [remoteOnly, setRemoteOnly] = useState(initial?.remoteOnly ?? false);
  const [freshness, setFreshness] = useState(initial?.freshness ?? "7d");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role.trim()) return;
    const honeypot = String(
      new FormData(e.currentTarget as HTMLFormElement).get("website") ?? ""
    );
    onSearch(
      {
        role: role.trim(),
        location: location.trim() || undefined,
        employmentType: employmentType || undefined,
        remoteOnly: remoteOnly || undefined,
        freshness,
      },
      honeypot
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="nb-card p-5 sm:p-6" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
        {/* Honeypot — hidden from users, only bots fill it. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ display: "none" }}
        />
        <p className="font-bold text-sm text-ink mb-4 text-center">
          Search live job postings by role — then surface the people behind any
          listing in one click.
        </p>

        {/* Role (required) */}
        <div className="nb-input mb-3" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role, e.g. Product Manager"
            aria-label="Role"
            required
            maxLength={200}
            className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
          />
        </div>

        {/* Location */}
        <div className="nb-input mb-3" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location, e.g. San Francisco (optional)"
            aria-label="Location"
            maxLength={200}
            className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
          />
        </div>

        {/* Employment type + freshness */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="nb-input" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              aria-label="Employment type"
              className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none font-mono cursor-pointer"
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="nb-input" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
            <select
              value={freshness}
              onChange={(e) => setFreshness(e.target.value)}
              aria-label="Posted within"
              className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none font-mono cursor-pointer"
            >
              {FRESHNESS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Remote-only toggle */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="w-4 h-4 accent-acc-red border-[3px] border-line"
          />
          <span className="font-mono font-bold text-xs text-ink uppercase tracking-widest">
            Remote only
          </span>
        </label>

        {error && (
          <div className="nb-flat bg-acc-pink text-base font-bold text-xs px-3 py-2 mb-4">
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="nb-btn nb-btn-primary font-black text-sm uppercase tracking-wider px-10 py-4 w-full"
        >
          {loading ? "Searching…" : "Search jobs →"}
        </button>
      </div>
    </form>
  );
}
