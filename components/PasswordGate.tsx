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
    <div className="min-h-screen bg-market-bg flex flex-col">
      {/* Header */}
      <div className="bg-market-yellow border-b-4 border-market-black px-6 py-6">
        <h1
          className="text-5xl text-market-black leading-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          JOB INTEL
        </h1>
        <p className="font-black text-market-red text-sm mt-1">
          ★ 求职情报 · PROFESSIONAL NETWORK FINDER ★
        </p>
      </div>
      <div className="bg-market-red py-2">
        <p className="text-center text-white font-black text-xs uppercase tracking-widest">
          ★ RESTRICTED ACCESS · ENTER PASSWORD TO CONTINUE ★
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="border-4 border-market-black bg-market-yellow p-6">
            <p className="font-black text-xs uppercase tracking-widest text-market-red mb-4">
              ■ ACCESS / 登录 ■
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="border-2 border-market-black bg-white focus-within:bg-market-yellow/30">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal"
                />
              </div>

              {error && (
                <div className="bg-market-dark-red text-white font-bold text-xs px-3 py-2">
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="bg-market-red text-white font-black text-base uppercase tracking-widest px-10 py-4 border-2 border-market-black hover:bg-market-dark-red disabled:opacity-60 w-full"
                style={
                  !loading
                    ? { animation: "marketJump 2.2s ease-in-out infinite" }
                    : undefined
                }
              >
                {loading ? "★ ENTERING... ★" : "★ ENTER ★"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
