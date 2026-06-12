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
        setError("Incorrect password.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-2xl text-ink mb-2">Job Intel</h1>
        <p className="text-muted text-sm mb-12">
          Enter your password to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div
            className="border-b border-hairline"
            style={{ transition: "border-color 200ms ease" }}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full py-3 bg-transparent text-ink placeholder:text-dim text-sm outline-none focus:outline-none"
              style={
                {
                  "--tw-ring-shadow": "none",
                } as React.CSSProperties
              }
              onFocus={(e) =>
                (e.currentTarget.parentElement!.style.borderColor = "#1A1A1A")
              }
              onBlur={(e) =>
                (e.currentTarget.parentElement!.style.borderColor = "#E8E4DD")
              }
            />
          </div>

          {error && <p className="text-crimson text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-ink text-surface text-xs uppercase tracking-[0.15em] disabled:opacity-50 hover:opacity-80"
          >
            {loading ? "..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
