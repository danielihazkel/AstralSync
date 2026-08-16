import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  Aspect,
  AspectType,
  Placement,
  Planet,
  Sign,
} from "@astralsync/astro-core";
import type { WheelChart } from "./view-types";
import { CONTENT_VERSION } from "./versions";
import {
  keyFromPath,
  loadContentIndex,
  natalAspectKey,
  parseEntryFile,
  resolveReading,
  transitAspectKey,
} from "./content";

const FIXTURE_ROOT = path.join(__dirname, "__fixtures__", "content");

/** Baseline numero input: Life Path 7, no birth name on record. */
const numeroSeven = {
  lifePath: 7,
  isMaster: false,
  destiny: null,
  soulUrge: null,
};

function placement(
  planet: Planet,
  sign: Sign,
  house: number | null = 1,
  degreeInSign = 17.07,
): Placement {
  return { planet, sign, longitude: 0, degreeInSign, house, retrograde: false };
}

/** Strip houses the way a real solar chart stores placements. */
function unhoused(placements: Placement[]): Placement[] {
  return placements.map((p) => ({ ...p, house: null }));
}

function aspect(a: Planet, b: Planet, type: AspectType, orb: number): Aspect {
  return { a, b, type, angle: 0, orb };
}

/** Sun Leo / Moon Scorpio / Virgo rising, water-dominant (5 planets). */
function fixtureChart(overrides: Partial<WheelChart> = {}): WheelChart {
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
      placement("sun", "leo", 1),
      placement("moon", "scorpio", 2),
      placement("mercury", "virgo", 3),
      placement("venus", "libra", 4),
      placement("mars", "aries", 5),
      placement("jupiter", "cancer", 6),
      placement("saturn", "pisces", 7),
      placement("uranus", "gemini", 8),
      placement("neptune", "scorpio", 9),
      placement("pluto", "cancer", 10),
    ],
    bigThree: { sun: "leo", moon: "scorpio", ascendant: "virgo" },
    aspects: [],
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

describe("transitAspectKey", () => {
  it("is directional — transiter first, never sorted", () => {
    expect(transitAspectKey("saturn", "sun", "square")).toBe(
      "transit_aspect/saturn/sun/square",
    );
    expect(transitAspectKey("sun", "saturn", "square")).toBe(
      "transit_aspect/sun/saturn/square",
    );
  });

  it("round-trips through keyFromPath", () => {
    expect(keyFromPath("transit_aspect/saturn-sun-square.md")).toBe(
      transitAspectKey("saturn", "sun", "square"),
    );
  });
});

describe("natalAspectKey", () => {
  it("orders the pair canonically regardless of input order", () => {
    expect(natalAspectKey("sun", "moon", "square")).toBe("aspect/sun/moon/square");
    expect(natalAspectKey("moon", "sun", "square")).toBe("aspect/sun/moon/square");
    expect(natalAspectKey("mars", "venus", "trine")).toBe("aspect/venus/mars/trine");
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
      "angle_aspect/moon/ascendant/square",
      "angle_aspect/venus/ascendant/conjunction",
      "ascendant_sign/virgo",
      "aspect/sun/moon/square",
      "aspect/venus/mars/trine",
      "chart_pattern/stellium",
      "destiny/5",
      "element_dominance/water",
      "life_path/11",
      "life_path/7",
      "mc_sign/cancer",
      "modality_dominance/cardinal",
      "natal_retrograde/mercury",
      "planet_in_house/jupiter/6",
      "planet_in_house/mars/5",
      "planet_in_house/mercury/3",
      "planet_in_house/moon/2",
      "planet_in_house/neptune/9",
      "planet_in_house/pluto/10",
      "planet_in_house/saturn/7",
      "planet_in_house/sun/1",
      "planet_in_house/uranus/8",
      "planet_in_house/venus/4",
      "planet_in_sign/jupiter/cancer",
      "planet_in_sign/mars/aries",
      "planet_in_sign/mercury/virgo",
      "planet_in_sign/moon/scorpio",
      "planet_in_sign/neptune/scorpio",
      "planet_in_sign/pluto/cancer",
      "planet_in_sign/saturn/pisces",
      "planet_in_sign/sun/leo",
      "planet_in_sign/uranus/gemini",
      "planet_in_sign/venus/libra",
      "point_in_sign/lilith/sagittarius",
      "point_in_sign/north_node/aquarius",
      "point_in_sign/north_node/sagittarius",
      "point_in_sign/north_node/scorpio",
      "point_in_sign/part_of_fortune/virgo",
      "point_in_sign/south_node/gemini",
      "point_in_sign/south_node/leo",
      "point_in_sign/south_node/taurus",
      "soul_urge/22",
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
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    expect(reading.sections.map((s) => s.slot)).toEqual([
      "sun",
      "moon",
      "ascendant",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      // The generational trio follows the placements as its own group.
      "uranus",
      "neptune",
      "pluto",
      "element",
      "modality",
      "house",
      "house",
      "house",
      "house",
      "house",
      "house",
      "house",
      "house",
      "house",
      "house",
      // The fixture instant's true nodes and Lilith (no houses → no Fortune).
      "point",
      "point",
      "point",
      "life_path",
      "synthesis",
    ]);
    expect(reading.stale).toBe(false);
    expect(reading.missingKeys).toEqual([]);
    expect(reading.dominance.dominant).toBe("water");
    expect(reading.modality.dominant).toBe("cardinal");

    const bySlot = (slot: string) =>
      reading.sections.find((s) => s.slot === slot);
    const [sun, , asc, mercury] = reading.sections;
    expect(sun.title).toBe("Sun in Leo");
    expect(sun.source).toBe("Sun in Leo — 17°04′");
    expect(asc.source).toBe("Rising in Virgo");
    expect(mercury.source).toBe("Mercury in Virgo — 17°04′");
    expect(bySlot("element")?.source).toBe("5 of 10 planets in water signs");
    expect(bySlot("modality")?.source).toBe("4 of 10 planets in cardinal signs");
    expect(bySlot("house")?.source).toBe("Sun in the 1st house");
    expect(
      reading.sections.filter((s) => s.slot === "house").map((s) => s.source),
    ).toEqual([
      "Sun in the 1st house",
      "Moon in the 2nd house",
      "Mercury in the 3rd house",
      "Venus in the 4th house",
      "Mars in the 5th house",
      "Jupiter in the 6th house",
      "Saturn in the 7th house",
      "Uranus in the 8th house",
      "Neptune in the 9th house",
      "Pluto in the 10th house",
    ]);
    expect(
      reading.sections.filter((s) => s.slot === "point").map((s) => s.source),
    ).toEqual([
      "North Node in Aquarius — 7°18′",
      "South Node in Leo — 7°18′",
      "Lilith in Sagittarius — 0°08′",
    ]);
    expect(bySlot("life_path")?.source).toBe("Life Path 7");
    const synthesis = bySlot("synthesis");
    expect(synthesis?.key).toBeNull();
    expect(synthesis?.bodyMd).toContain("a feeling-first read");
    expect(synthesis?.bodyMd).toContain("an instinct to open new ground");
    expect(synthesis?.bodyMd).toContain("a researcher's need");
  });

  it("resolves the eight tightest aspects in orb order, dropping the rest", () => {
    const reading = resolveReading(
      fixtureChart({
        aspects: [
          aspect("venus", "mars", "trine", 2.5),
          aspect("sun", "moon", "square", 0.4),
          aspect("mercury", "jupiter", "sextile", 5.9), // unauthored
          aspect("sun", "pluto", "opposition", 3.2), // unauthored
          aspect("moon", "saturn", "conjunction", 1.1), // unauthored
          aspect("jupiter", "neptune", "trine", 4.8), // unauthored
          aspect("mercury", "saturn", "square", 6.4), // unauthored
          aspect("venus", "jupiter", "sextile", 7.0), // unauthored
          aspect("moon", "uranus", "square", 7.8), // 9th tightest — cut
        ],
      }),
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    const aspectSections = reading.sections.filter((s) => s.slot === "aspect");
    expect(aspectSections.map((s) => s.key)).toEqual([
      "aspect/sun/moon/square",
      "aspect/venus/mars/trine",
    ]);
    expect(aspectSections[0].source).toBe("Sun square Moon — orb 0°24′");
    expect(aspectSections[1].source).toBe("Venus trine Mars — orb 2°30′");
    // The six unauthored top-8 keys degrade; the cut 9th is never attempted.
    expect(reading.missingKeys).toEqual([
      "aspect/moon/saturn/conjunction",
      "aspect/sun/pluto/opposition",
      "aspect/jupiter/neptune/trine",
      "aspect/mercury/jupiter/sextile",
      "aspect/mercury/saturn/square",
      "aspect/venus/jupiter/sextile",
    ]);
  });

  it("resolves the tightest angle aspects when houses exist, degrading like aspects", () => {
    const reading = resolveReading(
      fixtureChart({
        houses: {
          system: "placidus",
          requestedSystem: "placidus",
          fallbackApplied: false,
          cusps: [170, 200, 230, 260, 290, 320, 350, 20, 50, 80, 110, 140],
          ascendant: 170,
          mc: 100,
        },
        // Moon square ASC (orb 0.5°), Venus conjunct ASC (2°), Sun trine MC
        // (3°); every other placement stays at 0° — no aspect to either angle.
        placements: fixtureChart().placements.map((p) =>
          p.planet === "moon"
            ? { ...p, longitude: 260.5 }
            : p.planet === "venus"
              ? { ...p, longitude: 172 }
              : p.planet === "sun"
                ? { ...p, longitude: 223 }
                : p,
        ),
      }),
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    const angleSections = reading.sections.filter((s) => s.slot === "angle");
    expect(angleSections.map((s) => s.key)).toEqual([
      "angle_aspect/moon/ascendant/square",
      "angle_aspect/venus/ascendant/conjunction",
    ]);
    expect(angleSections[0].source).toBe("Moon square Ascendant — orb 0°30′");
    expect(angleSections[1].source).toBe(
      "Venus conjunction Ascendant — orb 2°00′",
    );
    // The unauthored Sun–MC trine degrades into missingKeys like any key.
    expect(reading.missingKeys).toContain("angle_aspect/sun/mc/trine");

    // No houses (the solar-chart shape) → no angle sections at all.
    const solar = resolveReading(fixtureChart(), numeroSeven, CONTENT_VERSION, index);
    expect(solar.sections.some((s) => s.slot === "angle")).toBe(false);
  });

  it("suppresses aspect orb precision on a solar chart", () => {
    const base = fixtureChart();
    const reading = resolveReading(
      fixtureChart({
        isSolarChart: true,
        bigThree: { sun: "leo", moon: "scorpio", ascendant: null },
        placements: unhoused(base.placements),
        aspects: [aspect("sun", "moon", "square", 0.4)],
      }),
      null,
      CONTENT_VERSION,
      index,
    );
    const asp = reading.sections.find((s) => s.slot === "aspect");
    expect(asp?.source).toBe("Sun square Moon");
  });

  it("marks master-number life paths in the source line", () => {
    const reading = resolveReading(
      fixtureChart(),
      { ...numeroSeven, lifePath: 11, isMaster: true },
      CONTENT_VERSION,
      index,
    );
    const lp = reading.sections.find((s) => s.slot === "life_path");
    expect(lp?.source).toBe("Life Path 11 — master number");
  });

  it("resolves destiny and soul urge sections after the life path", () => {
    const reading = resolveReading(
      fixtureChart(),
      {
        ...numeroSeven,
        destiny: { value: 5, isMaster: false },
        soulUrge: { value: 22, isMaster: true },
      },
      CONTENT_VERSION,
      index,
    );
    const slots = reading.sections.map((s) => s.slot);
    expect(slots.slice(slots.indexOf("life_path"))).toEqual([
      "life_path",
      "destiny",
      "soul_urge",
      "synthesis",
    ]);
    const destiny = reading.sections.find((s) => s.slot === "destiny");
    expect(destiny?.key).toBe("destiny/5");
    expect(destiny?.source).toBe("Destiny 5");
    const soulUrge = reading.sections.find((s) => s.slot === "soul_urge");
    expect(soulUrge?.key).toBe("soul_urge/22");
    expect(soulUrge?.source).toBe("Soul Urge 22 — master number");
    expect(reading.missingKeys).toEqual([]);
  });

  it("omits name-number sections without missingKeys when they are null", () => {
    const reading = resolveReading(
      fixtureChart(),
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    expect(reading.sections.some((s) => s.slot === "destiny")).toBe(false);
    expect(reading.sections.some((s) => s.slot === "soul_urge")).toBe(false);
    expect(reading.missingKeys).toEqual([]);
  });

  it("skips the Ascendant, houses, and degree precision on a solar chart", () => {
    const base = fixtureChart();
    const reading = resolveReading(
      fixtureChart({
        isSolarChart: true,
        bigThree: { sun: "leo", moon: "scorpio", ascendant: null },
        placements: unhoused(base.placements),
      }),
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    expect(reading.sections.some((s) => s.slot === "ascendant")).toBe(false);
    const sun = reading.sections.find((s) => s.slot === "sun");
    expect(sun?.source).toBe("Sun in Leo");
    const mercury = reading.sections.find((s) => s.slot === "mercury");
    expect(mercury?.source).toBe("Mercury in Virgo");
    // House keys are never attempted — no sections and no missingKeys noise.
    expect(reading.sections.some((s) => s.slot === "house")).toBe(false);
    expect(reading.missingKeys.some((k) => k.startsWith("planet_in_house/"))).toBe(
      false,
    );
    // Points still resolve (nodes and Lilith need no houses), with degree
    // precision suppressed; the Fortune and MC are silently absent.
    const points = reading.sections.filter((s) => s.slot === "point");
    expect(points.map((s) => s.source)).toEqual([
      "North Node in Aquarius",
      "South Node in Leo",
      "Lilith in Sagittarius",
    ]);
    expect(reading.sections.some((s) => s.slot === "mc")).toBe(false);
    expect(reading.missingKeys.some((k) => k.startsWith("mc_sign/"))).toBe(false);
    expect(
      reading.missingKeys.some((k) => k.includes("part_of_fortune")),
    ).toBe(false);
  });

  it("emits both node sections, tagged, when mean and true disagree on sign", () => {
    // 1975-06-12: the true node sits at 0° Sagittarius while the mean node
    // is still at 29° Scorpio (verified against pointsAt directly).
    const base = fixtureChart();
    const reading = resolveReading(
      fixtureChart({ input: { ...base.input, utc: "1975-06-12T12:00:00.000Z" } }),
      null,
      CONTENT_VERSION,
      index,
    );
    const nodes = reading.sections.filter(
      (s) => s.slot === "point" && s.key?.includes("node"),
    );
    expect(nodes.map((s) => [s.key, s.nodeVariant])).toEqual([
      ["point_in_sign/north_node/sagittarius", "true"],
      ["point_in_sign/north_node/scorpio", "mean"],
      ["point_in_sign/south_node/gemini", "true"],
      ["point_in_sign/south_node/taurus", "mean"],
    ]);
    expect(nodes[0].source).toMatch(/^North Node in Sagittarius — .* \(true node\)$/);
    expect(nodes[1].source).toMatch(/^North Node in Scorpio — .* \(mean node\)$/);
  });

  it("leaves node sections untagged when the variants agree on sign", () => {
    const reading = resolveReading(fixtureChart(), null, CONTENT_VERSION, index);
    const nodes = reading.sections.filter(
      (s) => s.slot === "point" && s.key?.includes("node"),
    );
    expect(nodes).toHaveLength(2);
    expect(nodes.every((s) => s.nodeVariant === undefined)).toBe(true);
  });

  it("resolves the Midheaven and Part of Fortune when houses exist", () => {
    // Equal cusps from an Ascendant at 170°; MC at 100° → Cancer. With the
    // fixture's zero sun/moon longitudes both sect formulas collapse to the
    // Ascendant, so the Fortune lands on 170° → Virgo either way.
    const reading = resolveReading(
      fixtureChart({
        houses: {
          system: "placidus",
          requestedSystem: "placidus",
          fallbackApplied: false,
          cusps: [170, 200, 230, 260, 290, 320, 350, 20, 50, 80, 110, 140],
          ascendant: 170,
          mc: 100,
        },
      }),
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    const slots = reading.sections.map((s) => s.slot);
    // The MC sits with the placements, right after the Ascendant.
    expect(slots.indexOf("mc")).toBe(slots.indexOf("ascendant") + 1);
    const mc = reading.sections.find((s) => s.slot === "mc");
    expect(mc?.key).toBe("mc_sign/cancer");
    expect(mc?.source).toBe("Midheaven in Cancer — 10°00′");
    const points = reading.sections.filter((s) => s.slot === "point");
    expect(points).toHaveLength(4);
    expect(points[3].key).toBe("point_in_sign/part_of_fortune/virgo");
    expect(points[3].source).toBe("Part of Fortune in Virgo — 20°00′");
    expect(reading.missingKeys).toEqual([]);
  });

  it("resolves a section per natal retrograde, skipping the luminaries", () => {
    const base = fixtureChart();
    const retro = base.placements.map((p) =>
      p.planet === "mercury" || p.planet === "sun"
        ? { ...p, retrograde: true }
        : p,
    );
    const reading = resolveReading(
      fixtureChart({ placements: retro }),
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    const sections = reading.sections.filter((s) => s.slot === "retrograde");
    expect(sections.map((s) => s.key)).toEqual(["natal_retrograde/mercury"]);
    expect(sections[0].source).toBe("Mercury retrograde in Virgo");
    // A retrograde Sun flag (impossible in real data) is ignored, not missed.
    expect(reading.missingKeys.some((k) => k.startsWith("natal_retrograde/"))).toBe(
      false,
    );
  });

  it("resolves chart patterns with the members in the source line", () => {
    const base = fixtureChart();
    // Sun, Mercury and Venus share Leo → a stellium; every longitude stays 0,
    // so no longitude-based pattern (trines, squares) can also fire.
    const placements = base.placements.map((p) =>
      p.planet === "mercury" || p.planet === "venus" ? { ...p, sign: "leo" as const } : p,
    );
    const reading = resolveReading(
      fixtureChart({ placements }),
      numeroSeven,
      CONTENT_VERSION,
      index,
    );
    const patterns = reading.sections.filter((s) => s.slot === "chart_pattern");
    expect(patterns.map((s) => s.key)).toEqual(["chart_pattern/stellium"]);
    expect(patterns[0].source).toBe("Stellium in Leo — Sun, Mercury, Venus");
    // Patterns render after the balance sections and before the houses.
    const slots = reading.sections.map((s) => s.slot);
    expect(slots.indexOf("chart_pattern")).toBeGreaterThan(
      slots.indexOf("element"),
    );
    expect(slots.indexOf("chart_pattern")).toBeLessThan(slots.indexOf("house"));
  });

  it("collects unauthored keys instead of throwing", () => {
    const reading = resolveReading(
      fixtureChart({ bigThree: { sun: "aries", moon: "scorpio", ascendant: "virgo" } }),
      { ...numeroSeven, lifePath: 3 },
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
      numeroSeven,
      "0",
      index,
    );
    expect(reading.stale).toBe(true);
    expect(reading.snapshotContentVersion).toBe("0");
    expect(reading.contentVersion).toBe(CONTENT_VERSION);
  });
});
