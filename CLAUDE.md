@AGENTS.md

# Job Intel

A Next.js 16 app that surfaces the **people behind any LinkedIn job posting**. A student/job-seeker pastes a job URL and gets people at that company worth reaching out to, plus recruiters hiring for it. They can then optionally enter their school to surface alumni, and pull contact info for any person on demand. **Powered by Orthogonal.**

## Stack

- Next.js 16.2.9 (App Router) · React 19 · TypeScript
- Tailwind v4 — config lives in `app/globals.css` via `@theme`, **not** a `tailwind.config` file. Design system is **dark neo-brutalism**: hard 3px borders, hard offset shadows (`box-shadow: Npx Npx 0 0 <accent>`), zero border-radius, flat saturated accents, instant/stepped state changes (never eased). Reusable primitives `.nb-card` / `.nb-btn` / `.nb-input` / `.nb-flat` live in `globals.css`; per-element accent is passed via the inline `--nb` CSS custom property.
- `lucide-react` for icons. No test framework.

## Environment variables

- `ORTHOGONAL_API_KEY` — auth for all external data calls (required).
- `APP_PASSWORD` — the single shared password for the gate (required).

> **⚠ Status (as of 2026-06-13): `.env.local` still holds placeholders** — `ORTHOGONAL_API_KEY=orth_live_xxxxx` and `APP_PASSWORD=change_me_before_deploying`. The app therefore **cannot reach Orthogonal or pass the login gate yet**; hitting the API routes via `npm run dev` will fail until a real key + password are dropped in. The waterfall pipeline was validated out-of-band through the Orthogonal MCP tools (job extract, ContactOut search, Tomba enrich all confirmed against a live Tenable posting). Two branches remain unverified end-to-end: the **Coresignal fallback** (only fires when ContactOut returns zero) and the **ContactOut `/v1/people/linkedin` $0.33 enrich fallback** (only fires when Tomba misses).

## Architecture / data flow

**Auth is a lightweight password gate, not real user accounts:**
- `proxy.ts` — middleware guarding `/`, `/api/search`, `/api/enrich`. Redirects to `/login` when the `ji_session` cookie is absent. Note: presence-only check — the token value isn't validated server-side.
- `app/api/auth/route.ts` — compares input to `APP_PASSWORD` with `timingSafeEqual`, then sets a random httpOnly `ji_session` cookie (30-day).

**Everything runs on a waterfall model** (ported from a sister demo): within each finder, a step only fires if the previous step returned **zero** people. Cheap/broad sources are tried first, and a fallback only costs money when it's actually needed. All finders live in `lib/people.ts` and return a normalized `Person` ({ name, title, linkedinUrl, profilePictureUrl, source }).

**Search flow** (`app/page.tsx` → `app/api/search/route.ts`) — input is **just the job URL**:
1. Canonicalize the URL (`lib/validation.ts` → `canonicalizeLinkedInJobUrl`).
2. Orthogonal `edges/linkedin-extract-job` → job title + company. `simplifyJobTitle()` strips intern/seasonal decorations so ContactOut can match; `extractDomain()` best-effort pulls a company domain for the alumni fallback.
3. Run two waterfalls in parallel (`Promise.allSettled`), each with its own error flag:
   - **People (target 5):** ContactOut `people/search` (company + title) → ContactOut (company only) → Coresignal `employee_base/search/filter/preview` (company).
   - **Recruiters (target 3):** ContactOut (company + 13 recruiter titles) → Coresignal (company + title "Recruiter") → Coresignal (company only — founders hire directly).

**Alumni flow** (`components/AlumniFinder.tsx` → `app/api/alumni/route.ts`) — opt-in secondary action; the school is **not** asked for up front. Takes company + domain (from the search response) + school: ContactOut (company + education) → ContactOut (domain + education, only if a domain was found).

**Enrich flow** (`PersonCard` "Get contact" → `app/api/enrich/route.ts` → `EnrichDrawer`) — cheap contact waterfall: **Tomba `/v1/linkedin` ($0.01)** for an email first → only if empty, **ContactOut `/v1/people/linkedin` ($0.33)** for emails + phones. Returns `{ emails, phones, source }`. Provider response shapes are inconsistent, so the route coerces defensively (`collectStrings`) — preserve that.

**Coresignal caveat:** `experience_company_name` matches anyone who *ever* worked there, so `fromCoresignal()` filters results to rows whose *current* `company_name` matches the target (falling back to the raw list only if none match). Coresignal returns `profile_url` (a real LinkedIn URL), so its results are still enrichable.

## Costs (best case = first step hits, the common path)

- **Search:** job extraction + People ($0.05) + Recruiters ($0.05). Fallbacks add ~$0.021 each only when a prior step returned nothing.
- **Alumni:** $0.05 (→ $0.10 worst case with the domain fallback).
- **Enrich:** $0.01 (Tomba hit) → $0.34 worst case (Tomba miss + ContactOut).

## Key files

- `lib/orthogonal.ts` — the single `callOrthogonal()` wrapper. **All external API calls go through this.** Hits `api.orthogonal.com/v1/run` with `{ api, path, method, body?, query? }`, throws on `!res.ok` or `!json.success`, returns `json.data` (the provider's raw response body).
- `lib/people.ts` — `Person` type, normalizers, the three waterfall finders, `simplifyJobTitle`, `extractDomain`. **Add new people sources here**, behind the `waterfall()` runner.
- `lib/validation.ts` — URL canonicalization + validators (`isValidLinkedInProfileUrl`, `isValidSchool`).
- `components/` — `SearchForm` (URL only), `ResultsSection`, `PersonCard`, `AlumniFinder`, `EnrichDrawer`, `PipelineProgress` (cosmetic timed steps — not tied to real backend events), `OrthogonalBadge`, `PasswordGate`.

## Conventions

- Validate input and return `NextResponse.json({ error }, { status })` on bad requests; use 502 for upstream Orthogonal failures.
- API routes log with a `[search]` / `[alumni]` / `[enrich]` / `[people]` prefix.
- New external data sources go through `callOrthogonal`, not raw `fetch`, and new people-finders go through `lib/people.ts`'s `waterfall()` so the fire-only-on-empty cost discipline is preserved.
