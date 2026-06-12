"use client";

const STARBURST_12 =
  "polygon(50% 0%, 59.06% 16.18%, 75% 6.70%, 74.75% 25.25%, 93.30% 25%, 83.82% 40.94%, 100% 50%, 83.82% 59.06%, 93.30% 75%, 74.75% 74.75%, 75% 93.30%, 59.06% 83.82%, 50% 100%, 40.94% 83.82%, 25% 93.30%, 25.25% 74.75%, 6.70% 75%, 16.18% 59.06%, 0% 50%, 16.18% 40.94%, 6.70% 25%, 25.25% 25.25%, 25% 6.70%, 40.94% 16.18%)";

interface OrthogonalBadgeProps {
  size?: number;
}

export function OrthogonalBadge({ size = 148 }: OrthogonalBadgeProps) {
  return (
    <a
      href="https://orthogonal.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Powered by Orthogonal — Try Now!"
      style={{ display: "inline-block", textDecoration: "none" }}
    >
      <div
        style={{
          width: size,
          height: size,
          clipPath: STARBURST_12,
          backgroundColor: "#FFD700",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          animation: "marketWiggle 3s ease-in-out infinite",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "28px", lineHeight: 1.15 }}>
          <p
            style={{
              fontSize: size * 0.08,
              fontWeight: 900,
              color: "#E8001D",
              margin: 0,
              letterSpacing: "0.05em",
            }}
          >
            POWERED BY
          </p>
          <p
            style={{
              fontSize: size * 0.095,
              fontWeight: 900,
              color: "#1A1A1A",
              margin: 0,
              letterSpacing: "0.02em",
            }}
          >
            ORTHOGONAL
          </p>
          <p
            style={{
              fontSize: size * 0.075,
              fontWeight: 900,
              color: "#E8001D",
              margin: "4px 0 0",
              letterSpacing: "0.04em",
            }}
          >
            TRY NOW! →
          </p>
        </div>
      </div>
    </a>
  );
}
