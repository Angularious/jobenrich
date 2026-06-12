"use client";

import { useEffect, useRef, useState } from "react";

export interface ProgressStep {
  label: string;
  /** ms after mount before this step appears */
  delay: number;
}

interface Props {
  steps: ProgressStep[];
}

export function PipelineProgress({ steps }: Props) {
  const [visible, setVisible] = useState<boolean[]>(() =>
    steps.map((s) => s.delay === 0)
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    steps.forEach((step, i) => {
      if (step.delay === 0) return;
      const t = setTimeout(() => {
        setVisible((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, step.delay);
      timers.current.push(t);
    });

    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex items-center gap-3"
          style={{
            opacity: visible[i] ? 1 : 0,
            transform: visible[i] ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 400ms ease, transform 400ms ease",
          }}
        >
          <span
            className="flex-none w-1.5 h-1.5 rounded-full bg-ink"
            style={{ animation: "pulse 1.6s ease-in-out infinite" }}
          />
          <span className="text-sm text-muted">{step.label}</span>
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}
