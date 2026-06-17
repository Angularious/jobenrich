-- Job Enrich — shared spend cap + rate limiter (Level 2).
-- Run this once in the Supabase SQL editor. Then set SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY in Vercel (and .env.local). Until then the app
-- falls back to per-instance in-memory counters.

-- ── Daily spend (one row per UTC day) ────────────────────────────────
create table if not exists daily_spend (
  day  date primary key,
  usd  numeric not null default 0
);

-- Atomically add cost to today's total and return the new total.
create or replace function record_spend(p_day date, p_cost numeric)
returns numeric
language plpgsql
as $$
declare new_total numeric;
begin
  insert into daily_spend (day, usd) values (p_day, p_cost)
  on conflict (day) do update set usd = daily_spend.usd + p_cost
  returning usd into new_total;
  return new_total;
end;
$$;

-- ── Per-visitor, per-step rate limit (sliding daily window) ──────────
create table if not exists rate_limits (
  key       text primary key,
  count     int not null default 0,
  reset_at  timestamptz not null
);

-- Atomically check-and-increment. Returns whether the call is allowed,
-- how many remain, and when the window resets.
create or replace function check_rate_limit(p_key text, p_limit int, p_window_secs int)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
as $$
declare r rate_limits%rowtype;
begin
  select * into r from rate_limits where key = p_key for update;
  if not found or r.reset_at < now() then
    insert into rate_limits (key, count, reset_at)
      values (p_key, 1, now() + make_interval(secs => p_window_secs))
      on conflict (key) do update
        set count = 1, reset_at = now() + make_interval(secs => p_window_secs)
      returning * into r;
    return query select true, p_limit - 1, r.reset_at;
  elsif r.count >= p_limit then
    return query select false, 0, r.reset_at;
  else
    update rate_limits set count = count + 1 where key = p_key returning * into r;
    return query select true, p_limit - r.count, r.reset_at;
  end if;
end;
$$;

-- Optional housekeeping: drop expired rate-limit rows. Safe to run on a cron.
create or replace function prune_rate_limits()
returns void language sql as $$
  delete from rate_limits where reset_at < now();
$$;
