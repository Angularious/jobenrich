import { PersonData, PersonCard } from "./PersonCard";

const VARIANT_STYLES = {
  red: {
    header: "bg-market-red text-white",
    border: "border-market-red",
  },
  yellow: {
    header: "bg-market-yellow text-market-black",
    border: "border-market-yellow",
  },
  green: {
    header: "bg-market-green text-white",
    border: "border-market-green",
  },
} as const;

interface ResultsSectionProps {
  title: string;
  subtitle?: string;
  people: PersonData[];
  hasError: boolean;
  onEnrich: (person: PersonData) => void;
  variant?: keyof typeof VARIANT_STYLES;
}

export function ResultsSection({
  title,
  subtitle,
  people,
  hasError,
  onEnrich,
  variant = "red",
}: ResultsSectionProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <section className="mt-8 border-2 border-market-black">
      {/* Section header */}
      <div className={`${styles.header} px-4 py-3 flex items-center justify-between`}>
        <h2 className="font-black text-base uppercase tracking-wide">{title}</h2>
        {subtitle && (
          <span className="text-xs font-bold opacity-80">{subtitle}</span>
        )}
        <span className="font-black text-sm">{people.length} found</span>
      </div>

      {/* Content */}
      <div className="bg-white">
        {hasError || people.length === 0 ? (
          <div className="px-4 py-6 text-center text-dim text-sm font-bold border-t-2 border-market-black">
            ── No results ──
          </div>
        ) : (
          people.map((person, i) => (
            <PersonCard
              key={person.linkedinUrl}
              person={person}
              onEnrich={onEnrich}
              isLast={i === people.length - 1}
            />
          ))
        )}
      </div>
    </section>
  );
}
