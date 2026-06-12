"use client";

import { useEffect, useRef, useState } from "react";

export interface ProgressStep {
  label: string;
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
            transform: visible[i] ? "translateX(0)" : "translateX(-8px)",
            transition: "opacity 350ms ease, transform 350ms ease",
          }}
        >
          <span
            className="flex-none w-2 h-2 bg-market-red border border-market-dark-red"
            style={{ animation: "pulseDot 1.4s ease-in-out infinite" }}
          />
          <span className="text-sm font-bold text-market-black uppercase tracking-wide">
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
