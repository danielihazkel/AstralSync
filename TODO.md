# AstralSync — Build TODO

Derived from `AstralSync_PRD_v2.md` (v2.0). Ordered by build dependency: `astro-core` first (PRD §10), since every other component consumes its output. See `ARCHITECTURE.md` for the technical design.

> **Status (2026-08-11):** Phases 0, 1a, 1b, and 1c are **complete**: 47 passing tests, clean build, MySQL migrated (all five tables), and 34,078 GeoNames cities imported and searchable. Next up: Phase 1d snapshot persistence (profile CRUD, compute-once storage, export/delete).

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
- [ ] Transliteration suggestion path for non-Latin names feeding the Pythagorean system — *app-level feature, belongs with onboarding (Phase 1e)*
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
- [ ] Write-once snapshot rule: no UPDATE path; editing birth data creates a new snapshot version
- [ ] Snapshot records `engine`, `engine_version`, `content_version`
- [ ] Compute-once flow: chart calculated exactly once at profile creation/edit, read forever after
- [ ] Profile export (full JSON) and hard delete
- [ ] Multi-profile CRUD (list, create, view, delete)

## Phase 1e — UI

- [ ] Onboarding flow: birth date → birth time (exact / approximate / unknown) → offline city search → resolved UTC offset review with manual override → optional full birth name (with why-we-ask note)
- [ ] Unknown-time path completes onboarding and produces a solar chart with a clear explanation of what's suppressed
- [ ] SVG natal chart wheel rendered from snapshot JSON: 12 houses, zodiac signs, planetary glyphs, aspect lines, retrograde markers
- [ ] Hover/tap interactivity on placements and aspects
- [ ] Big Three display (Sun, Moon, Rising) — Rising gracefully omitted for solar charts
- [ ] House system selector (Placidus / Whole Sign / Equal) — triggers new snapshot version
- [ ] Uncertainty badges on time-sensitive placements when time is approximate
- [ ] Numerology view with letter-by-letter derivation breakdown
- [ ] Profile switcher / management screens

## Phase 1f — Interpretation content library

- [ ] Define content file format: Markdown/JSON keyed by placement, versioned in-repo under `content/`
- [ ] Content loader that resolves snapshot placements → entries; snapshot stores `content_version`
- [ ] Author v1 entries (~40): 12 Sun signs + 12 Moon signs + 12 Ascendant signs scoped to Big Three, Life Path (1–9, 11, 22, 33), element dominance (4)
- [ ] Synthesized reading from template intersection (dominant element/modality × Life Path)
- [ ] Optional LLM synthesis hook (Ollama/local or API): once per snapshot, stored in `reading`, **off by default**

## Phase 1g — PWA packaging

- [ ] Web app manifest (installable on phone/desktop)
- [ ] Service worker: previously loaded charts viewable offline
- [ ] Verify install + offline flow on mobile and desktop

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
