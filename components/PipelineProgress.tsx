"use client";

import { useEffect, useRef, useState } from "react";

export interface ProgressStep {
  label: string;
  delay: number;
}

interface Props {
  steps: ProgressStep[];
  accent?: string;
}

export function PipelineProgress({ steps, accent = "var(--color-acc-yellow)" }: Props) {
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
    <div className="space-y-2 font-mono">
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex items-center gap-3"
          style={{ opacity: visible[i] ? 1 : 0.25 }}
        >
          <span
            className="flex-none w-3 h-3 border-2 border-line"
            style={{
              backgroundColor: visible[i] ? accent : "transparent",
              animation: visible[i] ? "nbBlink 1s steps(2) infinite" : undefined,
            }}
          />
          <span className="text-xs font-bold text-ink uppercase tracking-wide">
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
