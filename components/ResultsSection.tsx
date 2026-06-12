import { PersonData, PersonCard } from "./PersonCard";

interface ResultsSectionProps {
  title: string;
  people: PersonData[];
  hasError: boolean;
  onEnrich: (person: PersonData) => void;
}

export function ResultsSection({
  title,
  people,
  hasError,
  onEnrich,
}: ResultsSectionProps) {
  return (
    <section className="pt-16">
      <h2 className="font-serif text-xl text-ink mb-6">{title}</h2>
      {hasError || people.length === 0 ? (
        <p className="text-dim text-sm">No results.</p>
      ) : (
        <div>
          {people.map((person) => (
            <PersonCard
              key={person.linkedinUrl}
              person={person}
              onEnrich={onEnrich}
            />
          ))}
        </div>
      )}
    </section>
  );
}
