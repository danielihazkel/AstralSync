import { describe, expect, it } from "vitest";
import { PLANETS, SIGNS, type Planet } from "@astralsync/astro-core";
import { DAY_PLANETS, HEBREW_MONTH_KEYS } from "@astralsync/hebrew-core";
import { ELEMENTS, MODALITIES } from "./dominance";
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
// Authored aspect prose covers the majors only; minor aspects (quincunx
// etc.) are read-time overlays with graceful prose fallback.
const MAJOR_ASPECT_TYPES = ["conjunction", "sextile", "square", "trine", "opposition"];

/** Transit prose: slow transiters over every natal planet, all types —
 *  same-planet keys are the planet's own return cycle (e.g. the Saturn
 *  return). Fast-mover transits stay on the natal-archetype fallback by
 *  design. */
const TRANSIT_ASPECT_TRANSITERS: Planet[] = [
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];
const TRANSIT_ASPECT_NATALS: Planet[] = [...PLANETS];

/**
 * Deliberately unauthored: outer–outer aspects last for decades and are
 * cohort-wide, not personal — a reading section for them would be filler.
 * The negative assertion below keeps this an explicit decision.
 */
const EXCLUDED_GENERATIONAL_PAIRS: [Planet, Planet][] = [
  ["uranus", "neptune"],
  ["uranus", "pluto"],
  ["neptune", "pluto"],
];

/** Pairs authored only at their astronomically reachable types. */
const PARTIAL_PAIRS: [Planet, Planet][] = [
  ["sun", "mercury"],
  ["sun", "venus"],
  ["mercury", "venus"],
];

/** Every other sorted PLANETS pair is authored across all five types. */
const FULL_ASPECT_PAIRS: [Planet, Planet][] = [];
for (let i = 0; i < PLANETS.length; i++) {
  for (let j = i + 1; j < PLANETS.length; j++) {
    const skip = [...EXCLUDED_GENERATIONAL_PAIRS, ...PARTIAL_PAIRS].some(
      ([a, b]) => a === PLANETS[i] && b === PLANETS[j],
    );
    if (!skip) FULL_ASPECT_PAIRS.push([PLANETS[i], PLANETS[j]]);
  }
}

/**
 * Pairs whose remaining types are astronomically unreachable at natal orbs
 * (Sun–Mercury max elongation ~28°, Sun–Venus ~47°, Mercury–Venus ~76°).
 */
const PARTIAL_ASPECT_KEYS = [
  "aspect/sun/mercury/conjunction",
  "aspect/sun/venus/conjunction",
  "aspect/mercury/venus/conjunction",
  "aspect/mercury/venus/sextile",
];

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
  it("contains exactly the 922 entries", () => {
    // 120 planet-in-sign + 120 planet-in-house + 12 ascendant + 12 life
    // paths + 4 elements + 3 modalities + 199 natal aspects (39 full pairs
    // + 4 partials) + 250 transit aspects (5 transiters x 10 natal targets)
    // + 12 destiny + 12 soul urge + 105 synastry aspects (21 sorted pairs
    // over 6 planets) + 12 MC signs + 5 chart patterns + 8 natal
    // retrogrades + 48 points in sign.
    expect(entries).toHaveLength(922);
  });

  it("covers every planet in every sign", () => {
    for (const planet of PLANETS) {
      for (const sign of SIGNS) {
        expect(
          entry(`planet_in_sign/${planet}/${sign}`),
          `${planet}/${sign}`,
        ).not.toBeNull();
      }
    }
  });

  it("covers every planet in every house", () => {
    for (const planet of PLANETS) {
      for (let house = 1; house <= 12; house++) {
        expect(
          entry(`planet_in_house/${planet}/${house}`),
          `${planet}/${house}`,
        ).not.toBeNull();
      }
    }
  });

  it("covers every Ascendant sign", () => {
    for (const sign of SIGNS) {
      expect(entry(`ascendant_sign/${sign}`), sign).not.toBeNull();
    }
  });

  it("covers every Midheaven sign", () => {
    for (const sign of SIGNS) {
      expect(entry(`mc_sign/${sign}`), sign).not.toBeNull();
    }
    expect(entries.filter((e) => e.category === "mc_sign")).toHaveLength(12);
  });

  it("covers every chart pattern type", () => {
    const PATTERN_TYPES = [
      "stellium",
      "grand_trine",
      "t_square",
      "grand_cross",
      "yod",
    ];
    for (const type of PATTERN_TYPES) {
      expect(entry(`chart_pattern/${type}`), type).not.toBeNull();
    }
    expect(entries.filter((e) => e.category === "chart_pattern")).toHaveLength(
      PATTERN_TYPES.length,
    );
  });

  it("covers every natal retrograde except the luminaries", () => {
    const RETRO_PLANETS = PLANETS.filter((p) => p !== "sun" && p !== "moon");
    for (const planet of RETRO_PLANETS) {
      expect(entry(`natal_retrograde/${planet}`), planet).not.toBeNull();
    }
    expect(
      entries.filter((e) => e.category === "natal_retrograde"),
    ).toHaveLength(8);
  });

  it("covers every point in every sign", () => {
    const POINTS = ["north_node", "south_node", "lilith", "part_of_fortune"];
    for (const point of POINTS) {
      for (const sign of SIGNS) {
        expect(
          entry(`point_in_sign/${point}/${sign}`),
          `${point}/${sign}`,
        ).not.toBeNull();
      }
    }
    expect(entries.filter((e) => e.category === "point_in_sign")).toHaveLength(
      POINTS.length * SIGNS.length,
    );
  });

  it("covers every Life Path including masters", () => {
    for (const n of LIFE_PATHS) {
      expect(entry(`life_path/${n}`), `life_path/${n}`).not.toBeNull();
    }
  });

  it("covers every Destiny and Soul Urge number including masters", () => {
    for (const n of LIFE_PATHS) {
      expect(entry(`destiny/${n}`), `destiny/${n}`).not.toBeNull();
      expect(entry(`soul_urge/${n}`), `soul_urge/${n}`).not.toBeNull();
    }
  });

  it("covers the full relationship-planet synastry matrix", () => {
    // Every sorted pair (PLANETS order, same-planet pairs included) among
    // the relationship planets — the personal four plus Mercury
    // (communication) and Saturn (commitment) — across all five types.
    const SYNASTRY_PLANETS: Planet[] = [
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "saturn",
    ];
    let expected = 0;
    for (let i = 0; i < SYNASTRY_PLANETS.length; i++) {
      for (let j = i; j < SYNASTRY_PLANETS.length; j++) {
        for (const type of MAJOR_ASPECT_TYPES) {
          const key = `synastry_aspect/${SYNASTRY_PLANETS[i]}/${SYNASTRY_PLANETS[j]}/${type}`;
          expect(entry(key), key).not.toBeNull();
          expected++;
        }
      }
    }
    expect(entries.filter((e) => e.category === "synastry_aspect")).toHaveLength(
      expected,
    );
  });

  it("covers every element dominance", () => {
    for (const element of ELEMENTS) {
      expect(entry(`element_dominance/${element}`), element).not.toBeNull();
    }
  });

  it("covers every modality dominance", () => {
    for (const modality of MODALITIES) {
      expect(entry(`modality_dominance/${modality}`), modality).not.toBeNull();
    }
  });

  it("covers the transit aspect matrix (all natal targets)", () => {
    for (const transiter of TRANSIT_ASPECT_TRANSITERS) {
      for (const natal of TRANSIT_ASPECT_NATALS) {
        for (const type of MAJOR_ASPECT_TYPES) {
          const key = `transit_aspect/${transiter}/${natal}/${type}`;
          expect(entry(key), key).not.toBeNull();
        }
      }
    }
    expect(entries.filter((e) => e.category === "transit_aspect")).toHaveLength(
      TRANSIT_ASPECT_TRANSITERS.length *
        TRANSIT_ASPECT_NATALS.length *
        MAJOR_ASPECT_TYPES.length,
    );
  });

  it("covers the natal aspect matrix (all reachable pairs)", () => {
    for (const [a, b] of FULL_ASPECT_PAIRS) {
      for (const type of MAJOR_ASPECT_TYPES) {
        expect(entry(`aspect/${a}/${b}/${type}`), `${a}/${b}/${type}`).not.toBeNull();
      }
    }
    for (const key of PARTIAL_ASPECT_KEYS) {
      expect(entry(key), key).not.toBeNull();
    }
    // The outer–outer exclusion is a decision, not a gap — assert it holds.
    for (const [a, b] of EXCLUDED_GENERATIONAL_PAIRS) {
      for (const type of MAJOR_ASPECT_TYPES) {
        expect(
          entry(`aspect/${a}/${b}/${type}`),
          `${a}/${b}/${type} is deliberately unauthored`,
        ).toBeNull();
      }
    }
    const authored = entries.filter((e) => e.category === "aspect");
    expect(authored).toHaveLength(
      FULL_ASPECT_PAIRS.length * MAJOR_ASPECT_TYPES.length + PARTIAL_ASPECT_KEYS.length,
    );
  });

  it("orders every aspect key's pair canonically (PLANETS order)", () => {
    for (const e of entries) {
      if (e.category !== "aspect") continue;
      const [, a, b] = e.key.split("/");
      expect(
        PLANETS.indexOf(a as Planet),
        e.key,
      ).toBeLessThan(PLANETS.indexOf(b as Planet));
    }
  });

  it("has a synthesis essence on every element, modality, and life path entry", () => {
    const synthesized = ["element_dominance", "modality_dominance", "life_path"];
    for (const e of entries) {
      if (!synthesized.includes(e.category)) continue;
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
