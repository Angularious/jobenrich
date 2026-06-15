"use client";

interface OrthogonalBadgeProps {
  size?: number;
}

// Neo-brutalist sticker: hard border, hard offset shadow, zero radius,
// a slow looping wiggle so it reads as a slapped-on label.
export function OrthogonalBadge({ size = 120 }: OrthogonalBadgeProps) {
  return (
    <a
      href="https://orthogonal.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Powered by Orthogonal"
      className="nb-flat inline-flex flex-col items-center justify-center text-center shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: "var(--color-acc-green)",
        boxShadow: "5px 5px 0 0 var(--color-line)",
        animation: "nbWiggle 4s steps(8) infinite",
        padding: 12,
      }}
    >
      <span
        className="font-mono font-bold uppercase text-base"
        style={{ fontSize: size * 0.085, letterSpacing: "0.08em" }}
      >
        powered by
      </span>
      <span
        className="font-display uppercase text-base leading-none"
        style={{ fontSize: size * 0.17, letterSpacing: "0.01em" }}
      >
        Orthogonal
      </span>
      <span
        className="font-mono font-bold uppercase text-base"
        style={{ fontSize: size * 0.085, letterSpacing: "0.04em" }}
      >
        try now →
      </span>
    </a>
  );
}
