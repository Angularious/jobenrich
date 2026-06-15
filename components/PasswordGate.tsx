"use client";

import { useState } from "react";

export function PasswordGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        setError("Incorrect password. Try again.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex flex-col">
      {/* Header */}
      <div className="border-b-[3px] border-line px-6 py-6">
        <h1 className="font-display text-5xl text-ink leading-none uppercase tracking-tight">
          Job Intel
        </h1>
        <p className="font-mono font-bold text-acc-red text-sm mt-2 uppercase tracking-wide">
          ▌ restricted — enter password
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="nb-card p-6" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
            <p className="font-mono font-bold text-[11px] uppercase tracking-widest text-acc-red mb-4">
              ▌ access
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="nb-input" style={{ ["--nb" as string]: "var(--color-acc-yellow)" }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal font-mono"
                />
              </div>

              {error && (
                <div className="nb-flat bg-acc-pink text-base font-bold text-xs px-3 py-2">
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="nb-btn font-black text-sm uppercase tracking-wider px-10 py-3 w-full"
              >
                {loading ? "Entering…" : "Enter →"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
