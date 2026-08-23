# ✶ AstralSync

Natal charts, Hebrew astrology, and numerology — **computed once, stored
forever, fully offline**.

AstralSync is a local-first web app that computes a natal (birth) chart, a
Mazal (Hebrew astrology) profile, and a numerology profile from your birth
data, stores the result as an immutable snapshot in your own database, and
never talks to an external service. On top of those stored snapshots it
derives everything time-based — transits, returns, progressions, forecasts,
synastry — fresh on every read. It installs as a PWA, and charts you have
viewed remain readable with no network at all.

Everything runs on your machine: the ephemeris math (`astronomy-engine`), the
Hebrew calendar (`@hebcal/core`), city search (imported GeoNames data),
timezone resolution (`geo-tz` + the IANA database), and the interpretation
library (1234 Markdown files in this repo). The only optional network feature
is the AI synthesis layer, which is **off by default** and can point at a
local Ollama server.

## Requirements

- **Node.js 20.9+** (matches `engines` in package.json)
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
| `npm run lint` / `npm run typecheck` | ESLint (with jsx-a11y) / native TypeScript check |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run geo:import` | (Re-)import GeoNames cities; already-imported rows are skipped |
| `npm run icons:generate` | Re-rasterize `app/icon.svg` into the committed PNG icons (only needed if the SVG changes) |

## Using the app

### The home page

The **Today dashboard** at the top is computed entirely in your browser (it
works offline and survives midnight): current Moon sign, phase and
void-of-course status, the Hebrew date and month mazal, the current planetary
hour (set a home location once), planets stationing this week, eclipses
peaking in the next five weeks, and the tightest live transits to each saved
profile. Below it: the profile list (search + sort) and the synastry pair
picker.

### Creating a profile (onboarding)

**New profile** in the header walks you through six steps:

1. **Birth date** — pre-1970 dates get a warning that historical UTC offsets
   are less reliable, with a nudge toward the manual override below.
2. **Birth time** — *exact*, *approximate*, or *unknown*. Approximate time
   flags time-sensitive placements with uncertainty badges; unknown time
   produces a **solar chart** (planets in signs + aspects only — the app
   explains exactly what is suppressed and why).
3. **Birth place** — offline prefix search over the imported city database;
   results are population-ranked and carry their IANA timezone. Coordinates
   can also be entered manually.
4. **UTC offset review** — the app resolves the historical offset for your
   birth moment (DST gaps and folds handled); you can override it manually,
   and the override is recorded on the snapshot.
5. **Birth names** (optional) — a Latin/transliterated name powers the
   Pythagorean Destiny and Soul Urge numbers; a Hebrew name powers gematria
   and the Mazal reading. Either, both, or neither.
6. **Review & create** — the chart is computed **exactly once**, here.

### Viewing a profile — nine tabs

- **Chart** — an interactive SVG wheel: houses, signs, planetary glyphs,
  aspect chords, retrograde markers, plus the calculated points (lunar nodes
  true/mean, Lilith, Part of Fortune) and an optional dashed overlay of tight
  minor aspects. Detected **chart patterns** (stelliums, grand trines,
  t-squares, grand crosses, yods) are listed under the wheel. A **Wheel |
  Table** switch renders the same data as accessible placement and aspect
  tables. The wheel downloads as SVG or PNG — and shares directly on devices
  where the Web Share API accepts files.
- **Reading** — interpretation assembled from the in-repo content library:
  all ten planets in sign and house (the outer planets grouped as the
  generational backdrop), angles, the tightest aspects, patterns, dominance,
  retrogrades, points, and numerology — plus the optional stored AI
  synthesis.
- **Numerology** — Life Path, Destiny, and Soul Urge with the full
  letter-by-letter derivation ("show your work"); master numbers 11/22/33 are
  never reduced.
- **Mazal** — the Hebrew layer: sunset-adjusted Hebrew birth date, month
  mazal, day and hour planets (Shabbat 156a), Sefer Yetzirah
  correspondences, date and name gematria — with RTL Hebrew sources and an
  optional English AI synthesis.
- **Transits** — live positions against the natal chart with per-aspect
  prose, a transit bi-wheel, and adjustable orbs (see settings below); a
  **Calendar** view lists exact perfection dates, ingresses, stations, and
  eclipses over any range up to three months, exportable as an `.ics` file.
- **Cycles** — the annual profection (year lord), secondary progressions
  (against the natal wheel or as a standalone progressed chart with
  progressed houses), the current lunar and solar return charts, and
  **Jupiter & Saturn returns** (last/next exact dates, retrograde multi-pass
  notes, the return chart).
- **Forecast** — cached AI readings for the day / week / month, in a Western
  mode (Moon spans, ingresses, stations, eclipses, aspect windows) and a
  Hebrew mode (day planets, month mazalot, gematria).
- **Journal** — dated notes with mood and free-form tags, each pinned to a
  sky snapshot captured at save time ("what was hitting your chart"),
  filterable by transiting planet or aspect — plus an **Insights** view that
  correlates your entries against a long-run baseline with honest minimum
  sample sizes.
- **Details** — birth data, engine metadata, version history, house-system
  selector, reading coverage (which interpretation keys this chart wants but
  the library hasn't authored), JSON export, the printable report, and
  delete.

There is also a per-profile **chat** ("ask about your chart") when the AI
layer is enabled — ephemeral, rate-limited, never stored.

### Synastry

Pick any two profiles (home page or `/synastry`): a bi-wheel with cross
aspects at natal orbs, per-pair interpretation prose, mutual house-overlay
tables, a midpoint composite chart, and a cached AI relationship reading.
The page prints cleanly — use the print button to save it as a PDF.

### The Sky Calendar and day almanac

`/calendar` is a client-computed (offline-capable) month grid of the sky
itself: the Moon's sign and phase each day, full void-of-course windows,
sign ingresses, and eclipses. A second view is the **electional day picker**:
pick an intent (start a venture, sign, launch, travel, …) and every
planetary-hour window of the day is scored against transparent classical
rules — each window lists exactly which factors moved it. Any day deep-links
to `/calendar/[date]`, a full almanac page (mundane aspects, ingresses,
stations, planetary hours, electional windows). Months, days, and electional
windows all export as `.ics` files with stable UIDs, so re-imports update
instead of duplicating.

### Settings

`/settings` consolidates the per-browser preferences: **theme** (dark /
light / auto, no flash on reload), **aspect orbs** (luminary / planet /
minor-aspect orbs plus the minor-aspect opt-in), **home location** (powers
planetary hours and the electional picker — birth cities are never assumed),
and **chart display** (points on/off, true vs. mean nodes, minor overlay,
wheel vs. table default).

### Aspect & orb settings

Transits, progressed aspects, and the Today strip honor the per-browser orb
configuration, editable inline on the Transits and Cycles tabs as well as on
`/settings`. Stored forecasts deliberately keep the engine defaults so
cached prose stays consistent. Natal snapshots always use the standard orbs.

### Snapshots, versions, and edits

Chart data is **write-once**. Editing birth data (or switching house system)
creates a new snapshot version; old versions stay readable forever via the
version history on the Details tab (`?version=N`). Renaming a profile or its
city label is presentational and does not recompute anything. Everything
time-based (transits, cycles, synastry, Today, forecasts) is recomputed from
the stored snapshots on every read and never persisted — only generated AI
prose is cached.

- **Export** — Details tab → Export downloads the full profile as JSON: every
  snapshot version, every reading.
- **Import** — the home page can restore a profile from such an export.
- **Print / PDF** — Details tab → Printable report renders the chart,
  placements, reading, and numerology as one page in an ink-friendly palette;
  your browser's "Save as PDF" is the export engine.
- **Delete** — Details tab → inline-confirmed **hard delete**; the profile and
  all snapshots/readings are removed at the database level. Export first if
  you want a record.

### AI synthesis (optional)

`.env.example` ships preconfigured for OpenAI (`READING_LLM=api`,
`gpt-4o-mini`) — paste your API key into `READING_LLM_API_KEY` to enable it;
without a key the feature stays off. `READING_LLM` can also be `ollama`
(local) or `anthropic`; any OpenAI-compatible endpoint works via
`READING_LLM_BASE_URL`. When enabled it powers: the natal reading synthesis
(once per snapshot, stored permanently, enforced by a database constraint),
the Mazal synthesis, day/week/month forecasts, the synastry reading, and the
chart chat. Birth instants and coordinates are never sent to the model. LLM
failures never degrade the rest of the app.

### Installing as a PWA / offline use

Run the production server (`npm run build && npm start`), open it in Chrome or
Edge, and install via the icon in the address bar (Android: "Add to Home
screen"). Once installed:

- Every profile page you have **visited** reloads offline, including old
  `?version=N` history views.
- The Today dashboard computes fully offline.
- Never-visited pages show a branded offline notice instead of a browser
  error.
- Live computations (transits, cycles, synastry) and mutations need the
  server and fail with a clean notice offline.

The service worker registers only in production builds; `next dev` actively
unregisters it so it can never interfere with development. To test the PWA in
dev over HTTPS (e.g. for iOS), set `NEXT_PUBLIC_SW_DEV=1` and run
`next dev --experimental-https`.

## Authoring interpretation content

Interpretation entries are Markdown files under `content/en/` and
`content/he/`, keyed by their path (e.g. `planet_in_sign/sun-aries.md` →
`planet_in_sign/sun/aries`). See `content/README.md` for the format; the lint
suite in `lib/content.lint.test.ts` enforces coverage and format. Bump
`CONTENT_VERSION` in `lib/versions.ts` when the library changes meaningfully —
snapshots record the version they were rendered against and the UI notes when
content has moved on since.

## Project layout

```
app/                  Next.js App Router pages + API routes (incl. app/sw.js/route.ts,
                      the service worker route, and /profiles/[id]/print)
components/           React components (wizard, chart wheel, panels, Today dashboard)
content/en/           English interpretation library (1499 Markdown entries)
content/he/           Hebrew interpretation library (62 Markdown entries)
lib/                  App services: snapshots, timezone, content, forecasts, LLM, PWA
packages/astro-core/  Framework-free chart engine (ephemeris, houses, aspects,
                      eclipses, patterns, fortune, profections)
packages/hebrew-core/ Framework-free Hebrew engine (calendar, mazalot, planetary hours)
packages/numero-core/ Framework-free numerology engine (Pythagorean, gematria)
prisma/               Schema + migrations (write-once snapshot model)
scripts/              One-time maintenance: GeoNames import, icon generation
```

Deeper docs: `ARCHITECTURE.md` (technical design), `AstralSync_PRD_v2.md`
(product spec), `TODO.md` (build log and roadmap).
