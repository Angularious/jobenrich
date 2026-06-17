"use client";

/**
 * "Here's what you get" preview shown on the landing page before any search —
 * it demonstrates the payoff (real people → reveal their email + LinkedIn),
 * since the whole pitch is "see the people behind the job". These rows are the
 * real Orthogonal team with static contacts (not a live search); "Get contact"
 * just reveals the pre-filled email + LinkedIn. Mirrors PersonCard's look.
 */
import { useState } from "react";

interface SampleRow {
  name: string;
  title: string;
  photo: string | null;
  tag: string;
  email: string;
  linkedin: string;
  accent: string;
}

const ROWS: SampleRow[] = [
  {
    name: "Christian Pickett",
    title: "Co-founder · Orthogonal (YC W26)",
    photo:
      "https://media.licdn.com/dms/image/v2/D4E03AQHvBoBOLWQitg/profile-displayphoto-scale_200_200/B4EZmowmIqHcAY-/0/1759472945025?e=2147483647&v=beta&t=GLMZWlCSAzR2Cb20Wgr37Mxhq52HVdMA1VF5d0MBWfQ",
    tag: "person to talk to",
    email: "christian@orthogonal.sh",
    linkedin: "https://www.linkedin.com/in/christian-pickett/",
    accent: "var(--color-acc-blue)",
  },
  {
    name: "Bera Sogut",
    title: "Co-founder · Orthogonal (YC W26)",
    photo:
      "https://media.licdn.com/dms/image/v2/D4E03AQFz_RE3wOi-0g/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1718325163721?e=2147483647&v=beta&t=OsnrsFX5f9ccdJLUpBrz-fQOndt7um64nZw4632V1b8",
    tag: "person to talk to",
    email: "bera@orthogonal.sh",
    linkedin: "https://www.linkedin.com/in/berasogut/",
    accent: "var(--color-acc-blue)",
  },
  {
    name: "Jerry Du",
    title: "Growth · Orthogonal (YC W26)",
    photo:
      "https://media.licdn.com/dms/image/v2/D4E03AQEkXpxK0hpwnw/profile-displayphoto-scale_200_200/B4EZwGycuwGkAY-/0/1769640419231?e=2147483647&v=beta&t=Vc0Nfl9JmhmcjJd7HHU3qXG3gdShylMzxXryVoUuabk",
    tag: "person to talk to",
    email: "jerry@orthogonal.sh",
    linkedin: "https://www.linkedin.com/in/jdu06/",
    accent: "var(--color-acc-green)",
  },
];

function slug(url: string): string {
  return url.replace(/\/$/, "").split("/in/")[1] ?? "";
}

function Row({ row, isLast }: { row: SampleRow; isLast: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${!isLast ? "border-b-[3px] border-line/20" : ""}`}>
      <div
        className="flex-none w-11 h-11 border-[3px] border-line bg-panel2 overflow-hidden flex items-center justify-center"
        style={{ ["--nb" as string]: row.accent }}
      >
        {row.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.photo}
            alt={row.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <span className="text-ink font-black text-lg">{row.name[0]}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-black truncate">{row.name}</p>
        <p className="text-muted text-xs font-bold truncate">{row.title}</p>
        <span className="text-dim text-[10px] font-mono uppercase tracking-widest">{row.tag}</span>
      </div>

      {open ? (
        <div className="flex-none flex flex-col items-end gap-0.5 text-right">
          <a
            href={`mailto:${row.email}`}
            className="font-mono text-[11px] font-bold text-acc-blue hover:bg-acc-blue hover:text-base whitespace-nowrap"
          >
            {row.email}
          </a>
          <a
            href={row.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-acc-blue underline hover:bg-acc-blue hover:text-base whitespace-nowrap"
          >
            /in/{slug(row.linkedin)}
          </a>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="nb-btn flex-none px-3 py-2 text-[11px] font-black uppercase tracking-wider whitespace-nowrap"
        >
          Get contact →
        </button>
      )}
    </div>
  );
}

export function SampleResults() {
  return (
    <div>
      <p className="font-mono font-bold text-[11px] uppercase tracking-widest text-dim mb-3 text-center">
        ▌ a peek — example results
      </p>
      <div className="nb-card" style={{ ["--nb" as string]: "var(--color-acc-blue)" }}>
        {ROWS.map((row, i) => (
          <Row key={row.name} row={row} isLast={i === ROWS.length - 1} />
        ))}
      </div>
    </div>
  );
}
