"use client";

import { useState } from "react";
import { PersonData, PersonCard } from "./PersonCard";

const VARIANTS = {
  yellow: "var(--color-acc-yellow)",
  blue: "var(--color-acc-blue)",
  green: "var(--color-acc-green)",
  pink: "var(--color-acc-pink)",
} as const;

// How many people to show before the "show more" reveal.
const INITIAL_VISIBLE = 5;

interface ResultsSectionProps {
  title: string;
  hint?: string;
  people: PersonData[];
  hasError: boolean;
  onEnrich: (person: PersonData) => void;
  onProfile?: (person: PersonData) => void;
  variant?: keyof typeof VARIANTS;
  enrichedUrls?: Set<string>;
  profiledUrls?: Set<string>;
  emptyMessage?: string;
}

export function ResultsSection({
  title,
  hint,
  people,
  hasError,
  onEnrich,
  onProfile,
  variant = "yellow",
  enrichedUrls,
  profiledUrls,
  emptyMessage = "Nobody surfaced for this company.",
}: ResultsSectionProps) {
  const accent = VARIANTS[variant];
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? people : people.slice(0, INITIAL_VISIBLE);
  const hiddenCount = people.length - visible.length;
  const hasMore = hiddenCount > 0;

  return (
    <section className="nb-card mt-8">
      {/* Header bar — white, black title, small accent square */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b-[3px] border-line">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex-none w-4 h-4 border-[3px] border-line"
            style={{ backgroundColor: accent }}
          />
          <h2 className="font-display text-2xl leading-none tracking-tight text-ink uppercase truncate">
            {title}
          </h2>
        </div>
        {hint && (
          <span className="font-mono text-[11px] font-bold text-dim uppercase whitespace-nowrap">
            {hint}
          </span>
        )}
      </div>

      <div>
        {hasError ? (
          <div className="px-4 py-6 text-center text-acc-pink text-sm font-bold font-mono">
            ⚠ Lookup failed — try again
          </div>
        ) : people.length === 0 ? (
          <div className="px-4 py-6 text-center text-dim text-xs font-bold font-mono leading-relaxed">
            {emptyMessage}
          </div>
        ) : (
          <>
            {visible.map((person, i) => (
              <PersonCard
                key={person.linkedinUrl}
                person={person}
                onEnrich={onEnrich}
                onProfile={onProfile}
                accent={accent}
                // Keep the bottom border on the last card when a "show more"
                // row follows, so it reads as a divider.
                isLast={i === visible.length - 1 && !hasMore}
                enriched={enrichedUrls?.has(person.linkedinUrl)}
                profiled={profiledUrls?.has(person.linkedinUrl)}
              />
            ))}
            {hasMore && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full px-4 py-3 font-mono text-[11px] font-black uppercase tracking-widest text-acc-blue hover:bg-acc-blue hover:text-base"
              >
                + Show {hiddenCount} more
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
