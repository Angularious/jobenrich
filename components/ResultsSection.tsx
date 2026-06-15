import { PersonData, PersonCard } from "./PersonCard";

const VARIANTS = {
  yellow: "var(--color-acc-yellow)",
  blue: "var(--color-acc-blue)",
  green: "var(--color-acc-green)",
  pink: "var(--color-acc-pink)",
} as const;

interface ResultsSectionProps {
  title: string;
  hint?: string;
  people: PersonData[];
  hasError: boolean;
  onEnrich: (person: PersonData) => void;
  variant?: keyof typeof VARIANTS;
}

export function ResultsSection({
  title,
  hint,
  people,
  hasError,
  onEnrich,
  variant = "yellow",
}: ResultsSectionProps) {
  const accent = VARIANTS[variant];

  return (
    <section className="nb-card mt-8" style={{ ["--nb" as string]: accent }}>
      {/* Header bar — filled accent, black text */}
      <div
        className="flex items-baseline justify-between gap-3 px-4 py-3 border-b-[3px] border-line"
        style={{ backgroundColor: accent }}
      >
        <h2 className="font-display text-2xl leading-none tracking-tight text-base uppercase">
          {title}
        </h2>
        {hint && (
          <span className="font-mono text-[11px] font-bold text-base/80 whitespace-nowrap">
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
          <div className="px-4 py-6 text-center text-dim text-sm font-bold font-mono">
            — nobody surfaced —
          </div>
        ) : (
          people.map((person, i) => (
            <PersonCard
              key={person.linkedinUrl}
              person={person}
              onEnrich={onEnrich}
              accent={accent}
              isLast={i === people.length - 1}
            />
          ))
        )}
      </div>
    </section>
  );
}
