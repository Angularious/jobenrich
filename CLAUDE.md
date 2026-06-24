@AGENTS.md

# Job Enrich

A Next.js 16 app (deployed as **jobenrich**) that surfaces the **people behind any job posting** — LinkedIn, Indeed, Greenhouse, Lever, Workday, BambooHR, Gem, or a company careers page. A student/job-seeker pastes a job URL and gets people at that company worth reaching out to, plus recruiters hiring for it. They can then optionally enter their school to surface alumni, pull contact info on demand, and research individual LinkedIn profiles. **Powered by Orthogonal.**

## Stack

- Next.js 16.2.9 (App Router) · React 19 · TypeScript
- Tailwind v4 — config lives in `app/globals.css` via `@theme`, **not** a `tailwind.config` file. Design system is **light raw brutalism** (per the `nextlevelbuilder/ui-ux-pro-max-skill` "Brutalism" spec): white paper, black ink + 3px black borders, blue underlined links, pure primary accents (red is primary; blue/yellow/green/pink alongside), **no shadows**, zero border-radius, system-ui + monospace fonts (bold 700+), instant state changes (`transition: none`). Buttons are plain bordered blocks that **invert on hover** (white/black → black/white) — colors live in the `.nb-btn` primitive, so they override utility bg/text classes on the element. Reusable primitives `.nb-card` / `.nb-btn` / `.nb-input` / `.nb-flat` live in `globals.css`; a fill accent (where needed) is passed via the inline `--nb` CSS custom property. Errors/alerts use hot pink to stay distinct from the red primary. **Gotcha:** `text-base` resolves to the `--color-base` **color** (white), not a font-size — use `text-ink` for black text and an explicit size class (e.g. `text-sm`).
- `lucide-react` for icons. No test framework.

## Environment variables

- `ORTHOGONAL_API_KEY` — auth for all external data calls (required, **server-side only**, never `NEXT_PUBLIC_`).
- `DAILY_SPEND_CAP_USD` — hard daily ceiling across all visitors (default 40 in code). Editable in Vercel without a code change.
- `REQUEST_TOKEN_SECRET` — HMAC secret for signing request/timing tokens (random 32+ chars).
- `NEXT_PUBLIC_APP_URL` — public deployment origin, used for same-origin checks on API routes.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — **optional**. When both are set (and `supabase/migrations/0001_*.sql` has been run), the spend cap + rate limiter use Supabase so they hold across all serverless instances. Unset → the in-memory per-instance counters are used (fine for a low-traffic demo). Service-role key is server-side only — never `NEXT_PUBLIC_`. Free tier is sufficient.

> **⚠ Shared Supabase project:** this project's Supabase instance is **shared with other demo sites**. That's why every object here is `jobenrich_`-prefixed — our tables/functions are isolated from the other demos (separate cap + rate-limit state). **Do not** rename/drop the `jobenrich_*` objects expecting them to be the only thing in the project, and **never** touch un-prefixed or other apps' objects. Note the **free-tier quotas are shared** across all demos on the project (DB size, the 7-day inactivity pause, connection pool) — so keep usage light and prefer the REST transport (already used) over raw connections.

## Architecture / data flow

**This is a public demo — no login.** Access is controlled by Level 1 abuse protections (audit-driven), all in `lib/security/`:
- `guard.ts` — `guardRequest(request, body, step)` runs at the top of every API route before any Orthogonal call: same-origin + content-type check, obvious-bot UA filter, CSRF-style request-token verify, honeypot, minimum form-timing (form steps), global daily **spend cap** (503), then per-visitor **per-step rate limit** (429). Steps: `search`, `alumni`, `enrich`, `profile` (10/day per visitor each). Each step's `limit` lives in `STEPS`. **Spend-cap accounting:** each step's `cost` is the **worst-case** dollar cost the gate checks against the cap before starting work (gate 5: `current + worstCase ≤ cap`, so a request that could blow the cap isn't started — note this is a check, not an atomic reservation, so there's a bounded TOCTOU under concurrency; fine for a low-traffic demo where rate limits are the primary control). **All spending routes reconcile to ACTUAL spend** via `recordSpend(actual)`: `search` sums `resolveJob().cost` + both finders' `.cost`; `alumni` uses `findAlumni().cost`; `enrich` tallies per-provider cost as each fires. The finders thread real cost through `waterfall()` (each ContactOut step $0.05, Coresignal $0.021) and `resolveJob` returns its `cost` ($0.09 LinkedIn / $0.02–$0.045 generic). `profile` records its flat $0.01 (single call). So the cap reflects real dollars, not a flat estimate — a true ceiling that doesn't trip early on the common cheap path.
- `rateLimit.ts` / `spendCap.ts` — Supabase-backed when configured, in-memory otherwise. Both fail *degraded* to in-memory on any Supabase error. `guardRequest` is async; routes `await` it and `await guard.recordSpend()`.
- `tokens.ts` + `app/api/init/route.ts` — issue/verify the signed request token (CSRF) and page-load stamp (timing).
- `client.ts` — composite fingerprint builder + `apiPost()` + `errorMessage()`.
- Limits per visitor (24h reset): search / alumni / enrich / profile **10/day** each; global cap **$40/day**.

**Search flow** (`app/page.tsx` → `app/api/search/route.ts`):
1. **`resolveJob(rawUrl)`** (`lib/jobResolver.ts`) → `{ jobTitle, companyName, domain, jobLocation }`:
   - LinkedIn → `canonicalizeLinkedInJobUrl` (handles both `/jobs/view/{id}` and slug URLs `/jobs/view/title-at-company-{id}/`) → Edges `linkedin-extract-job` ($0.09).
   - Everything else → Serper Scrape ($0.02, renders JS) → (a) JSON-LD `JobPosting` free parse, (b) OG/page title heuristic free ("Title at Company" pattern), (c) ScrapeGraphAI LLM extract ($0.025).
2. Two waterfalls in parallel. The ContactOut `/v1/people/search` response (`reveal_info:false`, $0.05) returns rich data beyond just profile stubs — `experience[]`, `education[]`, `summary`, `contact_availability{work_email, personal_email}`, and `company{logo_url, size, overview, headquarter, founded_at, revenue}`. All of this is captured in `Person.searchProfile` and `CompanyMeta` at no extra cost.
   - **People:** tightened to ≤4 ContactOut calls — domain+title+country → domain+title → company+title → one role-agnostic fallback (domain if present, else company) → Coresignal. (Dropped the old role-agnostic-but-local and redundant steps that pushed it to 8 calls / $0.40.) Finders keep the **full page (`LIMIT = 25`)** the $0.05 call already returns; the UI (`ResultsSection`) shows **5 and a "+ Show N more"** reveal — extra rows are free since the page was already paid for.
   - **Recruiters:** domain-first, **country-filtered** at each level before unfiltered → company-name fallback → Coresignal. The filter is the job's **country** (`locationCountry()` → e.g. "United States"), NOT the exact city — recruiters are spread across the country/remote, so a city filter ("Boston, MA, United States") returned nobody and the waterfall fell through to an unfiltered step that surfaced international profiles. Country-level keeps results US (or whatever the role's country is) while matching across cities. Virtual locations ("Remote", etc.) → no filter. The people finder country-filters its primary domain+title step the same way.
3. Response includes `companyMeta` (from the first ContactOut result's company object) alongside people/recruiters.

**ContactOut search response carries free intelligence** — captured in `Person.searchProfile` on every result at no extra cost:
- `contactAvailability: { email: boolean }` — whether ContactOut has an email for this person. Passed as `contactHint` to `/api/enrich` to **skip the $0.33 ContactOut email reveal when `email=false`** (Apollo + Bytemine still run). Not shown in the UI. (Phone availability is intentionally not tracked — the site never surfaces phone numbers.)
- `experience[]` / `education[]` / `bio` — powers "Pull Profile" for ContactOut results at zero additional cost (strings like "Title at Company in YYYY - Present", parsed client-side).
- `companyMeta` (logo, employees, HQ, overview, founded, revenue) — shown in the hiring banner dropdown.

**Alumni flow** (`AlumniFinder` → `app/api/alumni/route.ts`) — domain-first ContactOut search with education filter. Opt-in, school not asked up front. Keeps the full page (`LIMIT = 25`); UI shows 5 + "show more". Cards support Get contact / Pull Profile like people/recruiters.

**Enrich flow** (`PersonCard` "Get contact" → `app/api/enrich/route.ts` → `EnrichDrawer`) — **email only; the site never surfaces phone numbers (privacy decision)**. Three providers: **Apollo `/api/v1/people/match` ($0.01, fast)**, **Bytemine `/contacts/enrich` ($0.03, but SLOW — ~18s email-finder, 25s timeout)**, **ContactOut `/v1/people/linkedin` ($0.33, fast, `include_phone:false`)**. Each step fires only if no email yet.
- **Smart ordering by speed:** Apollo always first. When the search said ContactOut has the email (`contactHint.email === true`), order is Apollo → **ContactOut** (fast) → Bytemine — so we get the email in 1–3s instead of waiting ~18s on Bytemine. Otherwise Apollo → **Bytemine** (cheap) → ContactOut. (Bytemine *is* the only source for some contacts — it returns personal emails ContactOut lacks — so it stays in the chain.)
- ContactOut step is **skipped entirely** when `contactHint.email=false` (search confirmed it has none → Bytemine is the only hope, slow but unavoidable).
- Apollo's `email_status` is checked — `invalid`/`do_not_email`/`bounced`/`spam` primaries are dropped.
- Returns `{ emails, source, company, position, location, links }`. Bytemine/ContactOut also return phone numbers in their payloads; the route deliberately **does not extract or return them**. (No phone route or "Get phone" UI.)

**Pull Profile flow** (`PersonCard` "Pull Profile →" → `ProfileDrawer`):
- **ContactOut results (~95%)**: uses `person.searchProfile` data already fetched in the $0.05 search — experience/education/bio strings parsed client-side. Zero extra cost. Instant, no loading state.
- **Coresignal results (~5%)**: falls back to `/api/profile` → Apollo `people/match` ($0.01, no contact reveal) for structured career/education/skills data.

**Coresignal caveat:** `experience_company_name` matches anyone who *ever* worked there — `fromCoresignal()` filters to current company matches first, falls back to full list only if none match. Coresignal's `profile_url` is a real LinkedIn URL, so results are enrichable.

**Why not Edges `linkedin-extract-people` for Pull Profile?** Edges can extract individual LinkedIn profiles at $0.09, but it's 9× Apollo's $0.01 for marginal data quality gain. More importantly, Edges is NOT a search API — it only extracts individual profiles given a URL. Coresignal is used as a people-finder fallback because it has actual search filters (company + title). These are different tools for different jobs; the "Coresignal vs Edges" framing was a false choice.

**Why not Tomba email-finder?** Confirmed unreliable — guesses email patterns from name+domain (e.g. `{first_initial}{last_initial}@company.com`) rather than pulling real data. Tested with Araz Bilehjani at klaviyo.com: returned `ab@klaviyo.com` attributed to a different person (Arun Bharadwaj). `accept_all` domains (common for large companies) make pattern-guessed emails unverifiable. Skip.

## Costs (verified live; best case = common path)

- **Resolve:** LinkedIn $0.09 · everything else $0.02 (JSON-LD) → $0.02 (OG heuristic, free step) → $0.045 (LLM fallback)
- **People + Recruiters:** $0.05 best (first ContactOut step hits) · People ≤ ~$0.20 worst (4 ContactOut steps, tightened) · Recruiters ≤ $0.242 worst
- **Search total:** LinkedIn ~$0.19 best / ~$0.55 worst · Greenhouse/careers ~$0.12 best / ~$0.51 worst. Recorded at **actual** cost; gate reserves $0.60.
- **Alumni:** $0.05 → $0.10 worst (domain fallback)
- **Pull Profile:** $0 for ContactOut results (already in search data) · $0.01 Apollo for Coresignal results
- **Enrich (email only):** $0.01 Apollo → $0.04 Bytemine fallback → $0.37 worst (ContactOut $0.33, `include_phone:false`)
- **Enrich all 8 returned:** ~$0.08 best (all Apollo) → ~$2.96 worst (all hit ContactOut)
- **Full session:** ~$0.20–0.27 typical · ~$3.5 absolute worst (search + 8 ContactOut enriches). Bounded per visitor by the 10/step/day rate limit; the $40 global cap reserves each step's worst case.

> ContactOut `/v1/people/search` is `reveal_info ? 25*0.75 : 0.05` — always pass `reveal_info: false`. `/v1/people/linkedin` is `include_phone ? 0.55 : 0.33` — the enrich route always uses `false` (email only, never phone). ScrapeGraphAI stealth adds +$0.025.

## Scaling / deployment

Deployed to Vercel project **jobenrich** (`jobenrich.vercel.app`), **Hobby plan**, Supabase free. Fine for ~100 users. Public scale launch needs Vercel Pro ($20/mo) — Hobby is non-commercial-only. `public/robots.txt` disallows all crawlers (public demo, not for indexing). No privacy/ToS pages, no Slack alerts.

## Key files

- `lib/orthogonal.ts` — single `callOrthogonal(payload, { timeoutMs? })` wrapper + `QuotaExceededError` (thrown on 402/quota signal; routes return 503). **Every call has a network timeout** (default **12s**; scrape/LLM steps and **Bytemine** pass **25s** — Bytemine runs an SMTP/email-finder step and routinely takes 17–18s, so the 12s default was aborting it mid-success and dropping the email) via `AbortController` — a hanging provider aborts and the waterfall falls through to the next step instead of blocking until the serverless function is killed. (This was the "Bytemine hung → ContactOut never ran" bug: the enrich route also had no `maxDuration` so it died at the 10s Hobby default.) Routes that chain providers set a generous `maxDuration` (search 60, enrich 60, alumni/profile 30).
- `lib/people.ts` — `Person` + `SearchProfile` + `CompanyMeta` types; `fromContactOut()` captures the full search response (experience, education, bio, contact_availability, company meta) at no extra cost; three waterfall finders; `waterfall()` returns `StepResult { people, companyMeta, cost }` (cost = real USD of every step that ran, for the spend ledger).
- `lib/jobResolver.ts` — three-step generic resolver: JSON-LD → OG title heuristic → LLM. LinkedIn slug URL fix: regex extracts last `≥7`-digit sequence from `/jobs/view/...` path. `ATS_HOSTS` guard. `hostFromUrl()` via `tldts`.
- `lib/validation.ts` — `canonicalizeLinkedInJobUrl` (handles both bare ID and slug URLs), `isValidLinkedInProfileUrl`, `isValidJobUrl`, `isValidSchool`.
- `lib/security/guard.ts` — steps: `search`, `alumni`, `enrich`, `profile`.
- `app/api/search/route.ts` — resolves job → runs two waterfalls → returns `{ companyMeta, people, recruiters, ... }`.
- `app/api/enrich/route.ts` — email-only waterfall (Apollo→Bytemine→ContactOut, `include_phone:false`); skips ContactOut when `contactHint.email=false`; filters Apollo invalid email_status. Never returns phone numbers.
- `app/api/profile/route.ts` — Apollo `people/match` ($0.01) for Coresignal results only; ContactOut results use free `searchProfile` data client-side.
- `components/PersonCard.tsx` — `SearchProfile` + `PersonData` types; "Get contact" + "Pull Profile" actions; responsive button labels (`sm:` prefix for full text).
- `components/EnrichDrawer.tsx` — ■ Email section (lists emails or "No email found.") + ■ Around the web links. Email only — no phone UI.
- `components/ProfileDrawer.tsx` — LinkedIn profile research: bio, career, education, skills, links.
- `components/BuilderDrawer.tsx` — "How this was built" Orthogonal marketing panel (API calls + unit costs).
- `components/SessionTabs.tsx` — closeable multi-search tab bar, persisted in sessionStorage.
- `components/ResultsSection.tsx` — renders a people list; shows the first 5 with a "+ Show N more" reveal (`INITIAL_VISIBLE = 5`). Keyed so the reveal resets per result set — by session id for people/recruiters (in `page.tsx`), by a per-search counter for alumni (in `AlumniFinder.tsx`). Used by people, recruiters, and alumni alike (all three finders return up to 25). All thread `onProfile`/`profiledUrls` alongside `onEnrich`/`enrichedUrls`, so Get contact / Pull Profile work identically across the three.

## Conventions

- Validate input → `NextResponse.json({ error }, { status })`; 502 for upstream failures; 422 for unreadable links; 503 for quota/cap.
- **Error surfacing:** routes use `error`; guard uses `message`. `errorMessage()` in `client.ts` reads both.
- API logs prefix: `[search]` / `[alumni]` / `[enrich]` / `[profile]` / `[people]`.
- New external sources → `callOrthogonal`. New people-finders → `lib/people.ts` `waterfall()`.
- The UI never names providers. No "Apollo/Bytemine/ContactOut" in UI copy.
