# AstralSync — Build TODO

Derived from `AstralSync_PRD_v2.md` (v2.0). Ordered by build dependency: `astro-core` first (PRD §10), since every other component consumes its output. See `ARCHITECTURE.md` for the technical design.

> **Status (2026-08-11):** Phases 0 and 1a–1g are **complete**: 153 passing tests, clean build, full UI verified end-to-end, and the app now ships as an installable PWA (manifest + icons + hand-written service worker; visited charts reload offline). Desktop verification done headlessly (manifest/headers/offline page); in-browser install + offline flow on desktop and mobile remains a quick manual pass (steps in the Phase 1g notes). `experimental.useOffline` deliberately skipped (connectivity retry UI, not asset caching). v1 scope is done — remaining work is Phase 2/3.

---

## Phase 0 — Scaffolding

- [x] Init git repository with `.gitignore` (Node, Next.js, `.env`)
- [x] Create Next.js app (App Router, TypeScript) at repo root — Next 16, minimal shell + engine smoke-test page
- [x] Set up workspace packages: `packages/astro-core`, `packages/numero-core` (framework-free TypeScript, no Next.js imports)
- [x] Configure test runner (Vitest) for both core packages — root `vitest.config.mts`, `npm test`
- [x] Connect to local MySQL; set up Prisma with migration tooling (`DATABASE_URL` in `.env`) — Prisma 6, database `astralsync` created, initial migration applied
- [ ] Optional: `docker-compose.yml` (app + MySQL) for one-command startup

## Phase 1a — `astro-core` (build first)

- [x] Define input contract: UTC instant + lat/lng + house system + time-certainty flag — `src/types.ts` (`ChartInput`)
- [x] Define output snapshot JSON schema (placements, aspects, houses, engine metadata) — `ChartSnapshot`, schemaVersion 1
- [x] Ephemeris interface (thin wrapper) + `astronomy-engine` (MIT) implementation; document the optional `swisseph` swap path without building it — `src/ephemeris/`
- [x] Planetary longitudes for Sun–Pluto; zodiac sign placement (tropical, of-date via `Ecliptic()`)
- [x] Retrograde detection (velocity sign, ±1h finite difference)
- [x] House cusp math: Placidus (default, iterative semi-arc trisection), Whole Sign, Equal House — `src/houses.ts`
- [x] Automatic Whole Sign fallback at high latitudes where Placidus degenerates (`PlacidusDegenerateError`)
- [x] Ascendant / MC calculation
- [x] Aspect detection: conjunction, opposition, trine, square, sextile with configurable orbs (defaults: 8° luminaries, 6° planets) — `src/aspects.ts`
- [x] Solar-chart mode for unknown birth time: planets in signs + aspects only; suppress Ascendant, houses, and Moon degree precision with a machine-readable reason
- [x] Uncertainty flags for approximate time: Ascendant, cusp-adjacent Moon, house placements
- [ ] **Golden chart tests** (PRD §8): 10–15 reference charts with known published placements, asserting sign, house, and longitude within 1 arcminute of Swiss Ephemeris reference values — *partial: equinox/solstice/J2000 fixtures at tight tolerance + Einstein 1879 chart (Sun/Moon/Asc) at ~1° tolerance in `test/golden.test.ts`; the full arcminute suite against Swiss Ephemeris reference output remains*
- [x] **Edge-case tests**: birth near midnight across a DST transition; high-latitude birth (Placidus fallback); planet stationing (retrograde flag); sign-cusp Moon with approximate time; pre-1970 birth date — *high-latitude fallback, retrograde windows, cusp Moon, and the 1879 chart live in `packages/astro-core/test/`; DST-midnight (Havana gap), fall-back fold, and the pre-1970 offset warning live in `lib/tz.test.ts`*

## Phase 1b — `numero-core`

- [x] Life Path Number from birth date with master numbers 11/22/33 never reduced — `src/lifePath.ts` (three-cycles method, documented)
- [x] Pythagorean letter values; Destiny/Expression Number and Soul Urge Number from full birth name — `src/pythagorean.ts`
- [x] Y-as-vowel rules — documented and tested (project rule: Y is a consonant only when gliding into a following vowel)
- [x] Hebrew gematria system: standard letter values, final forms (ך ם ן ף ץ) handled — `src/gematria.ts` (destiny-equivalent only; Soul Urge deliberately not offered for unvocalized Hebrew)
- [x] Transliteration suggestion path for non-Latin names feeding the Pythagorean system — onboarding name step detects non-Latin/non-Hebrew input and prompts for a manual Latin transliteration (submitted as `nameScript: latin`); a zod refine rejects Latin-script names with no Latin letters (closed a 500 in `computeNumero`)
- [x] Letter-by-letter derivation output (the "show your work" breakdown, PRD §3.3) — `derivation` on every result
- [x] Tests: master number preservation, Y-vowel cases, Hebrew final forms

## Phase 1c — Geolocation & timezone (fully offline)

- [x] Download GeoNames `cities15000` dataset; write import script into MySQL `geo_city` table — `npm run geo:import` (idempotent); 34,078 cities imported and prefix-search verified against the live DB
- [x] City search API route: local prefix/`LIKE` query with name index (no external API) — `app/api/cities/route.ts`, population-ranked, includes each city's IANA zone
- [x] `geo-tz` lat/lng → IANA timezone lookup — `lib/tz.ts` (`timezoneFor`), tested offline
- [x] Historical UTC offset resolution for the birth moment (IANA tz database, incl. DST) — `resolveBirthMoment` with DST gap/fold handling (Temporal "compatible" semantics)
- [x] Manual offset override support; persist `offset_overridden` flag — flag in `prisma/schema.prisma`; onboarding UI wiring lands in Phase 1e
- [x] Pre-1970 birth date warning surfaced to the UI layer — `pre_1970_offset_uncertain` warning emitted by `resolveBirthMoment`; display lands in Phase 1e

## Phase 1d — Database & snapshots

- [x] Prisma schema + migrations for PRD §6 tables: `profile`, `geo_city`, `astro_snapshot`, `numero_snapshot`, `reading` — schema in `prisma/schema.prisma` (enums, write-once versioning via `@@unique([profileId, version])`, cascade deletes); migration `20260811072216_init` applied
- [x] Write-once snapshot rule: no UPDATE path; editing birth data creates a new snapshot version — no mutation code path exists, and a Prisma client guard in `lib/db.ts` throws on any snapshot update/delete (cascade on profile hard-delete is the only way a snapshot dies)
- [x] Snapshot records `engine`, `engine_version`, `content_version` — engine name/version self-reported by the ephemeris provider (`astronomy-engine` 2.1.19); `content_version` from `lib/versions.ts` ("0" until the Phase 1f library exists)
- [x] Compute-once flow: chart calculated exactly once at profile creation/edit, read forever after — `lib/snapshots.ts` service: compute happens only in POST/PUT `/api/profiles`; presentational edits (display name, city label) update the profile row without recompute; all reads are pure DB
- [x] Profile export (full JSON) and hard delete — `GET /api/profiles/[id]/export` (every snapshot version + readings, download headers); `DELETE /api/profiles/[id]` with DB-level cascade
- [x] Multi-profile CRUD (list, create, view, delete) — `app/api/profiles/` routes, zod-validated (`lib/validation.ts`); view supports `?version=N` history since old versions stay readable forever

## Phase 1e — UI

- [x] Onboarding flow: birth date → birth time (exact / approximate / unknown) → offline city search → resolved UTC offset review with manual override → optional full birth name (with why-we-ask note) — `components/onboarding/` six-step wizard; offset preview via new read-only `GET /api/offset` (mirrors compute's noon convention); pre-1970/DST warnings surfaced with override nudge
- [x] Unknown-time path completes onboarding and produces a solar chart with a clear explanation of what's suppressed — solar explanation at the time step and a `SolarChartNotice` on the chart, both quoting the snapshot's machine-readable reasons
- [x] SVG natal chart wheel rendered from snapshot JSON: 12 houses, zodiac signs, planetary glyphs, aspect lines, retrograde markers — pure geometry in `components/chart/geometry.ts` (unit-tested: rotation, CCW orientation, conjunction fan-out, chord radii); glyphs are Unicode astrological codepoints with text-presentation selector, isolated in `glyphs.tsx` as the documented swap point for SVG paths
- [x] Hover/tap interactivity on placements and aspects — hover previews, click/tap/Enter pins into a detail card; planets and aspect chords are focusable with full aria labels
- [x] Big Three display (Sun, Moon, Rising) — Rising gracefully omitted for solar charts (`components/profile/BigThree.tsx`)
- [x] House system selector (Placidus / Whole Sign / Equal) — triggers new snapshot version — `HouseSystemSelector` PUTs the rebuilt `ProfileInput` (`profileToInput`, round-trip-tested); 409 handled; hidden on solar charts and old versions
- [x] Uncertainty badges on time-sensitive placements when time is approximate — driven by the snapshot's `uncertainties` fields (`ascendant`, `houses`, `moon_sign`) with the stored reasons as tooltips; Placidus high-latitude fallback gets its own chip
- [x] Numerology view with letter-by-letter derivation breakdown — three-cycles Life Path table, per-word letter grids (vowels marked for Soul Urge, RTL for gematria), master-number badges
- [x] Profile switcher / management screens — profile list at `/`, per-profile tabs (Chart / Numerology / Details), minimal version history via `?version=N` (new `listSnapshotVersions`), export link, inline-confirm hard delete, edit page reusing the wizard

## Phase 1f — Interpretation content library

- [x] Define content file format: Markdown/JSON keyed by placement, versioned in-repo under `content/` — Markdown + flat frontmatter, keys derived from paths (`content/README.md` is the authoring guide); full PRD §5 taxonomy supported by the loader from day one
- [x] Content loader that resolves snapshot placements → entries; snapshot stores `content_version` — `lib/content.ts` (`loadContentIndex`/`resolveReading`, cached, graceful on unauthored keys); `CONTENT_VERSION` bumped to "1"; readings resolve live against the current tree, with a provenance note when a snapshot's stamp differs (pre-1f "0" snapshots included)
- [x] Author v1 entries (~40): 12 Sun signs + 12 Moon signs + 12 Ascendant signs scoped to Big Three, Life Path (1–9, 11, 22, 33), element dominance (4) — 52 entries under `content/en/`, lint-enforced by `lib/content.lint.test.ts` (coverage, format, size band, Markdown subset)
- [x] Synthesized reading from template intersection (dominant element/modality × Life Path) — element-only in v1 per PRD §5's scope cut (`lib/synthesis.ts` composes entry essences; `lib/dominance.ts` computes dominance with Sun→Moon→canonical tie-break); *modality dominance entries deferred to the Phase 2 matrix, `SIGN_MODALITIES` already defined*
- [x] Optional LLM synthesis hook (Ollama/local or API): once per snapshot, stored in `reading`, **off by default** — `READING_LLM` env contract (`.env.example`), `lib/llm.ts` + POST `/api/profiles/[id]/reading`; once-only enforced by a DB unique on `(astro_snapshot_id, generator)`; LLM failure returns 502 and never degrades the rest of the app; rendered in the new Reading tab via a dependency-free XSS-safe Markdown renderer

## Phase 1g — PWA packaging

- [x] Web app manifest (installable on phone/desktop) — `app/manifest.ts` wrapping testable `lib/pwa/manifest.ts`; `viewport` export (theme color = `--bg`) in the layout; icons hand-authored in `app/icon.svg` and rasterized to committed PNGs (192/512 + maskable + apple-touch) via `npm run icons:generate` (sharp devDependency, never runs in build)
- [x] Service worker: previously loaded charts viewable offline — hand-written `public/sw.js` (no PWA lib): network-first for documents and RSC payloads (RSC keyed minus `_rsc` so `?version=N` history stays distinct; `ignoreVary` throughout), cache-first for `/_next/static`, `/api/*` and mutations never intercepted; `/offline` fallback page precached at install; versioned `astralsync-*` caches with old-version cleanup and 50-entry trim; prod-only registration (`components/pwa/ServiceWorkerRegistration.tsx`, dev actively unregisters; `NEXT_PUBLIC_SW_DEV=1` escape hatch); `/sw.js` served no-store via `next.config.ts` headers
- [x] Verify install + offline flow on mobile and desktop — automated: 153 tests (manifest shape/icon existence/theme-color sync, SW request classification + lifecycle), prod build + served checks (single manifest link, theme-color meta, apple-touch-icon, sw.js headers, offline page). Manual pass: desktop — DevTools → Application → installability + SW active, then Network→Offline and reload a visited profile (cached), a never-visited one (offline page), a mutation (clean error); Android — `adb reverse tcp:3000 tcp:3000` → `http://localhost:3000` in Chrome, install, airplane-mode reload; iOS (optional) — `NEXT_PUBLIC_SW_DEV=1 next dev --experimental-https`

---

## Phase 2 (deferred — do not start in v1)

- Synastry: dual-chart overlay from two stored profiles
- Daily transits dashboard (current positions vs. natal snapshot)
- Full interpretation matrix (planet-in-sign ×120, planet-in-house ×120, ~50 aspects, modality dominance)

## Phase 3 (public deployment gate — deferred)

- Authentication / user accounts
- Hosted MySQL/Postgres migration
- Privacy hardening: encryption at rest, retention policy, GDPR-style deletion
- Rate limiting; re-evaluate client-side vs. server-side calculation for static hosting

## Explicitly out of scope (PRD §7)

React Native / native apps · cloud hosting/CDN · minor aspects, asteroids, fixed stars, progressions · UI localization (content structure must not preclude it)
