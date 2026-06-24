"use client";

import { X } from "lucide-react";

export interface TabSession {
  id: string;
  results: {
    company: string;
    jobTitle: string | null;
  };
}

interface SessionTabsProps {
  sessions: TabSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function SessionTabs({ sessions, activeId, onSelect, onClose }: SessionTabsProps) {
  return (
    <div
      className="mt-6 flex overflow-x-auto border-[3px] border-line"
      role="tablist"
      aria-label="Saved searches"
    >
      {sessions.map((s, i) => {
        const isActive = s.id === activeId;
        return (
          <div
            key={s.id}
            className={`flex-none flex items-stretch${i > 0 ? " border-l-[3px] border-line" : ""}`}
            style={{ backgroundColor: isActive ? "var(--color-ink)" : "var(--color-base)" }}
          >
            <button
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(s.id)}
              className="px-4 py-3 text-left min-w-0"
            >
              <div
                className="font-black text-xs uppercase tracking-wider truncate max-w-[130px]"
                style={{ color: isActive ? "var(--color-base)" : "var(--color-ink)" }}
              >
                {s.results.company}
              </div>
              {s.results.jobTitle && (
                <div
                  className="font-mono text-[10px] truncate max-w-[130px]"
                  style={{ color: isActive ? "rgba(255,255,255,0.6)" : "var(--color-dim)" }}
                >
                  {s.results.jobTitle}
                </div>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.id);
              }}
              className="flex-none px-2 flex items-center justify-center border-l-[3px] border-line hover:bg-acc-pink"
              aria-label={`Close ${s.results.company}`}
              style={{ color: isActive ? "var(--color-base)" : "var(--color-ink)" }}
            >
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
