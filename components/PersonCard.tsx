"use client";

export interface PersonData {
  name: string;
  title: string;
  linkedinUrl: string;
  profilePictureUrl: string | null;
}

interface PersonCardProps {
  person: PersonData;
  onEnrich: (person: PersonData) => void;
  isLast?: boolean;
}

function vanitySlug(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/in\//, "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function PersonCard({ person, onEnrich, isLast }: PersonCardProps) {
  const slug = vanitySlug(person.linkedinUrl);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-market-yellow/20 ${
        !isLast ? "border-b-2 border-market-black/20" : ""
      }`}
    >
      {/* Avatar */}
      <div className="flex-none w-10 h-10 border-2 border-market-black bg-market-yellow overflow-hidden flex items-center justify-center">
        {person.profilePictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.profilePictureUrl}
            alt={person.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
            }}
          />
        ) : (
          <span className="text-market-black font-black text-sm">
            {person.name ? person.name[0].toUpperCase() : "?"}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-black truncate">{person.name || "—"}</p>
        <p className="text-muted text-xs font-bold truncate">{person.title || "—"}</p>
        {slug && (
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dim text-xs hover:text-market-red font-medium"
          >
            {slug}
          </a>
        )}
      </div>

      {/* Enrich button */}
      <button
        onClick={() => onEnrich(person)}
        className="flex-none bg-market-yellow border-2 border-market-black px-3 py-1 text-xs font-black text-market-black uppercase whitespace-nowrap hover:bg-market-red hover:text-white hover:border-market-red"
      >
        ENRICH →
      </button>
    </div>
  );
}
