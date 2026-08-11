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

Planets, signs, elements, and modalities use the lowercase identifiers from
`@astralsync/astro-core` and `lib/dominance.ts`. The loader supports the full
taxonomy; unauthored keys degrade gracefully (the section is omitted).

**v1 scope (52 entries):** Sun in sign ×12, Moon in sign ×12,
`ascendant_sign` ×12, `life_path` 1–9/11/22/33 (×12), `element_dominance` ×4.

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
- `essence` (required for `element_dominance` and `life_path`, optional
  elsewhere) — a short lowercase noun phrase consumed by the template
  synthesis (`lib/synthesis.ts`). It must read naturally after "giving you …"
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
