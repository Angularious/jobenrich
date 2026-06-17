@AGENTS.md

# Job Intel

A Next.js 16 app that surfaces the **people behind any LinkedIn job posting**. A student/job-seeker pastes a job URL and gets people at that company worth reaching out to, plus recruiters hiring for it. They can then optionally enter their school to surface alumni, and pull contact info for any person on demand. **Powered by Orthogonal.**

## Stack

- Next.js 16.2.9 (App Router) · React 19 · TypeScript
- Tailwind v4 — config lives in `app/globals.css` via `@theme`, **not** a `tailwind.config` file. Design system is **light raw brutalism** (per the `nextlevelbuilder/ui-ux-pro-max-skill` "Brutalism" spec): white paper, black ink + 3px black borders, blue underlined links, pure primary accents (red is primary; blue/yellow/green/pink alongside), **no shadows**, zero border-radius, system-ui + monospace fonts (bold 700+), instant state changes (`transition: none`). Buttons are plain bordered blocks that **invert on hover** (white/black → black/white) — colors live in the `.nb-btn` primitive, so they override utility bg/text classes on the element. Reusable primitives `.nb-card` / `.nb-btn` / `.nb-input` / `.nb-flat` live in `globals.css`; a fill accent (where needed) is passed via the inline `--nb` CSS custom property. Errors/alerts use hot pink to stay distinct from the red primary. **Gotcha:** `text-base` resolves to the `--color-base` **color** (white), not a font-size — use `text-ink` for black text and an explicit size class (e.g. `text-sm`).
- `lucide-react` for icons. No test framework.

## Environment variables

- `ORTHOGONAL_API_KEY` — auth for all external data calls (required, **server-side only**, never `NEXT_PUBLIC_`).
- `DAILY_SPEND_CAP_USD` — hard daily ceiling across all visitors (default 40 in code). Editable in Vercel without a code change.
- `REQUEST_TOKEN_SECRET` — HMAC secret for signing request/timing tokens (random 32+ chars).
- `NEXT_PUBLIC_APP_URL` — public deployment origin, used for same-origin checks on API routes.

> **⚠ Status: `.env.local` still holds a placeholder `ORTHOGONAL_API_KEY` (`orth_live_xxxxx`)** and `REQUEST_TOKEN_SECRET` must be set before deploy. The app **cannot reach Orthogonal** until a real key is dropped in. The waterfall pipeline was validated out-of-band through the Orthogonal MCP tools (job extract, ContactOut search, and the Apollo/Bytemine/ContactOut enrich steps each confirmed to return live data). One branch remains unverified end-to-end: the **Coresignal fallback** (fires only when ContactOut returns zero). See `.env.example`.

## Architecture / data flow

**This is a public demo — no login.** Access is controlled by Level 1 abuse protections (audit-driven), all in `lib/security/`:
- `guard.ts` — `guardRequest(request, body, step)` runs at the top of every API route before any Orthogonal call: same-origin + content-type check, obvious-bot UA filter, CSRF-style request-token verify, honeypot, minimum form-timing (form steps), global daily **spend cap** (503), then per-visitor **per-step rate limit** (429). Returns `recordSpend()` to call after the upstream work.
- `rateLimit.ts` / `spendCap.ts` — in-memory (module-level Map / counter). **Level 1 caveat:** the counters are plain JS variables in one serverless instance's RAM. They do **not** persist across instances or redeploys, so under real concurrency the `$40` cap leaks to roughly `$40 × (live instances)` and a redeploy zeroes the daily tally. Fine for a low-traffic demo (Vercel usually serves from a single warm instance at low traffic, and ~100 users only spend ~$20–30 total so the cap is never reached). **The cap becomes airtight only when both counters move to a shared, atomic, persistent store** — use the **Supabase free project** (already available; a `daily_spend` row + `rate_limits` table mutated via atomic Postgres functions/RPC), **not Upstash** (the old plan; Supabase is on hand so no new dependency). See the **Scaling / deployment** section.
- `tokens.ts` + `app/api/init/route.ts` — issue/verify the signed request token (CSRF) and page-load stamp (timing); the client fetches them on mount.
- `client.ts` — client helper: builds the composite fingerprint (IP + localStorage session token + UA/screen/tz/lang/platform), primes the token, and `apiPost()`s with all signals. `errorMessage()` renders 429/503 messages.
- Limits: **10 / step / day** per visitor, 24h reset; cap **$40/day**.

**Everything runs on a waterfall model** (ported from a sister demo): within each finder, a step only fires if the previous step returned **zero** people. Cheap/broad sources are tried first, and a fallback only costs money when it's actually needed. All finders live in `lib/people.ts` and return a normalized `Person` ({ name, title, linkedinUrl, profilePictureUrl, source }).

**Search flow** (`app/page.tsx` → `app/api/search/route.ts`) — input is **just the job URL**:
1. Canonicalize the URL (`lib/validation.ts` → `canonicalizeLinkedInJobUrl`).
2. Orthogonal `edges/linkedin-extract-job` → job title + company. `simplifyJobTitle()` strips intern/seasonal decorations so ContactOut can match; `extractDomain()` best-effort pulls a company domain for the alumni fallback.
3. Run two waterfalls in parallel (`Promise.allSettled`), each with its own error flag:
   - **People (target 5):** ContactOut `people/search` (company + title) → ContactOut (company only) → Coresignal `employee_base/search/filter/preview` (company).
   - **Recruiters (target 3):** ContactOut (company + 13 recruiter titles) → Coresignal (company + title "Recruiter") → Coresignal (company only — founders hire directly).

**Alumni flow** (`components/AlumniFinder.tsx` → `app/api/alumni/route.ts`) — opt-in secondary action; the school is **not** asked for up front. Takes company + domain (from the search response) + school: ContactOut (company + education) → ContactOut (domain + education, only if a domain was found).

**Enrich flow** (`PersonCard` "Get contact" → `app/api/enrich/route.ts` → `EnrichDrawer`) — cheap→rich→last-resort contact waterfall, each step firing only if no email yet: **Apollo `/api/v1/people/match` ($0.01)** for a verified email + profile, straight from the LinkedIn URL → **Bytemine `/contacts/enrich` ($0.03)** for work+personal email **and** mobile+work phone → **ContactOut `/v1/people/linkedin` ($0.33, `include_phone:false`)** as the last resort. Returns `{ emails, phones, source, company, position, location, links }`, where `source: "apollo" | "bytemine" | "contactout" | "none"`. Each step is independently `try/catch`'d — a provider error degrades to the next instead of failing the request — and profile context, phones, and links **accumulate** across steps, so an email found late still carries context an earlier step surfaced. **Phones come from Bytemine (mobile+work) and ContactOut, not Apollo** — Apollo's phone reveal is intentionally not requested so it stays a flat $0.01; ContactOut's phone tier ($0.55) is likewise unused (`include_phone` stays false). Apollo's raw payload is ~190 KB, so the route extracts only the fields it needs via `apolloLookup` and **never logs the whole body**; `isRealEmail()` drops Apollo's `email_not_unlocked@domain.com` placeholder. Provider response shapes are inconsistent, so the route coerces defensively (`collectStrings`, `cleanStr`, `asUrl`, `joinLocation`) — preserve that. The UI never names the providers (no "Apollo/Bytemine/ContactOut" in progress or results). Results are cached client-side per LinkedIn URL in `page.tsx` (`enrichCache`): the first "Get contact" fetches; afterward the button reads "Open contact" and reopening the drawer is instant and free.

**Coresignal caveat:** `experience_company_name` matches anyone who *ever* worked there, so `fromCoresignal()` filters results to rows whose *current* `company_name` matches the target (falling back to the raw list only if none match). Coresignal returns `profile_url` (a real LinkedIn URL), so its results are still enrichable.

## Costs (best case = first step hits, the common path; all unit prices verified live against the Orthogonal marketplace)

- **Search:** job extraction ($0.09, always) + People (ContactOut $0.05) + Recruiters (ContactOut $0.05), the two waterfalls in parallel. Fallbacks add $0.05 (ContactOut company-only) or $0.021 (Coresignal preview) each, only when a prior step returned nothing. **Best case $0.19**, worst case ~$0.30 (People $0.121 + Recruiters $0.092 + extract $0.09).
- **Alumni:** $0.05 (→ $0.10 worst case with the domain fallback).
- **Enrich:** $0.01 (Apollo hit) → $0.04 (Apollo miss + Bytemine) → $0.37 worst case (both miss + ContactOut $0.33). Cached client-side, so paid once per profile.
- **Full session:** ~$0.25 typical (search + alumni + one enrich, all first-step hits) → ~$0.77 if every fallback fires. The $40/day cap covers ~50–160 sessions/day.

> Dynamic-priced endpoints: ContactOut `/v1/people/search` is `reveal_info ? 25*0.75 : 0.05` and `/v1/people/linkedin` is `include_phone ? 0.55 : 0.33`. The app pins both to the cheap side ($0.05 / $0.33).

## Scaling / deployment (audited 2026-06-16)

Deployed to Vercel project **jobenrich** (`jobenrich.vercel.app`), **Hobby plan**, with a **Supabase free** project available but **not yet wired in**. `REQUEST_TOKEN_SECRET` and a working `ORTHOGONAL_API_KEY` (`orth_live_…`) are confirmed set in Vercel prod. Verdict from the audit: **fine as-is for ~100 users; do NOT ship publicly at scale (hundreds–thousands) without the fixes below.**

- **~100 users: nothing breaks.** Spend ≈ $20–30 total (under the cap), traffic stays on ~1 warm instance so the in-memory cap/rate-limit are approximately correct. The only real exposure is abuse (rate limit resets on cold start/redeploy), bounded by the global cap to ~$40–80/day.
- **Global hard cap** — works *only* as an atomic operation on shared storage. Plan: move `spendCap.ts`/`rateLimit.ts` to the Supabase free project via `@supabase/supabase-js` (HTTP/PostgREST or the **Supavisor pooler port 6543**, never direct connections — free tier is **60 direct / 200 pooled**). Combine check-and-increment into one atomic RPC (the current `withinCap()`-then-`recordSpend()` is a two-step TOCTOU race even on one instance).
- **Vercel Hobby is non-commercial-only** ([ToS](https://vercel.com/legal/terms)). A public, Orthogonal-branded demo built by an Orthogonal employee is commercial; Vercel may shut it down without notice, and Hobby pauses (no overage billing) if a spike exceeds included usage. **A public scale launch needs Vercel Pro ($20/mo).** (Note: Hobby+Fluid-compute already allows `maxDuration` up to 300s, so the `maxDuration = 30` on `search`/`alumni` is fine — the "Hobby 10s" code comment is stale. `enrich` has no `maxDuration` set.)
- **Supabase free pauses after 7 days idle** (~30s to resume) → add a keep-alive ping (GitHub Action cron) and make the cap/rate-limit **fail open to the in-memory counter** if Supabase is unreachable, so a paused DB never takes the whole site down.
- **No server-side cache** — `enrichCache` is client-side per browser; searches aren't cached at all. At scale with overlapping queries (e.g. a class researching the same companies), this re-pays for every repeat. A Supabase-backed search + enrich cache is the biggest cost lever and is what reconciles "serve many people" with a bounded daily spend. `$40/day` only covers ~150–200 uncached full sessions, so a working hard cap = most users get a 503 once it's hit unless caching cuts cost-per-unique-lookup.

## Key files

- `lib/orthogonal.ts` — the single `callOrthogonal()` wrapper. **All external API calls go through this.** Hits `api.orthogonal.com/v1/run` with `{ api, path, method, body?, query? }`, throws on `!res.ok` or `!json.success`, returns `json.data` (the provider's raw response body).
- `lib/people.ts` — `Person` type, normalizers, the three waterfall finders, `simplifyJobTitle`, `extractDomain`. **Add new people sources here**, behind the `waterfall()` runner.
- `lib/validation.ts` — URL canonicalization + validators (`isValidLinkedInProfileUrl`, `isValidSchool`).
- `components/` — `SearchForm` (URL only), `ResultsSection`, `PersonCard`, `AlumniFinder`, `EnrichDrawer`, `PipelineProgress` (cosmetic timed steps — not tied to real backend events), `OrthogonalBadge`, `PasswordGate`.

## Conventions

- Validate input and return `NextResponse.json({ error }, { status })` on bad requests; use 502 for upstream Orthogonal failures.
- API routes log with a `[search]` / `[alumni]` / `[enrich]` / `[people]` prefix.
- New external data sources go through `callOrthogonal`, not raw `fetch`, and new people-finders go through `lib/people.ts`'s `waterfall()` so the fire-only-on-empty cost discipline is preserved.
