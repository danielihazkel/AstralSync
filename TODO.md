# AstralSync — Build TODO

Derived from `AstralSync_PRD_v2.md` (v2.0). Ordered by build dependency: `astro-core` first (PRD §10), since every other component consumes its output. See `ARCHITECTURE.md` for the technical design.

> **Status (2026-08-11):** Phases 0 and 1a–1g are **complete**: 153 passing tests, clean build, full UI verified end-to-end, and the app now ships as an installable PWA (manifest + icons + hand-written service worker; visited charts reload offline). Desktop verification done headlessly (manifest/headers/offline page); in-browser install + offline flow on desktop and mobile remains a quick manual pass (steps in the Phase 1g notes). `experimental.useOffline` deliberately skipped (connectivity retry UI, not asset caching). v1 scope is done — remaining work is Phase 2/3/4. Phase 2 (Hebrew chart & reading) is broken down into 2a–2d below; **Phase 2 (Hebrew chart & reading, 2a–2d) is complete** (218 passing tests, clean build; only the quick in-browser RTL pass remains manual); the synastry/transits phase (now Phase 3) into 3a–3d; the "do not start in v1" gate is lifted. **Phase 3 (3a–3d) is complete**: cross-chart engine, daily transits, synastry, and the full interpretation matrix (356 English content entries; the Tier 2 aspect matrix ships 49 of the notional 50 — see the tier note). Quick in-browser passes of the bi-wheel interactivity and the enlarged Reading tab remain manual. Remaining work is Phase 4 (public deployment gate).

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
- [x] **Golden chart tests** (PRD §8): 12 reference charts (1879–2024, both hemispheres, equator, Reykjavík high latitude, eclipse day, solar chart) asserting every planet longitude against verbatim swetest output (SE 2.10.03) at 1′ (30″ Moon, 3′ pre-1900), retrograde flags, Placidus Asc/MC at 2′, and all 12 Placidus cusps at 2′ for four latitude-spanning charts — `test/golden.test.ts`, provenance documented in the file header
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
- [x] Synthesized reading from template intersection (dominant element/modality × Life Path) — element-only in v1 per PRD §5's scope cut (`lib/synthesis.ts` composes entry essences; `lib/dominance.ts` computes dominance with Sun→Moon→canonical tie-break); *modality dominance entries deferred to the Phase 3 matrix, `SIGN_MODALITIES` already defined*
- [x] Optional LLM synthesis hook (Ollama/local or API): once per snapshot, stored in `reading`, **off by default** — `READING_LLM` env contract (`.env.example`), `lib/llm.ts` + POST `/api/profiles/[id]/reading`; once-only enforced by a DB unique on `(astro_snapshot_id, generator)`; LLM failure returns 502 and never degrades the rest of the app; rendered in the new Reading tab via a dependency-free XSS-safe Markdown renderer

## Phase 1g — PWA packaging

- [x] Web app manifest (installable on phone/desktop) — `app/manifest.ts` wrapping testable `lib/pwa/manifest.ts`; `viewport` export (theme color = `--bg`) in the layout; icons hand-authored in `app/icon.svg` and rasterized to committed PNGs (192/512 + maskable + apple-touch) via `npm run icons:generate` (sharp devDependency, never runs in build)
- [x] Service worker: previously loaded charts viewable offline — hand-written `public/sw.js` (no PWA lib): network-first for documents and RSC payloads (RSC keyed minus `_rsc` so `?version=N` history stays distinct; `ignoreVary` throughout), cache-first for `/_next/static`, `/api/*` and mutations never intercepted; `/offline` fallback page precached at install; versioned `astralsync-*` caches with old-version cleanup and 50-entry trim; prod-only registration (`components/pwa/ServiceWorkerRegistration.tsx`, dev actively unregisters; `NEXT_PUBLIC_SW_DEV=1` escape hatch); `/sw.js` served no-store via `next.config.ts` headers
- [x] Verify install + offline flow on mobile and desktop — automated: 153 tests (manifest shape/icon existence/theme-color sync, SW request classification + lifecycle), prod build + served checks (single manifest link, theme-color meta, apple-touch-icon, sw.js headers, offline page). Manual pass: desktop — DevTools → Application → installability + SW active, then Network→Offline and reload a visited profile (cached), a never-visited one (offline page), a mutation (clean error); Android — `adb reverse tcp:3000 tcp:3000` → `http://localhost:3000` in Chrome, install, airplane-mode reload; iOS (optional) — `NEXT_PUBLIC_SW_DEV=1 next dev --experimental-https`

---

## Phase 2 — Hebrew chart & reading (Mazal)

Post-PRD addition. Jewish/Mazalot astrology plus Hebrew-calendar numerology, delivered in Hebrew (content only — app chrome stays English; the PRD §7 localization exclusion is untouched). Ordered like Phase 1: engine primitives first (`hebrew-core` + `numero-core` extensions), then the write-once snapshot, then content, then UI. Content authoring (2c) can proceed in parallel once 2a's tables fix the key taxonomy — `resolveHebrewReading` degrades gracefully on unauthored keys, same as `resolveReading`.

### Phase 2a — `hebrew-core` engine + gematria extensions (build first)

- [x] **New workspace package `packages/hebrew-core`** — framework-free like `astro-core`; single dependency `@hebcal/core` (`HDate` conversion incl. leap-year Adar I/II, `renderGematriya`, `GeoLocation`/`Zmanim` NOAA sunrise/sunset); engine name/version self-reported for snapshot metadata; GPL-2.0 license noted in the package README (unhosted app — re-evaluate at the Phase 4 gate) — *installed `@hebcal/core@6.9.2` (v6, not the v5 assumed here); engine version taken from the library's runtime `version` export*
- [x] **Sunset-aware Hebrew birth date** — `src/hebrewDate.ts`: `hebrewBirthDate(MazalInput): HebrewBirthDate` with `civil` vs sunset-adjusted `effective` dates, `afterSunset`, stored `sunsetUtc`, and machine-readable `ambiguity` (`unknown_time` uses a daylight convention mirroring the local-noon solar convention; `approx_time_near_sunset` within ±60 min; `no_sunset_polar` graceful fallback); `HDate` always constructed from explicit y/m/d, never a raw `Date` — *y/m/d → Rata Die in `src/calendar.ts`; polar detection via `Invalid Date` (hebcal returns NaN, not null); `MazalInput` takes the user-entered civil date + resolved UTC + IANA id so the offset-override escape hatch stays honored*
- [x] **Month mazal + Sefer Yetzirah tables** — `src/mazalot.ts` (Nisan→taleh/Aries … Adar→dagim/Pisces; Adar I/II collapse to the `adar` key, display name preserved) and `src/seferYetzirah.ts` (letter, letter name, tribe, faculty per month) — *Gra recension per Kaplan's edition (frozen source for the 2c content keys)*
- [x] **Day-of-week ruling planet** — `src/dayPlanet.ts` (Sunday=Sun … Saturday=Saturn per Talmud Shabbat 156a), keyed to the sunset-adjusted `effective` weekday; `day_planet_ambiguous` flag when date ambiguity flips the weekday — *realized as `DayPlanetResult.ambiguous` + a `day_planet` uncertainty entry (any non-null ambiguity fires it: a one-day shift always changes the weekday)*
- [x] **Planetary hour of birth** — `src/planetaryHours.ts`: unequal day/night twelfths from `Zmanim` sunrise/sunset (adjacent-day fetch for night hours), continuous Chaldean cycle (Saturn→Jupiter→Mars→Sun→Venus→Mercury→Moon) anchored at Sunday's first daylight hour = Sun; `null` for unknown time, `uncertain` flag for approx — *also `null` at polar no-sunrise/sunset, with a `planetary_hour` uncertainty; result carries `hourIndex`, `dayRuler`, and ISO hour boundaries*
- [x] **`buildMazalChart` composition** — `src/chart.ts` + `src/types.ts` (`MazalChart` schemaVersion 1 with input echo, `uncertainties[]`, engine metadata — same shape philosophy as `ChartSnapshot`); exported from `src/index.ts`; package added to the root Vitest workspace — *plus a `mazal` uncertainty when an ambiguous date sits on a Hebrew month boundary*
- [x] **Mispar katan** — `packages/numero-core/src/gematria.ts`: `MISPAR_KATAN_VALUES` derived from `GEMATRIA_VALUES` (zeros dropped: י=1, ק=1 …); `gematriaExpression(name, variant)` with optional `variant?: "hechrachi" | "katan"` on `NameNumberResult` (`system` stays `"gematria"` — no Prisma enum change) — *default `"hechrachi"` keeps every existing call site byte-identical apart from the new `variant` field*
- [x] **Hebrew date gematria** — new `packages/numero-core/src/hebrewDateGematria.ts`: `hebrewDateGematria({day, year})` — day and year reduced independently then summed and reduced, reusing `reduceSteps`/`isMaster` (masters 11/22/33 preserved), full derivation like `LifePathResult`
- [x] **Tests**: golden Gregorian↔Hebrew pairs incl. after-sunset flip, Adar I/II leap year, exact gematriya string, near-sunset approx flag — `packages/hebrew-core/test/hebrewDate.test.ts`; hour partition sums/Chaldean anchor/midnight-crossing night hour — `test/planetaryHours.test.ts`; table completeness + Adar collapse — `test/mazalot.test.ts`; date-gematria masters + katan name cases — `packages/numero-core/test/hebrewDateGematria.test.ts` + `test/names.test.ts` — *36 new tests (28 hebrew-core + 8 numero-core), full suite at 189*

### Phase 2b — `hebrew_snapshot` persistence & profile view

- [x] **Prisma model `HebrewSnapshot`** — third write-once snapshot (`@@unique([profileId, version])`, cascade delete, `mazalJson`/`gematriaJson`, denormalized `hebrewDate`/`monthKey`/`dayPlanet`/`hourPlanet`/`dateGematriaInt` columns, engine + `content_version`) — migration `add_hebrew_snapshot`; extend the write-once guard in `lib/db.ts` — *migration `20260811132721_add_hebrew_snapshot` applied*
- [x] **Compute wiring** — `lib/snapshots.ts`: `computeHebrew(d: ProfileBirthData)` (mazal chart + date gematria + katan name result when `nameScript === "hebrew"`, reusing `resolveChartMoment` for the UTC instant); `buildSnapshotRows` returns a `hebrewRow`; `createProfile`/`editProfile` write all three rows per version in one transaction — `computationChanged` already covers every Hebrew input, no change
- [x] **Lazy backfill for pre-feature profiles** — `ensureHebrewSnapshot(profileId)` in `lib/snapshots.ts`: create-on-view for the **latest** version only (a write-once create, guard-compatible; `getProfileView` stays a pure read — callers invoke it explicitly); historical `?version=N` rows are never backfilled and render a "not computed for this version" notice — *race-safe via the unique constraint (`P2002` swallowed); `profileRowToBirthData` reconstructs the compute shape from the stored row*
- [x] **View + export** — `ProfileView.hebrew` via `serializeHebrew` (mirrors `serializeAstro`); `HebrewView`/`StoredMazal` in `lib/view-types.ts`; `exportProfile` gains `hebrewSnapshots` (additive; `exportVersion` stays 1) — *plus `StoredHebrewGematria` and `toStoredMazal`/`toStoredHebrewGematria` helpers for the 2d UI*
- [x] **Tests**: three rows per version, `ensureHebrewSnapshot` idempotence, old-version null hebrew — extend `lib/snapshots.test.ts` — *pure compute/row/backfill-input tests in the committed suite (198 total, offline like the rest); the DB behaviors (three rows on create/edit, guard block, latest-only idempotent backfill, sparse export) verified against the live dev MySQL with a throwaway profile*

### Phase 2c — Hebrew content library & locale-aware loader (parallelizable after 2a)

- [x] **Locale-aware loader** — `lib/content.ts`: `ContentLocale` (`"en" | "he"`), `contentRoot(locale)` replacing the fixed `content/en` root (per-root `indexCache` already copes), `LOCALE_DIRECTION` metadata; new categories `mazal_month`, `day_planet`, `hour_planet`, `sefer_yetzirah`, `hebrew_date_gematria`, `name_gematria` added to `CONTENT_CATEGORIES`
- [x] **Author `content/he/` (62 entries, Hebrew language)** — 12 `mazal_month` (Adar entry covers Adar I/II), 7 `day_planet` + 7 `hour_planet` (Shabbat 156a temperaments), 12 `sefer_yetzirah`, 12 `hebrew_date_gematria` (1–9, 11, 22, 33), 12 `name_gematria`; ASCII keys, Hebrew titles/bodies; authoring notes added to `content/README.md` — *gender-neutral phrasing (ילידי/מי שנולד), original text informed by Shabbat 156a and Sefer Yetzirah ch. 5 (Gra/Kaplan, matching the hebrew-core table)*
- [x] **`resolveHebrewReading`** — new `lib/hebrewReading.ts`: slots `hebrew_date` (rendered data, no entry) / `month_mazal` / `day_planet` / `hour_planet` (skipped when null) / `sefer_yetzirah` / `date_gematria` / `name_gematria` (skipped without a Hebrew name), Hebrew `source` strings, `dir: "rtl"`, `missingKeys` degradation and `stale` provenance matching `resolveReading` — *all keyed to the effective (sunset-adjusted) date; after-sunset note rendered in the date section*
- [x] **Lint + version contract** — extend `lib/content.lint.test.ts` with per-locale coverage and a Hebrew-script body check (`/[֐-׿]/`); `CONTENT_VERSION` unchanged (new entries never bump, per `lib/versions.ts`) — *Markdown-subset and size-band checks refactored to run over both locale trees*
- [x] **Tests**: slot composition, suppression paths, RTL metadata — `lib/hebrewReading.test.ts` — *8 tests incl. empty-index degradation and stale provenance; suite at 213*

### Phase 2d — Mazal tab UI

- [x] **Mazal tab** (Chart / Reading / Numerology / **Mazal** / Details) — `components/profile/ProfileTabs.tsx` + new `components/mazal/MazalPanel.tsx`: summary card (gematriya Hebrew date incl. born-after-sunset note, month mazal with zodiac glyph from `glyphs.tsx`, day planet, hour planet with day/night + index, Sefer Yetzirah letter/tribe/faculty) in English chrome, then Hebrew reading sections in `<section lang="he" dir="rtl">` — *plus the date-gematria number with a master badge; render logic extracted to testable `mazalSummary.ts`*
- [x] **Shared Markdown renderer** — reuse the XSS-safe renderer from the Reading tab for Hebrew bodies (extract from `components/profile/ReadingPanel.tsx` into a shared component if not already standalone) — *already standalone as `components/Markdown.tsx`; reused as-is*
- [x] **Uncertainty + ambiguity chips** — driven by `mazal.uncertainties` (both candidate dates shown for sunset ambiguity; hour suppressed for unknown time), reusing the existing badge pattern; "not computed for this version" state for un-backfilled history — *after-sunset flips show the civil-daytime candidate inline; ambiguous no-flip cases carry the stored reason in the chip tooltip*
- [x] **Labels** — `CLASSICAL_PLANET_LABELS`, `HEBREW_MONTH_LABELS`, `HEBREW_WEEKDAY_LABELS` in `components/format.ts`; page wiring in `app/profiles/[id]/page.tsx` (`ensureHebrewSnapshot` + `resolveHebrewReading` passed to `ProfileTabs`)
- [x] **Tests + verification**: panel render states (full / unknown-time suppression / legacy-version notice); full `npm test` + build; manual RTL pass in-browser — *5 render-state tests in `mazalSummary.test.ts` (suite at 218); clean prod build; served smoke test confirmed the tab, Hebrew reading payload, and live lazy backfill on a real pre-feature profile; in-browser RTL pass remains a quick manual check*

### Post-2d additions (user-requested)

- [x] **Dedicated Hebrew birth name** — `profile.hebrew_birth_name` alongside the Latin `full_birth_name`, so both numerology systems coexist (Pythagorean destiny/soul urge from the Latin name; hechrachi gematria destiny + the mispar-katan Mazal reading from the Hebrew name). `nameScript` is vestigial (UI only writes `latin`; legacy `hebrew` payloads normalized by a zod transform, legacy rows moved by the migration). Wizard gains a second RTL name input with auto-routing; Numerology tab shows the gematria destiny card + RTL derivation for both-names profiles; `hebrewDestiny` rides in `derivationJson` (no column change)
- [x] **AI reading in the Mazal tab** — `ReadingGenerator.hebrew_llm` on the existing `reading` table keyed by the astro snapshot id (shared profileId+version ⇒ once-per-version via the existing unique constraint); `buildHebrewReadingPrompt` with Hebrew-language instructions over the `resolveHebrewReading` sections; POST `/api/profiles/[id]/hebrew-reading` mirroring the astro route (409 `no_hebrew_snapshot` for pre-feature history, 502 never writes); rendered RTL in `MazalPanel` with the same once-only generate UX

## Phase 3 — Synastry, transits & the full interpretation matrix

Ordered like Phase 1: engine primitives first (`astro-core`), since both transits (3b) and synastry (3c) consume them; transits before synastry because they are the smaller UI delta and validate the cross-aspect primitive plus the two-ring wheel geometry that synastry's bi-wheel reuses. The content matrix (3d) has no engine dependency and can proceed in parallel at any point — `resolveReading` already degrades gracefully on unauthored keys, so each tier enriches shipped features as it lands.

### Phase 3a — Cross-chart engine primitives (build first)

- [x] Cross-chart aspect detection: aspects between chart A's placements and chart B's placements (full A×B grid, same-planet pairs included — e.g. transit Sun conjunct natal Sun) — new `packages/astro-core/src/crossAspects.ts`, reusing `separation` (`src/angles.ts`) and `maxOrb` (`src/aspects.ts`) — *`MAJOR_ASPECTS` exported from `aspects.ts` and shared rather than duplicated*
- [x] `CrossAspect` output type distinguishing which chart each body belongs to (`a` = moving/partner chart, `b` = natal/reference chart) — `src/types.ts`; no `ChartSnapshot` change (cross-chart results are never stored; schemaVersion stays 1)
- [x] Tighter transit orb defaults (transits read best near 3° luminaries / 2° default), expressed as the existing `OrbConfig` — `DEFAULT_TRANSIT_ORBS` in `src/types.ts`; synastry keeps the natal defaults
- [x] Lean positions-at-instant helper: placements (longitude, sign, degree-in-sign, retrograde, `house: null`) for any UTC instant, without houses/angles — new `src/positions.ts` wrapping the existing ephemeris interface (`src/ephemeris/`), exported from `src/index.ts`
- [x] Cross-chart house overlay: locate chart B's planets in chart A's houses from A's stored cusps — reuse the already-exported `houseOf(longitude, cusps)` (`src/houses.ts`); null when A is solar; serves both "her Sun in his 7th" (synastry) and "transiting Saturn in the natal 4th" (transits) — *direction-agnostic `overlayHouses(placements, cusps)` in `positions.ts`, sidestepping the a/b letter ambiguity; callers pass the housed chart's cusps*
- [x] **Cross-aspect tests**: A×B grid completeness vs. the self-join case, same-planet conjunction, orb-boundary inclusion/exclusion under both orb configs, determinism — `packages/astro-core/test/crossAspects.test.ts` — *6 tests incl. luminary orb routing*
- [x] **Positions golden test**: placements at fixed reference instants matching the existing golden fixtures; retrograde flag at a known station date — extend `test/golden.test.ts` — *equinox + J2000 fixtures, 2023 Mercury station windows, exact-longitude agreement with `buildChart`*

### Phase 3b — Daily transits dashboard

- [x] Transit read service: load the profile's stored natal snapshot, compute current placements (`positions.ts`) and cross aspects vs. natal — new `lib/transits.ts`; **never persisted** (PRD §9: the only ongoing computation; the write-once guard in `lib/db.ts` stays untouched — transits are ephemeral reads, not snapshots) — *pure `computeTransits` + Prisma wrapper `getTransitView`; always reads the **latest** snapshot (history views get a note instead of per-version transits)*
- [x] `GET /api/transits/[id]`: transiting placements + cross aspects + natal-house overlay + `computedAt`/engine metadata; zod-validated optional `at` ISO instant (defaults to now; testing hook, not exposed in UI) — `app/api/transits/[id]/route.ts`, schema in `lib/validation.ts`; served `Cache-Control: no-store` (server-side keeps the single source of truth per PRD §4.2; no offline transits is the accepted tradeoff — `public/sw.js` already never intercepts `/api/*`; client-side compute re-evaluated at the Phase 4 gate) — *`no-store` on every response incl. errors*
- [x] Transits tab (Chart / Reading / Numerology / Mazal / **Transits** / Details) — `components/profile/ProfileTabs.tsx` + new `components/transits/TransitsPanel.tsx`: positions table with retrograde markers, cross-aspect list sorted by orb tightness, "as of" timestamp with refresh (today-only UI) — *lazy first fetch on tab open; natal-house column from the overlay*
- [x] Transit wheel overlay: natal wheel with transiting glyphs on an outer ring and inter-ring cross-aspect chords — extend `components/chart/geometry.ts` (second glyph ring, per-ring `spreadClusters`, inter-ring chord radii); glyph swap point stays `glyphs.tsx` — *additive `layoutTransitWheel` (shrunk base + translate offset, `layoutWheel` untouched); dashed chords band-edge→hub in `TransitWheel.tsx`; static `<title>` tooltips, hover/pin parity deferred to the 3c bi-wheel; `ASPECT_COLOR` moved to `glyphs.tsx` for sharing*
- [x] Unknown/approx-time handling: suppress the natal-house overlay for solar charts; badge cross aspects to the natal Moon when its degree is uncertain — reuse snapshot `uncertainties` + the existing uncertainty badge component
- [x] Offline notice: a clear "transits need a live connection" state in the tab instead of a broken fetch — guard in `TransitsPanel` — *pre-fetch `navigator.onLine` check, network-error fallback, auto-retry on the `online` event*
- [x] Document the ephemeral-read data flow in `ARCHITECTURE.md` §4 (compute-once applies to natal snapshots; transits recompute on every read, never stored)
- [x] **Tests**: `lib/transits.test.ts` with fixed `at` instants (deterministic fixtures); zod rejection of malformed `at`; `no-store` header on the route; outer-ring cases in `components/chart/geometry.test.ts` — *route handler unit-tested offline via `vi.mock` of the service (`lib/transits.route.test.ts`); suite at 256*

### Phase 3c — Synastry

- [x] Synastry read service: load two profiles' current astro snapshots, compute cross aspects (natal orbs) + mutual house overlays (A-in-B's houses and B-in-A's, each side skipped when solar) — new `lib/synastry.ts`; ephemeral read over two write-once snapshots — **no schema change, nothing persisted** (deterministic recompute from immutable inputs) — *pure `computeSynastry` + one-query-per-side `getSynastryView`; convention fixed as `CrossAspect.a` = person A's planet everywhere outside geometry internals; stored placements are stripped of their own houses before `overlayHouses` so a solar other-side yields null instead of leaking them*
- [x] Pair selection: pick two profiles from the existing list on `/` (`app/page.tsx`), landing on a shareable server-rendered `app/synastry/page.tsx` (`?a=<id>&b=<id>`, params zod-validated); the page calls `lib/synastry.ts` directly — no new API route needed — *`synastryQuerySchema` (coerced positive ints, `a !== b` refine) → `notFound()`; `PairPicker` client island shown at ≥2 profiles; page adds per-side mutual house-overlay tables*
- [x] Bi-wheel: person A's houses + planets on the inner wheel, person B's planets on an outer ring, cross-aspect chords between rings — reuse the 3b two-ring geometry in `components/chart/geometry.ts`; new `components/synastry/BiWheel.tsx` with hover/tap/focus parity with the existing placement detail card — *thin `layoutBiWheel` swaps a/b into and back out of `layoutTransitWheel` so chords keep the synastry convention; full ChartWheel-parity interactivity on both rings and chords (hover previews, click/Enter/Space pins, invisible hit-lines, dimming) — the parity `TransitWheel` deferred here; side-aware `SynastrySelection` + `SynastryDetail` card with overlay-house line*
- [x] Cross-aspect list view: sorted by orb, grouped by planet pair, glyph labels — `components/synastry/` — *`CrossAspectList` groups by canonical unordered pair (so Venus–Mars holds both directions), groups ordered by tightest orb; renders `synastry_aspect` prose per row when authored*
- [x] Solar/uncertain handling: sign-and-aspect-only synastry when either chart lacks houses, with the standard notice; uncertainty badges carried through per side — *page-level solar notice naming the side(s), overlay table/column suppressed per direction, `SolarChartNotice` under a solar inner wheel; per-side moon uncertainty dots (wheel), badges (list, detail, header)*
- [x] Recognize `synastry_aspect` as a loader category (`CONTENT_CATEGORIES` in `lib/content.ts`) so entries can land incrementally; authoring deferred to the optional 3d tier — until then the aspect list ships without prose (existing `missingKeys` degradation) — *plus `synastryAspectKey` (pair ordered by `PLANETS` index; slash-segmented key, so the Tier 6 file is authored `synastry_aspect/sun-mars-square.md`)*
- [x] **Tests**: `lib/synastry.test.ts` fixtures (two known charts → expected cross aspects), solar-side suppression, param validation; bi-wheel ring/chord cases in `geometry.test.ts` — *20 new tests (16 service/validation incl. the own-house-leak regression and orb-config check, 4 bi-wheel geometry pinning the double-swap); suite at 276; clean prod build; served smoke test on the dev server confirmed the page, solar notice, and 404-UI paths with a throwaway second profile*

### Phase 3d — Interpretation matrix (staged tiers — parallelizable with 3a–3c)

- [x] **Tier 1 — modality dominance (3 entries)**: `content/en/modality_dominance/`; add `modalityDominance()` beside `elementDominance()` (`SIGN_MODALITIES` already defined in `lib/dominance.ts`); extend `lib/synthesis.ts` to the full element × modality × Life Path intersection (PRD §3.4) and add the modality slot to `resolveReading` (`lib/content.ts`) — smallest tier, unlocks the deferred synthesis path — *shared `dominanceBy` helper (Sun→Moon→canonical tie-break for both); modality essence woven into the synthesis opening via `MODALITY_VOICE`; modality chip row in the Reading tab*
- [x] **Tier 2 — natal aspects (49 entries)**: `content/en/aspect/` keyed `<planetA>-<planetB>-<type>.md` (canonical pair order = `PLANETS` order in `packages/astro-core/src/types.ts`); wire the chart's tightest **5** aspects into `resolveReading` as new sections — *49 not 50: Sun–Mercury (max elongation ~28°) and Sun–Venus (~47°) only conjunct, Mercury–Venus (~76°) only conjunction+sextile at natal orbs, so the 11 unreachable combos were replaced by full Sun–Jupiter and Sun–Saturn sets; `natalAspectKey` in `lib/content.ts`; `resolveReading` now takes a `WheelChart`; orb suppressed in solar-chart source lines; grouped section headings in `ReadingPanel`*
- [x] **Tier 3 — planet_in_sign fill-in (96 new entries)**: Mercury/Venus/Mars wired into the reading as personal-planet sections; Jupiter/Saturn and outers authored (outers with generational framing) but not rendered in the reading — `content/en/planet_in_sign/` now covers all 10 planets × 12 signs
- [x] **Tier 4 — planet_in_house (120 entries)**: `content/en/planet_in_house/<planet>-<house>.md`; resolved for the five personal planets behind the per-placement house-null guard (solar charts never attempt the keys); Jupiter–Pluto entries authored for future surfaces
- [x] **Tier 5 — numerology completion (24 entries — the "26" here was a miscount, 12 numbers × 2 categories)**: `content/en/destiny/` and `content/en/soul_urge/` (1–9, 11, 22, 33 each); surfaced in the Reading tab (new `destiny`/`soul_urge` sections via the extended `NumeroReadingInput` + `toNumeroReadingInput`) and the Numerology panel (server-resolved `numeroProse` prop — the content loader is server-only)
- [x] **Tier 6 — `synastry_aspect` starter set (12 entries)**: Sun/Moon/Venus/Mars pair combinations incl. same-planet Sun–Sun and Moon–Moon conjunctions (valid in synastry) — pure authoring; the 3c render path lights up as-is
- [x] Extend `lib/content.lint.test.ts` coverage expectations tier-by-tier as each tier lands (coverage, format, size band, per `content/README.md`) — *358-entry total, per-category coverage loops, canonical aspect-pair-order check, essence check extended to `modality_dominance`*
- [x] `CONTENT_VERSION` (`lib/versions.ts`): bump **only** when existing entries are rewritten — new entries alone never bump, per the documented contract; the existing provenance note handles snapshot drift — *unchanged at "1"*

### Phase 3e — AI transit reading & period forecasts

- [x] `forecast` table: AI prose cached per `(profile, mode, kind, period_start)` — the unique key is the LLM cost control (generate once per period, discard to regenerate); `natal_version` recorded as a staleness flag, never part of the key — `prisma/migrations/*_add_forecast`
- [x] Location-free Hebrew date helpers: `civilToHebrewDateParts` (daytime mapping, no sunset) + `hebrewMonthStartCivil` — `packages/hebrew-core/src/calendar.ts`
- [x] Pure period engine `lib/forecast.ts`: `periodFor` (Sunday weeks both modes; civil vs. Hebrew months), `computeWesternPeriodSummary` (daily noon sampling → Moon spans, ingresses/stations ±1 day, min-orb aspect windows with outer-planet priority), `computeHebrewPeriodSummary` (per-day day planets + date gematria, month mazal rows incl. mid-period boundaries)
- [x] Prompt renderers (`renderWesternPeriodData` / `renderHebrewPeriodData` in `lib/promptData.ts`) and builders (`buildWesternForecastPrompt` / `buildHebrewForecastPrompt` in `lib/llm.ts`) — word targets 250/350/450 by kind; natal `aspect` entries reused as archetypal pair context (a dedicated `transit_aspect` category is deferred authoring work); privacy contract holds (no birth instant/coordinates in prompts)
- [x] `GET/POST/DELETE /api/profiles/[id]/forecast` (`?mode=&kind=&date?=`, `date` a testing hook) + `lib/forecastStore.ts`; 409 `llm_disabled`/`already_generated`/`no_hebrew_snapshot`, 502 `llm_unavailable`, P2002 concurrency race → 409
- [x] Forecast tab (Day/Week/Month switcher × Western/Hebrew cards) — `components/forecast/`; the western daily card doubles as the Transits-tab "AI reading of today's transits" (same cached row); stale forecasts show a version note with discard-to-regenerate
- [x] **Tests**: `lib/forecast.test.ts` (periods incl. Adar I/II and Hebrew month boundaries; ingress/station/aspect-window detection), `packages/hebrew-core/test/calendar.test.ts`, renderer/builder additions in `lib/promptData.test.ts` + `lib/llm.test.ts` (incl. no-birth-data assertions), `lib/forecast.route.test.ts` (full 409/502 matrix) — suite at 398

## Phase 4 (public deployment gate — deferred)

- Authentication / user accounts
- License review before distribution: `@hebcal/core` (`hebrew-core`) is GPL-2.0 — fine unhosted, re-evaluate here
- Hosted MySQL/Postgres migration
- Privacy hardening: encryption at rest, retention policy, GDPR-style deletion
- Rate limiting; re-evaluate client-side vs. server-side calculation for static hosting

## Explicitly out of scope (PRD §7)

React Native / native apps · cloud hosting/CDN · minor aspects, asteroids, fixed stars, progressions · UI localization (content structure must not preclude it)
