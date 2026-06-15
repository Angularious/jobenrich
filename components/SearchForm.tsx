"use client";

interface SearchFormProps {
  jobUrl: string;
  loading: boolean;
  error: string | null;
  onJobUrlChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function SearchForm({
  jobUrl,
  loading,
  error,
  onJobUrlChange,
  onSubmit,
}: SearchFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="nb-card p-5 sm:p-6" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
        {/* Honeypot — hidden from users, only bots fill it. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ display: "none" }}
        />
        <p className="font-mono font-bold text-[11px] uppercase tracking-widest text-acc-red mb-4">
          ▌ paste a job posting
        </p>

        <div className="nb-input mb-4" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
          <input
            type="text"
            value={jobUrl}
            onChange={(e) => onJobUrlChange(e.target.value)}
            placeholder="https://linkedin.com/jobs/view/…"
            required
            className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
          />
        </div>

        {error && (
          <div className="nb-flat bg-acc-pink text-base font-bold text-xs px-3 py-2 mb-4">
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="nb-btn font-black text-sm uppercase tracking-wider px-8 py-3 w-full sm:w-auto"
        >
          {loading ? "Working…" : "Find people →"}
        </button>
      </div>
    </form>
  );
}
