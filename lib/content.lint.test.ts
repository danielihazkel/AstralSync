import path from "node:path";
import { describe, expect, it } from "vitest";
import { SIGNS } from "@astralsync/astro-core";
import { ELEMENTS } from "./dominance";
import { loadContentIndex, type ContentEntry } from "./content";

/**
 * Lint for the real shipped library under content/en — every entry parses,
 * keys match paths (enforced by the loader itself), the v1 scope is complete,
 * and bodies stay inside the safe Markdown subset (content/README.md).
 */

const index = loadContentIndex(path.join(process.cwd(), "content", "en"));
const entries = [...index.entries.values()];
const LIFE_PATHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

function entry(key: string): ContentEntry | null {
  return index.entries.get(key) ?? null;
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
    for (const e of entries) {
      expect(e.bodyMd, e.key).not.toMatch(/<[a-zA-Z/!]/); // no raw HTML
      expect(e.bodyMd, e.key).not.toMatch(/\]\(/); // no links
      expect(e.bodyMd, e.key).not.toMatch(/^#(?!#)/m); // no h1
    }
  });

  it("keeps bodies in the authored size band (2–4 paragraphs, 60–220 words)", () => {
    for (const e of entries) {
      const paragraphs = e.bodyMd
        .split(/\n\s*\n/)
        .filter((p) => p.trim() !== "");
      expect(paragraphs.length, e.key).toBeGreaterThanOrEqual(2);
      expect(paragraphs.length, e.key).toBeLessThanOrEqual(4);
      const words = e.bodyMd.split(/\s+/).filter(Boolean).length;
      expect(words, e.key).toBeGreaterThanOrEqual(60);
      expect(words, e.key).toBeLessThanOrEqual(220);
    }
  });
});
