"use client";

import { ArrowRight } from "lucide-react";

export interface PersonData {
  name: string;
  title: string;
  linkedinUrl: string;
  profilePictureUrl: string | null;
}

interface PersonCardProps {
  person: PersonData;
  onEnrich: (person: PersonData) => void;
}

function vanitySlug(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/in\//, "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function PersonCard({ person, onEnrich }: PersonCardProps) {
  const slug = vanitySlug(person.linkedinUrl);

  return (
    <div className="flex items-center gap-4 py-4 border-b border-hairline">
      {/* Avatar */}
      <div className="flex-none w-10 h-10 rounded-full border border-hairline overflow-hidden bg-surface flex items-center justify-center">
        {person.profilePictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.profilePictureUrl}
            alt={person.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
              const parent = el.parentElement;
              if (parent) {
                parent.textContent = person.name ? person.name[0].toUpperCase() : "?";
                parent.className += " text-dim text-xs font-medium";
              }
            }}
          />
        ) : (
          <span className="text-dim text-xs font-medium">
            {person.name ? person.name[0].toUpperCase() : "?"}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-medium truncate">
          {person.name || "—"}
        </p>
        <p className="text-muted text-xs truncate">{person.title || "—"}</p>
        {slug && (
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dim text-xs hover:text-ink"
          >
            {slug}
          </a>
        )}
      </div>

      {/* Enrich */}
      <button
        onClick={() => onEnrich(person)}
        className="flex-none flex items-center gap-1 text-xs text-muted hover:text-ink whitespace-nowrap"
      >
        Enrich
        <ArrowRight size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}
