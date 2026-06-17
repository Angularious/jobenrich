import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Optional Supabase client for the shared (cross-instance) spend cap +
 * rate limiter. If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't set, this
 * returns null and the callers fall back to the in-memory counters — so the
 * app runs fine with no Supabase configured, and the cap/limit become a true
 * hard ceiling only once the env vars are added (see CLAUDE.md).
 *
 * Uses the REST/PostgREST transport (not a raw Postgres connection), so it
 * doesn't exhaust the free tier's connection pool under serverless fan-out.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? createClient(url, key, { auth: { persistSession: false } })
      : null;
  return cached;
}
