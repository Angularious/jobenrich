"use client";

export interface SearchProfile {
  bio: string | null;
  experience: string[];
  education: string[];
  contactAvailability: { email: boolean; phone: boolean } | null;
}

export interface PersonData {
  name: string;
  title: string;
  linkedinUrl: string;
  profilePictureUrl: string | null;
  source?: "contactout" | "coresignal";
  searchProfile?: SearchProfile;
}

interface PersonCardProps {
  person: PersonData;
  onEnrich: (person: PersonData) => void;
  onProfile?: (person: PersonData) => void;
  accent: string;
  isLast?: boolean;
  enriched?: boolean;
  profiled?: boolean;
}

function vanitySlug(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/in\//, "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function PersonCard({ person, onEnrich, onProfile, accent, isLast, enriched, profiled }: PersonCardProps) {
  const slug = vanitySlug(person.linkedinUrl);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        !isLast ? "border-b-[3px] border-line/20" : ""
      }`}
    >
      {/* Avatar — slightly smaller on mobile to reclaim info width */}
      <div
        className="flex-none w-9 h-9 sm:w-11 sm:h-11 border-[3px] border-line bg-panel2 overflow-hidden flex items-center justify-center"
        style={{ ["--nb" as string]: accent }}
      >
        {person.profilePictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.profilePictureUrl}
            alt={person.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <span className="text-ink font-black text-base sm:text-lg">
            {person.name ? person.name[0].toUpperCase() : "?"}
          </span>
        )}
      </div>

      {/* Info — availability badges live here so actions column stays narrow */}
      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-black truncate">{person.name || "—"}</p>
        <p className="text-muted text-xs font-bold truncate">{person.title || "—"}</p>
        {slug && (
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-acc-blue underline text-[11px] font-mono hover:bg-acc-blue hover:text-base"
          >
            /in/{slug}
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="flex-none flex flex-col items-end gap-1.5">
        <button
          onClick={() => onEnrich(person)}
          className={`nb-btn px-3 py-2 text-[11px] font-black uppercase tracking-wider whitespace-nowrap ${
            enriched ? "nb-btn-primary" : ""
          }`}
        >
          {/* Shorter label on mobile to keep column narrow */}
          <span className="sm:hidden">{enriched ? "Open →" : "Contact →"}</span>
          <span className="hidden sm:inline">{enriched ? "Open contact →" : "Get contact →"}</span>
        </button>
        {onProfile && (
          <button
            onClick={() => onProfile(person)}
            className={`nb-btn px-3 py-1.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap${
              profiled ? " nb-btn-primary" : ""
            }`}
          >
            <span className="sm:hidden">{profiled ? "✓ Done" : "Profile →"}</span>
            <span className="hidden sm:inline">{profiled ? "✓ Pulled" : "Pull Profile →"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
