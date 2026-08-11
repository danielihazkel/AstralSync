# ✶ AstralSync

Natal charts and numerology — **computed once, stored forever, fully offline**.

AstralSync is a local-first web app that computes a natal (birth) chart and a
numerology profile from your birth data, stores the result as an immutable
snapshot in your own database, and never talks to an external service. It
installs as a PWA, and charts you have viewed remain readable with no network
at all.

Everything runs on your machine: the ephemeris math (`astronomy-engine`), city
search (imported GeoNames data), timezone resolution (`geo-tz` + the IANA
database), and the interpretation library (Markdown files in this repo). The
only optional network feature is the AI reading synthesis, which is **off by
default** and can point at a local Ollama server.

## Requirements

- **Node.js 22+** (the maintenance scripts run TypeScript directly with `node`)
- **MySQL 8** running locally
- npm (the repo uses npm workspaces)

## First-time setup

```bash
npm install

# 1. Point the app at your MySQL server
cp .env.example .env          # then edit DATABASE_URL

# 2. Create the database schema
npm run db:migrate

# 3. Import the offline city database (~34k cities, one-time, idempotent)
npm run geo:import
```

`geo:import` downloads the GeoNames `cities15000` dataset (CC-BY) once and
loads it into the `geo_city` table — after that, city search is fully offline.

## Running

| Command | What it does |
|---|---|
| `npm run dev` | Development server at `http://localhost:3000` (service worker disabled) |
| `npm run build` && `npm start` | Production server — use this to test PWA install/offline |
| `npm test` | Full Vitest suite (engines, timezone edge cases, UI geometry, content lint, PWA) |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run geo:import` | (Re-)import GeoNames cities; already-imported rows are skipped |
| `npm run icons:generate` | Re-rasterize `app/icon.svg` into the committed PNG icons (only needed if the SVG changes) |

## Using the app

### Creating a profile (onboarding)

**New profile** in the header walks you through six steps:

1. **Birth date** — pre-1970 dates get a warning that historical UTC offsets
   are less reliable, with a nudge toward the manual override below.
2. **Birth time** — *exact*, *approximate*, or *unknown*. Approximate time
   flags time-sensitive placements with uncertainty badges; unknown time
   produces a **solar chart** (planets in signs + aspects only — the app
   explains exactly what is suppressed and why).
3. **Birth place** — offline prefix search over the imported city database;
   results are population-ranked and carry their IANA timezone.
4. **UTC offset review** — the app resolves the historical offset for your
   birth moment (DST gaps and folds handled); you can override it manually,
   and the override is recorded on the snapshot.
5. **Full birth name** (optional) — powers Destiny/Expression and Soul Urge
   numbers. Latin names use the Pythagorean system; Hebrew names use standard
   gematria (final forms handled); other scripts are asked for a Latin
   transliteration.
6. **Review & create** — the chart is computed **exactly once**, here.

### Viewing a profile

The home page lists all profiles. Each profile has four tabs:

- **Chart** — an interactive SVG wheel: 12 houses, zodiac signs, planetary
  glyphs, aspect lines, retrograde markers. Hover previews; click/tap/Enter
  pins a detail card. The Big Three (Sun, Moon, Rising) sit above the wheel.
  A **house system selector** (Placidus / Whole Sign / Equal) recomputes the
  chart as a *new snapshot version* — Placidus falls back to Whole Sign
  automatically at extreme latitudes.
- **Reading** — interpretation text assembled from the in-repo content
  library (Sun/Moon/Ascendant signs, Life Path, dominant element), plus the
  optional AI reading (see below).
- **Numerology** — Life Path, Destiny, and Soul Urge numbers with the full
  letter-by-letter derivation ("show your work"), master numbers 11/22/33
  never reduced.
- **Details** — birth data, engine metadata, version history, export, delete.

### Snapshots, versions, and edits

Chart data is **write-once**. Editing birth data (or switching house system)
creates a new snapshot version; old versions stay readable forever via the
version history on the Details tab (`?version=N`). Renaming a profile or its
city label is presentational and does not recompute anything.

- **Export** — Details tab → Export downloads the full profile as JSON: every
  snapshot version, every reading.
- **Delete** — Details tab → inline-confirmed **hard delete**; the profile and
  all snapshots/readings are removed at the database level. Export first if
  you want a record.

### AI reading synthesis (optional)

`.env.example` ships preconfigured for OpenAI (`READING_LLM=api`,
`gpt-4o-mini`) — paste your OpenAI API key into `READING_LLM_API_KEY` to
enable it; without a key the feature stays off. You can also point
`READING_LLM` at `ollama` (local) or any other OpenAI-compatible endpoint
via `READING_LLM_BASE_URL`. When enabled, the Reading tab offers a
one-click generation — **once per snapshot**, stored permanently, enforced by
a database constraint. LLM failures never degrade the rest of the app.

### Installing as a PWA / offline use

Run the production server (`npm run build && npm start`), open it in Chrome or
Edge, and install via the icon in the address bar (Android: "Add to Home
screen"). Once installed:

- Every profile page you have **visited** reloads offline, including old
  `?version=N` history views.
- Never-visited pages show a branded offline notice instead of a browser
  error.
- Mutations (creating/editing profiles, city search) need the server and fail
  with a clean error offline.

The service worker registers only in production builds; `next dev` actively
unregisters it so it can never interfere with development. To test the PWA in
dev over HTTPS (e.g. for iOS), set `NEXT_PUBLIC_SW_DEV=1` and run
`next dev --experimental-https`.

## Authoring interpretation content

Interpretation entries are Markdown files under `content/en/`, keyed by their
path (e.g. `sun-in/leo.md`). See `content/README.md` for the format, and note
the lint suite in `lib/content.lint.test.ts` enforces coverage and format.
Bump `CONTENT_VERSION` in `lib/versions.ts` when the library changes
meaningfully — snapshots record the version they were rendered against and
the UI notes when content has moved on since.

## Project layout

```
app/                  Next.js App Router pages + API routes
components/           React components (onboarding wizard, chart wheel, profile tabs)
content/en/           Interpretation content library (Markdown)
lib/                  App services: snapshots, timezone, content, synthesis, LLM, PWA
packages/astro-core/  Framework-free chart engine (ephemeris, houses, aspects)
packages/numero-core/ Framework-free numerology engine (Pythagorean, gematria)
prisma/               Schema + migrations (write-once snapshot model)
public/sw.js          Hand-written service worker (offline chart viewing)
scripts/              One-time maintenance: GeoNames import, icon generation
```

Deeper docs: `ARCHITECTURE.md` (technical design), `AstralSync_PRD_v2.md`
(product spec), `TODO.md` (build log and roadmap).
