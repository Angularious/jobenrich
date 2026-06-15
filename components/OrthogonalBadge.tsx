"use client";

interface OrthogonalBadgeProps {
  size?: number;
}

// Brutalist sticker: hard black border, zero radius, no shadow, and a
// slow stepped wiggle so it reads as a slapped-on label. The big word
// uses the wide Arial Black display font, so it's sized + tracked tight
// to stay inside the square (overflow:hidden is a hard backstop).
export function OrthogonalBadge({ size = 120 }: OrthogonalBadgeProps) {
  return (
    <a
      href="https://orthogonal.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Powered by Orthogonal"
      className="nb-flat inline-flex flex-col items-center justify-center text-center shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        backgroundColor: "var(--color-acc-yellow)",
        padding: 10,
        animation: "nbWiggle 4s steps(8) infinite",
      }}
    >
      <span
        className="font-mono font-bold uppercase text-ink"
        style={{ fontSize: size * 0.08, letterSpacing: "0.08em" }}
      >
        powered by
      </span>
      <span
        className="font-display uppercase text-ink leading-none"
        style={{ fontSize: size * 0.105, letterSpacing: "-0.05em" }}
      >
        Orthogonal
      </span>
      <span
        className="font-mono font-bold uppercase text-ink"
        style={{ fontSize: size * 0.08, letterSpacing: "0.04em" }}
      >
        try now →
      </span>
    </a>
  );
}
