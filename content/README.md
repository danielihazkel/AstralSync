# AstralSync interpretation content library

The interpretation text is the product (PRD §5). This directory is the
versioned, open content library: Markdown entries keyed by placement, resolved
against stored snapshots at read time by `lib/content.ts`.

## Layout

```
content/
  README.md          this guide
  en/                one directory per language; keys are locale-free, so
                     localization means adding a sibling tree (e.g. es/)
    <category>/<file>.md
  he/                Hebrew (Mazal) library, Phase 2c — ASCII keys, Hebrew
                     titles and bodies; rendered RTL (LOCALE_DIRECTION)
```

The library is read once per server process and cached — restart `next dev`
to pick up edits.

## Keys

Every entry has a canonical key `category/segment[/segment…]`. The key is
derived from the file path: directories map verbatim, hyphens in the filename
become key segments.

| Category             | Key shape                        | Example file → key |
| -------------------- | -------------------------------- | ------------------ |
| `planet_in_sign`     | `planet_in_sign/<planet>/<sign>` | `planet_in_sign/sun-aries.md` → `planet_in_sign/sun/aries` |
| `planet_in_house`    | `planet_in_house/<planet>/<1-12>`| `planet_in_house/mars-7.md` |
| `aspect`             | `aspect/<a>/<b>/<type>`          | `aspect/sun-moon-square.md` |
| `ascendant_sign`     | `ascendant_sign/<sign>`          | `ascendant_sign/leo.md` |
| `element_dominance`  | `element_dominance/<element>`    | `element_dominance/fire.md` |
| `modality_dominance` | `modality_dominance/<modality>`  | `modality_dominance/cardinal.md` |
| `life_path`          | `life_path/<n>`                  | `life_path/11.md` |
| `destiny`            | `destiny/<n>`                    | `destiny/5.md` |
| `soul_urge`          | `soul_urge/<n>`                  | `soul_urge/22.md` |
| `mazal_month`        | `mazal_month/<month>`            | `mazal_month/nisan.md` |
| `day_planet`         | `day_planet/<planet>`            | `day_planet/saturn.md` |
| `hour_planet`        | `hour_planet/<planet>`           | `hour_planet/venus.md` |
| `sefer_yetzirah`     | `sefer_yetzirah/<month>`         | `sefer_yetzirah/adar.md` |
| `hebrew_date_gematria` | `hebrew_date_gematria/<n>`     | `hebrew_date_gematria/22.md` |
| `name_gematria`      | `name_gematria/<n>`              | `name_gematria/7.md` |

Planets, signs, elements, and modalities use the lowercase identifiers from
`@astralsync/astro-core` and `lib/dominance.ts`. The loader supports the full
taxonomy; unauthored keys degrade gracefully (the section is omitted).

**English scope (406 entries):** `planet_in_sign` ×120
(all ten planets × 12 signs; outer-planet sign entries use generational
framing), `planet_in_house` ×120, `aspect` ×49 (nine pairs across all five
types, plus conjunction-only Sun–Mercury and Sun–Venus and
conjunction+sextile Mercury–Venus — the remaining combinations are
astronomically unreachable at natal orbs), `transit_aspect` ×50 (Tier 1:
transiting Jupiter–Pluto over natal Sun/Moon across all five types;
directional keys, transiter first — never sorted), `ascendant_sign` ×12,
`life_path` / `destiny` / `soul_urge` ×12 each (1–9, 11, 22, 33),
`element_dominance` ×4, `modality_dominance` ×3, and a `synastry_aspect`
×12 starter set. The reading renders sign/house sections for the personal
planets only; Jupiter–Pluto entries are authored for future surfaces
(transits, LLM prompts). The AI period forecasts and the Transits tab
prefer `transit_aspect` prose for pairs in play and fall back to the natal
`aspect` archetypes for everything unauthored (fast-mover pairs stay on the
fallback by design).

**Hebrew scope (62 entries under `he/`, Phase 2c):** `mazal_month` ×12 (the
single `adar` entry covers Adar I/II), `day_planet` ×7 + `hour_planet` ×7
(Shabbat 156a temperaments), `sefer_yetzirah` ×12 (Gra recension per
Kaplan's edition — the same table as `packages/hebrew-core`),
`hebrew_date_gematria` ×12 and `name_gematria` ×12 (1–9, 11, 22, 33). Month
and planet segments use the `hebrew-core` keys (`HebrewMonthKey`,
`ClassicalPlanet`).

### Hebrew authoring notes

- Keys stay ASCII (they come from the snapshot); titles and bodies are
  Hebrew. The lint enforces Hebrew script in every `he/` body.
- Same voice rules as English, adapted: strengths **and** a friction point,
  actionable close, no fortune-telling. Gendered second person is avoided —
  use "ילידי החודש" / "מי שנולד…" phrasing instead.
- Traditional sources (Shabbat 156a, Sefer Yetzirah ch. 5, month/holiday
  symbolism) inform the ideas; the sentences are original, never copied.
- No `essence` field — the Hebrew reading composes sections directly and has
  no template-synthesis slot.

## Entry format

```markdown
---
key: planet_in_sign/sun/aries
title: Sun in Aries
essence: direct, self-igniting drive
---

Two to four paragraphs of body Markdown.
```

Frontmatter is flat `name: value` lines only — no nesting, quoting, or
arrays. Fields:

- `key` (required) — must match the file path; enforced by
  `lib/content.lint.test.ts`.
- `title` (required) — display heading.
- `essence` (required for `element_dominance`, `modality_dominance`, and
  `life_path`, optional elsewhere) — a short lowercase noun phrase consumed
  by the template synthesis (`lib/synthesis.ts`). It must read naturally after "giving you …"
  or "— …", e.g. `a researcher's need to understand before joining in`.

## Body Markdown subset

Paragraphs, `##` headings, `**bold**`, `*italic*`, and `-` lists only.
No raw HTML, no links. This matches the safe renderer in
`components/Markdown.tsx`; anything else will render as literal text.

## Voice

- **Original text only.** Public-domain astrology and numerology literature
  may inform the ideas; the sentences are written for this project, never
  copied.
- Second person, present tense, concrete. Describe tendencies and trade-offs,
  not fortunes: "you commit late but completely" beats "great things await".
- Every entry names both a strength and a friction point — flattery-only
  entries read as horoscope filler.
- 2–4 paragraphs, roughly 80–160 words. No headings needed at this length.
- Actionable close: the last sentence should give the reader something to do
  or watch for, mirroring the app's "show your work" ethos.

## Versioning

`CONTENT_VERSION` in `lib/versions.ts` is the library's version and is
stamped onto every snapshot at compute time. Readings always resolve against
the current tree; when a snapshot's stamp differs, the UI shows a provenance
note. Bump the constant on meaning-affecting rewrites; adding entries alone
needs no bump. History lives in git — if frozen historical trees are ever
needed, add `content/v2/…` and parameterize the loader root.
