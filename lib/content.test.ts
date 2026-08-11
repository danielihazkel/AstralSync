import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Placement, Planet, Sign } from "@astralsync/astro-core";
import type { StoredChart } from "./view-types";
import { CONTENT_VERSION } from "./versions";
import {
  keyFromPath,
  loadContentIndex,
  parseEntryFile,
  resolveReading,
} from "./content";

const FIXTURE_ROOT = path.join(__dirname, "__fixtures__", "content");

function placement(planet: Planet, sign: Sign, degreeInSign = 17.07): Placement {
  return { planet, sign, longitude: 0, degreeInSign, house: 1, retrograde: false };
}

/** Sun Leo / Moon Scorpio / Virgo rising, water-dominant (5 planets). */
function fixtureChart(overrides: Partial<StoredChart> = {}): StoredChart {
  return {
    schemaVersion: 1,
    input: {
      utc: "1990-08-01T12:00:00.000Z",
      latitude: 0,
      longitude: 0,
      houseSystem: "placidus",
      timeCertainty: "exact",
    },
    isSolarChart: false,
    houses: null,
    placements: [
      placement("sun", "leo"),
      placement("moon", "scorpio"),
      placement("mercury", "virgo"),
      placement("venus", "libra"),
      placement("mars", "aries"),
      placement("jupiter", "cancer"),
      placement("saturn", "pisces"),
      placement("uranus", "gemini"),
      placement("neptune", "scorpio"),
      placement("pluto", "cancer"),
    ],
    bigThree: { sun: "leo", moon: "scorpio", ascendant: "virgo" },
    uncertainties: [],
    engine: { name: "test", version: "0" },
    tzWarnings: [],
    ...overrides,
  };
}

describe("keyFromPath", () => {
  it("maps each category's path shape to its canonical key", () => {
    expect(keyFromPath("planet_in_sign/sun-aries.md")).toBe("planet_in_sign/sun/aries");
    expect(keyFromPath("planet_in_house/mars-7.md")).toBe("planet_in_house/mars/7");
    expect(keyFromPath("aspect/sun-moon-square.md")).toBe("aspect/sun/moon/square");
    expect(keyFromPath("ascendant_sign/leo.md")).toBe("ascendant_sign/leo");
    expect(keyFromPath("element_dominance/fire.md")).toBe("element_dominance/fire");
    expect(keyFromPath("life_path/11.md")).toBe("life_path/11");
  });

  it("normalizes Windows separators", () => {
    expect(keyFromPath("life_path\\22.md")).toBe("life_path/22");
  });
});

describe("parseEntryFile", () => {
  const raw = [
    "---",
    "key: life_path/7",
    "title: Life Path 7",
    "essence: a quiet need to understand",
    "---",
    "",
    "Body text.",
  ].join("\n");

  it("parses frontmatter and body", () => {
    const entry = parseEntryFile(raw, "life_path/7.md");
    expect(entry).toEqual({
      key: "life_path/7",
      category: "life_path",
      title: "Life Path 7",
      essence: "a quiet need to understand",
      bodyMd: "Body text.",
    });
  });

  it("treats essence as optional", () => {
    const entry = parseEntryFile(
      "---\nkey: ascendant_sign/leo\ntitle: Leo Rising\n---\nBody.",
      "ascendant_sign/leo.md",
    );
    expect(entry.essence).toBeNull();
  });

  it("rejects malformed input with the file path in the error", () => {
    expect(() => parseEntryFile("no frontmatter", "x.md")).toThrow(/x\.md/);
    expect(() => parseEntryFile("---\nkey: life_path/7\n", "x.md")).toThrow(
      /unterminated/,
    );
    expect(() => parseEntryFile("---\ntitle: T\n---\nBody.", "x.md")).toThrow(
      /missing key/,
    );
    expect(() =>
      parseEntryFile("---\nkey: not_a_category/x\ntitle: T\n---\nBody.", "x.md"),
    ).toThrow(/unknown category/);
    expect(() =>
      parseEntryFile("---\nkey: life_path/7\ntitle: T\n---\n\n", "x.md"),
    ).toThrow(/empty body/);
  });
});

describe("loadContentIndex", () => {
  it("indexes every fixture entry by canonical key", () => {
    const index = loadContentIndex(FIXTURE_ROOT);
    expect(index.version).toBe(CONTENT_VERSION);
    expect([...index.entries.keys()].sort()).toEqual([
      "ascendant_sign/virgo",
      "element_dominance/water",
      "life_path/11",
      "life_path/7",
      "planet_in_sign/moon/scorpio",
      "planet_in_sign/sun/leo",
    ]);
  });

  it("caches per root", () => {
    expect(loadContentIndex(FIXTURE_ROOT)).toBe(loadContentIndex(FIXTURE_ROOT));
  });
});

describe("resolveReading", () => {
  const index = loadContentIndex(FIXTURE_ROOT);

  it("resolves the full section list in display order", () => {
    const reading = resolveReading(
      fixtureChart(),
      { lifePath: 7, isMaster: false },
      CONTENT_VERSION,
      index,
    );
    expect(reading.sections.map((s) => s.slot)).toEqual([
      "sun",
      "moon",
      "ascendant",
      "element",
      "life_path",
      "synthesis",
    ]);
    expect(reading.stale).toBe(false);
    expect(reading.missingKeys).toEqual([]);
    expect(reading.dominance.dominant).toBe("water");

    const [sun, , asc, element, lifePath, synthesis] = reading.sections;
    expect(sun.title).toBe("Sun in Leo");
    expect(sun.source).toBe("Sun in Leo — 17°04′");
    expect(asc.source).toBe("Rising in Virgo");
    expect(element.source).toBe("5 of 10 planets in water signs");
    expect(lifePath.source).toBe("Life Path 7");
    expect(synthesis.key).toBeNull();
    expect(synthesis.bodyMd).toContain("a feeling-first read");
    expect(synthesis.bodyMd).toContain("a researcher's need");
  });

  it("marks master-number life paths in the source line", () => {
    const reading = resolveReading(
      fixtureChart(),
      { lifePath: 11, isMaster: true },
      CONTENT_VERSION,
      index,
    );
    const lp = reading.sections.find((s) => s.slot === "life_path");
    expect(lp?.source).toBe("Life Path 11 — master number");
  });

  it("skips the Ascendant and degree precision on a solar chart", () => {
    const reading = resolveReading(
      fixtureChart({
        isSolarChart: true,
        bigThree: { sun: "leo", moon: "scorpio", ascendant: null },
      }),
      { lifePath: 7, isMaster: false },
      CONTENT_VERSION,
      index,
    );
    expect(reading.sections.some((s) => s.slot === "ascendant")).toBe(false);
    const sun = reading.sections.find((s) => s.slot === "sun");
    expect(sun?.source).toBe("Sun in Leo");
  });

  it("collects unauthored keys instead of throwing", () => {
    const reading = resolveReading(
      fixtureChart({ bigThree: { sun: "aries", moon: "scorpio", ascendant: "virgo" } }),
      { lifePath: 3, isMaster: false },
      CONTENT_VERSION,
      index,
    );
    expect(reading.missingKeys).toEqual([
      "planet_in_sign/sun/aries",
      "life_path/3",
    ]);
    expect(reading.sections.some((s) => s.slot === "sun")).toBe(false);
    // Synthesis still renders, element-only.
    const synthesis = reading.sections.find((s) => s.slot === "synthesis");
    expect(synthesis?.bodyMd).toContain("elemental balance");
  });

  it("handles a null numero input", () => {
    const reading = resolveReading(fixtureChart(), null, CONTENT_VERSION, index);
    expect(reading.sections.some((s) => s.slot === "life_path")).toBe(false);
    expect(reading.missingKeys).toEqual([]);
  });

  it("flags snapshots stamped under another library version as stale", () => {
    const reading = resolveReading(
      fixtureChart(),
      { lifePath: 7, isMaster: false },
      "0",
      index,
    );
    expect(reading.stale).toBe(true);
    expect(reading.snapshotContentVersion).toBe("0");
    expect(reading.contentVersion).toBe(CONTENT_VERSION);
  });
});
