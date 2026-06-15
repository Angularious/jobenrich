"use client";

export interface PersonData {
  name: string;
  title: string;
  linkedinUrl: string;
  profilePictureUrl: string | null;
  source?: "contactout" | "coresignal";
}

interface PersonCardProps {
  person: PersonData;
  onEnrich: (person: PersonData) => void;
  accent: string; // CSS color for the offset shadow / hover
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

export function PersonCard({ person, onEnrich, accent, isLast }: PersonCardProps) {
  const slug = vanitySlug(person.linkedinUrl);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        !isLast ? "border-b-[3px] border-line/20" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className="flex-none w-11 h-11 border-[3px] border-line bg-panel2 overflow-hidden flex items-center justify-center"
        style={{ ["--nb" as string]: accent }}
      >
        {person.profilePictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.profilePictureUrl}
            alt={person.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span className="text-ink font-black text-base">
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
            className="text-dim text-[11px] font-mono hover:text-ink"
          >
            /in/{slug}
          </a>
        )}
      </div>

      {/* Enrich */}
      <button
        onClick={() => onEnrich(person)}
        className="nb-btn flex-none bg-panel2 px-3 py-2 text-[11px] font-black text-ink uppercase tracking-wider whitespace-nowrap hover:bg-line hover:text-base"
        style={{ ["--nb" as string]: accent }}
      >
        Get contact →
      </button>
    </div>
  );
}
