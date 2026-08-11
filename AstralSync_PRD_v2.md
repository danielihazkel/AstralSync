# Product Requirements Document (PRD): AstralSync

**Document Version:** 2.0
**Product Name:** AstralSync (placeholder)
**License Model:** Free & Open Source (FOSS)
**Deployment Target (v1):** Local-first — runs entirely on the developer's own machine
**Total Running Cost Target:** $0

---

## 1. Executive Summary

**Vision:** Provide mathematically precise astrological natal charts and rule-based numerological profiles, bridging astronomical calculation with clear, actionable personal insight — with zero recurring cost, no external paid APIs, and full data ownership by the user.

**Target Audience (v1):** The developer and a small circle of local users (family, friends). The architecture must remain simple enough for one person to build and maintain, while leaving a clean path to public web deployment later.

**Value Proposition:** A single unified tool that generates instant, accurate natal charts and numerology profiles offline, without ephemeris tables, paid geocoding services, or cloud dependencies.

**Key changes from v1.0:**

| Area | v1.0 | v2.0 |
| --- | --- | --- |
| Architecture | Microservices (Spring Boot gateway + ephemeris service) | Single Next.js monolith |
| Ephemeris | Swiss Ephemeris (AGPL/commercial license issue) | astronomy-engine (MIT) by default; optional Swiss Ephemeris (AGPL, acceptable since project is FOSS) |
| Geocoding | Google Maps / Mapbox (paid) | Offline GeoNames city database + geo-tz (free, no API) |
| Database | PostgreSQL | MySQL (already installed locally) |
| Mobile | React Native app | PWA (installable web app); native deferred |
| Interpretations | Unspecified | Explicit content strategy (template library, optional cached LLM) |
| Birth time | Required | Optional, with solar-chart fallback |
| Numerology alphabet | Latin-only Pythagorean | Multi-script support incl. Hebrew (gematria variant) |

---

## 2. Objectives & Success Metrics

Since v1 runs locally, the KPIs shift from scale metrics to correctness and usability:

| Metric | Target | Rationale |
| --- | --- | --- |
| Chart calculation accuracy | Planetary longitudes within 1 arcminute of Swiss Ephemeris reference values | Verified against known test charts (see §8, Testing) |
| Chart generation latency | < 200ms end-to-end on local hardware | Calculation is milliseconds of math; anything slower indicates an architectural mistake |
| Onboarding completion | Users with unknown birth time can still complete onboarding and get a valid (solar) chart | Prevents the #1 real-world drop-off cause |
| Recomputation | Zero — a natal chart is computed exactly once and stored as an immutable snapshot | Performance strategy is caching, not optimization |

---

## 3. Functional Requirements (User Stories)

### 3.1 Onboarding & Data Ingestion

- **As a user**, I input my birth date, birth time (optional), and birth city so the system can compute my chart.
- **As a user**, if I don't know my exact birth time, I can choose:
  - "Unknown time" → the system generates a **solar chart** (planets in signs and aspects only; Ascendant, Moon degree precision, and houses are suppressed with a clear explanation), or
  - "Approximate time" → the system flags time-sensitive placements (Ascendant, Moon sign near a cusp, house placements) as uncertain.
- **As a user**, I select my birth city from an **offline city search** (GeoNames dataset) which resolves latitude/longitude locally, with no external API call.
- **As a user**, I can see and manually correct the resolved UTC offset for my birth moment, because historical timezone/DST data (especially pre-1970) is imperfect.
- **As a user**, I am not required to provide my real name unless I want numerology name-based numbers.

### 3.2 Astrological Engine

- **As a user**, I view a 2D circular natal chart (SVG wheel): 12 houses, zodiac signs, planetary placements, and aspect lines.
- **As a user**, I see my "Big Three" (Sun, Moon, Rising) prominently, with Rising omitted gracefully when birth time is unknown.
- **As a user**, I see major aspects (conjunction, opposition, trine, square, sextile) with configurable orbs (sane defaults: 8° luminaries, 6° planets, tighter for minor aspects).
- **As a user**, I can choose the house system (default: Placidus; also Whole Sign and Equal House — Whole Sign is the automatic fallback for high latitudes where Placidus degenerates).
- **As a user**, I see retrograde markers on applicable planets.

### 3.3 Numerological Engine

- **As a user**, the app calculates my **Life Path Number** from my birth date (with correct master number handling: 11, 22, 33 are not reduced).
- **As a user**, the app calculates my **Destiny/Expression Number** and **Soul Urge Number** from my full birth name.
- **As a user**, if my name is not in Latin script, I can either:
  - provide a transliteration (the app suggests one), which is fed to the Pythagorean system, or
  - for Hebrew names, use the **gematria system** natively (standard letter values, final forms handled), which is both more authentic and avoids lossy transliteration.
- **As a user**, I can see *how* each number was derived (letter-by-letter breakdown), which builds trust in the calculation.

### 3.4 Insights & Recommendations

- **As a user**, I receive synthesized readings based on the intersection of dominant astrological elements/modalities and my Life Path number.
- **System requirement:** interpretation text comes from a versioned, open **content library** (Markdown/JSON templates keyed by placement — see §5). Optionally, an LLM can generate a personalized synthesis **once per chart**, stored permanently with the snapshot (never regenerated per view). LLM use is optional and off by default so the core product stays fully free and offline.

### 3.5 Multi-Profile Support

- **As a user**, I can save multiple people's charts (self, family, friends) under named profiles, since a locally run tool is naturally used for more than one person. This also lays the groundwork for Phase 2 synastry.

---

## 4. Non-Functional Requirements & Architecture

### 4.1 Architecture: Single Monolith

One **Next.js** application (App Router) containing UI, API routes, and all calculation logic in-process. Rationale:

- Natal chart computation is a few milliseconds of arithmetic — there is no "heavy computational load" justifying a separate service.
- No microservices, no API gateway, no Java runtime. One `npm run dev` (or one Docker container) starts everything.
- Calculation code lives in a **standalone, framework-free TypeScript package** (`packages/astro-core`, `packages/numero-core`) inside the repo. This keeps the math testable in isolation and portable if the architecture ever changes.

### 4.2 Ephemeris

- **Default: `astronomy-engine` (MIT license).** Pure TypeScript/JS, no data files, no native compilation, accuracy ~1 arcminute for planetary positions — an order of magnitude better than astrology requires.
- **Optional alternative: Swiss Ephemeris via `swisseph` bindings.** Since the project is FOSS, the AGPL license is acceptable. Use only if sub-arcminute precision or exotic points (e.g., specific asteroids) are wanted. Not required for v1.
- The ephemeris is wrapped behind a thin internal interface so the backend can swap implementations without touching the rest of the code.
- Computed in-process on the server side (API route). Because the engine is pure JS, client-side calculation is possible later for a fully static deployment, but v1 keeps it server-side for a single source of truth.

### 4.3 Geolocation & Timezone (fully offline)

- **City resolution:** GeoNames `cities15000` dataset (free download, ~30k cities worldwide with lat/lng, population, country), imported once into MySQL with a simple name index. Search is a local `LIKE`/prefix query — no external API, no rate limits, no cost.
- **Timezone resolution:** `geo-tz` (or `tz-lookup`) maps lat/lng → IANA timezone offline; the IANA tz database (bundled with Node/`@date-fns/tz` or `luxon`) then resolves the historical UTC offset including DST for the birth moment.
- **Known limitation (must be surfaced in UI):** historical timezone data before ~1970 contains inaccuracies in every available database. The onboarding flow therefore always shows the resolved offset and allows manual override (§3.1).

### 4.4 Database: MySQL (existing local instance)

- Uses the developer's already-installed local **MySQL** server. Access via **Prisma** or **Drizzle ORM** (both support MySQL first-class); the schema is defined in migrations so it can later move to hosted MySQL (PlanetScale) or Postgres with minimal friction.
- No exotic indexing requirements: the access pattern is "fetch profile and its snapshots by ID." Standard primary/foreign keys suffice. The v1.0 requirement for B-tree indexes on coordinates and birth dates is dropped as unnecessary.
- **Immutability rule:** natal chart and numerology snapshots are write-once. Editing birth data creates a *new* snapshot version rather than mutating the old one (preserves history, simplifies caching to "compute once, read forever").

### 4.5 Frontend & Packaging

- **Next.js + SVG** for the chart wheel (rendered from the snapshot JSON; interactive hover/tap for placements and aspects).
- **PWA** manifest + service worker so the app is installable on phone/desktop and previously loaded charts are viewable offline. **React Native is removed from scope** — it doubles the work for zero v1 value; revisit only if the project goes public and retention justifies it.
- Optional `docker-compose.yml` (app + MySQL) for one-command startup and easy migration to any machine.

### 4.6 Privacy & Data Ownership

- Exact birth date + time + city is sensitive, near-identifying personal data. v1 stores everything **only on the local machine**.
- Real names are optional and used solely for numerology; profiles can use nicknames.
- Every profile supports full export (JSON) and hard delete.
- If the app is ever deployed publicly, this section must be revisited (encryption at rest, retention policy, GDPR-style deletion) — flagged as a Phase 3 gate, not a v1 task.

---

## 5. Interpretation Content Strategy

The calculation math is a solved problem; the interpretation text is the actual product. The PRD therefore treats content as a first-class deliverable:

- **Format:** open content library in the repo — Markdown/JSON files keyed by placement:
  - `planet_in_sign` (10 planets × 12 signs = 120 entries)
  - `planet_in_house` (10 × 12 = 120 entries)
  - `aspect` (per planet-pair per aspect type — start with the ~50 most significant)
  - `ascendant_sign` (12), `element_dominance` (4), `modality_dominance` (3)
  - `life_path` (1–9, 11, 22, 33), `destiny`, `soul_urge`
- **Sourcing:** original text written for the project (public-domain astrology literature may inform it, but text is authored, not copied). Content is versioned; snapshots record which content version rendered them.
- **v1 scope cut:** ship "Big Three" + Life Path + element dominance interpretations first (~40 entries). The full matrix fills in incrementally — the schema supports it from day one.
- **Optional LLM synthesis:** a single "synthesized reading" combining all placements can be generated by an LLM (local model via Ollama, or an API if the developer chooses), executed **once per snapshot** and stored. Off by default; the app is fully functional without it.

---

## 6. High-Level Data Model (MySQL)

```
profile
  id (PK), display_name, full_birth_name (nullable), name_script (latin|hebrew|other),
  birth_date, birth_time (nullable), time_certainty (exact|approx|unknown),
  birth_city_geoname_id (FK), birth_lat, birth_lng, tz_iana, utc_offset_minutes,
  offset_overridden (bool), created_at

geo_city            -- imported once from GeoNames
  geoname_id (PK), name, ascii_name, country_code, admin1, lat, lng, population

astro_snapshot      -- write-once
  id (PK), profile_id (FK), version, house_system, is_solar_chart (bool),
  sun_sign, moon_sign, ascendant (nullable),
  placements_json    -- per-planet: longitude, sign, house, retrograde
  aspects_json       -- pairs, type, orb
  engine (astronomy-engine|swisseph), engine_version, content_version, created_at

numero_snapshot     -- write-once
  id (PK), profile_id (FK), version, system (pythagorean|gematria),
  life_path_int, destiny_int, soul_urge_int, is_master_lp (bool),
  derivation_json    -- letter-by-letter breakdown
  created_at

reading             -- optional LLM synthesis, generated once
  id (PK), astro_snapshot_id (FK), numero_snapshot_id (FK),
  body_md, generator (template|llm), model_name (nullable), created_at
```

---

## 7. Explicit v1 Scope Cuts

Out of scope for v1 (documented so they're decisions, not omissions):

- React Native / native mobile apps (PWA covers it)
- User accounts / authentication (single local machine, multi-profile instead)
- Cloud hosting, scaling, CDN (Phase 3)
- Synastry, transits (Phase 2)
- Minor aspects, asteroids, fixed stars, progressions
- Localization of UI (content library structure should not preclude it)

---

## 8. Testing & Validation Requirements

- **Golden chart tests:** the `astro-core` package must pass automated tests against 10–15 reference charts with known published placements (e.g., well-documented public figures' charts and Swiss Ephemeris reference output), asserting sign, house, and longitude within tolerance.
- **Edge cases required in the test suite:** birth near midnight across a DST transition; high-latitude birth (Placidus fallback); planet stationing (retrograde flag); sign-cusp Moon with approximate time; pre-1970 birth date offset warning.
- **Numerology tests:** master numbers 11/22/33 preservation, Y-as-vowel rules documented and tested, Hebrew final letter forms in gematria.

---

## 9. Roadmap

**Phase 1 (v1 — local):** Onboarding with offline geocoding → astro + numero engines → SVG wheel → Big-Three/Life-Path readings → multi-profile storage in MySQL → PWA packaging.

**Phase 2:** Synastry (dual-chart overlay from two stored profiles), daily transits dashboard (current positions vs. natal snapshot — the only feature that requires ongoing computation), full interpretation matrix.

**Phase 3 (public deployment gate):** authentication, hosted MySQL/Postgres, privacy hardening, rate limiting, and a re-evaluation of client-side vs. server-side calculation for a static/free hosting model.

---

## 10. Recommended Next Specification

Break down **`astro-core` (the ephemeris/chart calculation module)** first: input contract (UTC instant + coordinates + house system), output snapshot JSON schema, house cusp math, aspect/orb rules, and the golden-chart test fixtures. Every other component consumes its output, so its interface stability determines the whole build.
