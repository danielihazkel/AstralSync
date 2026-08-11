import { describe, expect, it } from "vitest";
import { SIGNS } from "@astralsync/astro-core";
import { DAY_PLANETS, HEBREW_MONTH_KEYS } from "@astralsync/hebrew-core";
import { ELEMENTS } from "./dominance";
import { contentRoot, loadContentIndex, type ContentEntry } from "./content";

/**
 * Lint for the real shipped libraries under content/en and content/he —
 * every entry parses, keys match paths (enforced by the loader itself),
 * each locale's scope is complete, and bodies stay inside the safe Markdown
 * subset and size band (content/README.md).
 */

const index = loadContentIndex(contentRoot("en"));
const entries = [...index.entries.values()];
const heIndex = loadContentIndex(contentRoot("he"));
const heEntries = [...heIndex.entries.values()];
const LIFE_PATHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

function entry(key: string): ContentEntry | null {
  return index.entries.get(key) ?? null;
}

function checkMarkdownSubset(list: ContentEntry[]) {
  for (const e of list) {
    expect(e.bodyMd, e.key).not.toMatch(/<[a-zA-Z/!]/); // no raw HTML
    expect(e.bodyMd, e.key).not.toMatch(/\]\(/); // no links
    expect(e.bodyMd, e.key).not.toMatch(/^#(?!#)/m); // no h1
  }
}

function checkSizeBand(list: ContentEntry[]) {
  for (const e of list) {
    const paragraphs = e.bodyMd.split(/\n\s*\n/).filter((p) => p.trim() !== "");
    expect(paragraphs.length, e.key).toBeGreaterThanOrEqual(2);
    expect(paragraphs.length, e.key).toBeLessThanOrEqual(4);
    const words = e.bodyMd.split(/\s+/).filter(Boolean).length;
    expect(words, e.key).toBeGreaterThanOrEqual(60);
    expect(words, e.key).toBeLessThanOrEqual(220);
  }
}

describe("content library lint", () => {
  it("contains exactly the 52 v1 entries", () => {
    // 24 sun/moon-in-sign + 12 ascendant + 12 life paths + 4 elements.
    expect(entries).toHaveLength(52);
  });

  it("covers Sun and Moon in every sign", () => {
    for (const sign of SIGNS) {
      expect(entry(`planet_in_sign/sun/${sign}`), `sun/${sign}`).not.toBeNull();
      expect(entry(`planet_in_sign/moon/${sign}`), `moon/${sign}`).not.toBeNull();
    }
  });

  it("covers every Ascendant sign", () => {
    for (const sign of SIGNS) {
      expect(entry(`ascendant_sign/${sign}`), sign).not.toBeNull();
    }
  });

  it("covers every Life Path including masters", () => {
    for (const n of LIFE_PATHS) {
      expect(entry(`life_path/${n}`), `life_path/${n}`).not.toBeNull();
    }
  });

  it("covers every element dominance", () => {
    for (const element of ELEMENTS) {
      expect(entry(`element_dominance/${element}`), element).not.toBeNull();
    }
  });

  it("has a synthesis essence on every element and life path entry", () => {
    for (const e of entries) {
      if (e.category !== "element_dominance" && e.category !== "life_path") continue;
      expect(e.essence, e.key).toBeTruthy();
      // Must read naturally after "giving you …" — lowercase noun phrase,
      // no trailing period.
      expect(e.essence, e.key).toMatch(/^[a-z]/);
      expect(e.essence, e.key).not.toMatch(/\.$/);
    }
  });

  it("keeps bodies inside the safe Markdown subset", () => {
    checkMarkdownSubset(entries);
  });

  it("keeps bodies in the authored size band (2–4 paragraphs, 60–220 words)", () => {
    checkSizeBand(entries);
  });
});

describe("Hebrew content library lint (content/he, Phase 2c)", () => {
  const heEntry = (key: string): ContentEntry | null =>
    heIndex.entries.get(key) ?? null;

  it("contains exactly the 62 Hebrew entries", () => {
    // 12 mazal_month + 7 day_planet + 7 hour_planet + 12 sefer_yetzirah
    // + 12 hebrew_date_gematria + 12 name_gematria.
    expect(heEntries).toHaveLength(62);
  });

  it("covers every month in mazal_month and sefer_yetzirah", () => {
    for (const month of HEBREW_MONTH_KEYS) {
      expect(heEntry(`mazal_month/${month}`), month).not.toBeNull();
      expect(heEntry(`sefer_yetzirah/${month}`), month).not.toBeNull();
    }
  });

  it("covers every classical planet in day_planet and hour_planet", () => {
    for (const planet of DAY_PLANETS) {
      expect(heEntry(`day_planet/${planet}`), planet).not.toBeNull();
      expect(heEntry(`hour_planet/${planet}`), planet).not.toBeNull();
    }
  });

  it("covers every number including masters in both gematria categories", () => {
    for (const n of LIFE_PATHS) {
      expect(heEntry(`hebrew_date_gematria/${n}`), `date/${n}`).not.toBeNull();
      expect(heEntry(`name_gematria/${n}`), `name/${n}`).not.toBeNull();
    }
  });

  it("writes every title and body in Hebrew script", () => {
    for (const e of heEntries) {
      expect(e.title, e.key).toMatch(/[֐-׿]/);
      expect(e.bodyMd, e.key).toMatch(/[֐-׿]/);
    }
  });

  it("keeps bodies inside the safe Markdown subset", () => {
    checkMarkdownSubset(heEntries);
  });

  it("keeps bodies in the authored size band (2–4 paragraphs, 60–220 words)", () => {
    checkSizeBand(heEntries);
  });
});
