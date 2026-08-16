import { describe, expect, it } from "vitest";
import type { EntrySky } from "./journal";
import {
  computeInsights,
  featuresFromEntrySky,
  formatShare,
  highlights,
  tagCounts,
  type BaselineDay,
  type InsightEntry,
  type SkyFeatures,
} from "./journalInsights";

function feat(over: Partial<SkyFeatures> = {}): SkyFeatures {
  return {
    moonSign: "aries",
    moonElement: "fire",
    phase: "New Moon",
    retrogrades: [],
    aspectPlanets: [],
    ...over,
  };
}

function entry(over: Partial<InsightEntry> = {}): InsightEntry {
  return {
    entryDate: "2026-08-01",
    mood: null,
    tags: [],
    features: feat(),
    ...over,
  };
}

function baselineDays(
  count: number,
  featureOf: (i: number) => SkyFeatures,
): BaselineDay[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `day-${i}`,
    features: featureOf(i),
  }));
}

/** 100 days: first 25 water/Full Moon/mercury-rx, the rest fire/New Moon. */
const BASELINE = baselineDays(100, (i) =>
  i < 25
    ? feat({
        moonSign: "cancer",
        moonElement: "water",
        phase: "Full Moon",
        retrogrades: ["mercury"],
      })
    : feat(),
);

describe("featuresFromEntrySky", () => {
  const sky: EntrySky = {
    computedAt: "2026-08-01T09:00:00.000Z",
    natalVersion: 1,
    engine: { name: "test", version: "0" },
    placements: [
      // Minimal but shaped like real placements.
      {
        planet: "sun",
        longitude: 10,
        sign: "aries",
        degreeInSign: 10,
        house: null,
        retrograde: false,
      },
      {
        planet: "moon",
        longitude: 100,
        sign: "cancer",
        degreeInSign: 10,
        house: null,
        retrograde: false,
      },
      {
        planet: "mercury",
        longitude: 20,
        sign: "aries",
        degreeInSign: 20,
        house: null,
        retrograde: true,
      },
    ],
    crossAspects: [
      { a: "saturn", b: "sun", type: "square", angle: 90, orb: 1.2 },
      { a: "saturn", b: "moon", type: "trine", angle: 120, orb: 0.4 },
    ],
  };

  it("derives sign, element, phase, retrogrades and aspecting planets", () => {
    expect(featuresFromEntrySky(sky)).toEqual({
      moonSign: "cancer",
      moonElement: "water",
      phase: "First Quarter", // elongation 90°
      retrogrades: ["mercury"],
      aspectPlanets: ["saturn"], // deduped across the two aspects
    });
  });

  it("returns null when the Sun or Moon is missing", () => {
    expect(
      featuresFromEntrySky({ ...sky, placements: sky.placements.slice(2) }),
    ).toBeNull();
  });
});

describe("computeInsights", () => {
  it("computes exact shares and lifts against the baseline", () => {
    // 8 entries, 6 with a sky: 3 water, 3 fire.
    const entries = [
      ...Array.from({ length: 3 }, () =>
        entry({ features: feat({ moonSign: "cancer", moonElement: "water" }) }),
      ),
      ...Array.from({ length: 3 }, () => entry()),
      entry({ features: null }),
      entry({ features: null }),
    ];
    const report = computeInsights(entries, BASELINE);
    expect(report.totalEntries).toBe(8);
    expect(report.entriesWithSky).toBe(6);
    expect(report.baselineDays).toBe(100);
    const water = report.moonElement.find((s) => s.key === "water")!;
    expect(water.entryCount).toBe(3);
    expect(water.entryShare).toBeCloseTo(0.5, 10);
    expect(water.baselineShare).toBeCloseTo(0.25, 10);
    expect(water.lift).toBeCloseTo(0.25, 10);
  });

  it("counts multi-valued facets per entry, not per value", () => {
    const entries = [
      entry({ features: feat({ retrogrades: ["mercury", "saturn"] }) }),
      entry(),
    ];
    const report = computeInsights(entries, BASELINE);
    const mercury = report.retrograde.find((s) => s.key === "mercury")!;
    expect(mercury.entryCount).toBe(1);
    expect(mercury.entryShare).toBeCloseTo(0.5, 10);
    expect(mercury.baselineShare).toBeCloseTo(0.25, 10);
    const saturn = report.retrograde.find((s) => s.key === "saturn")!;
    expect(saturn.entryCount).toBe(1);
    expect(saturn.baselineShare).toBe(0);
  });

  it("averages moods overall and by slice, gating slices at 3 moods", () => {
    const entries = [
      entry({ mood: "very_high" }),
      entry({ mood: "high" }),
      entry({ mood: "neutral" }),
      entry({
        mood: "very_low",
        features: feat({ moonElement: "water", moonSign: "cancer" }),
      }),
    ];
    const report = computeInsights(entries, BASELINE);
    // (5 + 4 + 3 + 1) / 4
    expect(report.moodAverage).toBeCloseTo(3.25, 10);
    // fire has 3 rated notes (5, 4, 3) → slice; water has 1 → gated out.
    expect(report.moodByElement).toEqual([
      { key: "fire", count: 3, avgMood: 4 },
    ]);
  });

  it("reports null mood average when no moods are recorded", () => {
    expect(computeInsights([entry()], BASELINE).moodAverage).toBeNull();
  });
});

describe("highlights", () => {
  it("emits the share-vs-baseline sentence for a real difference", () => {
    // 6 of 8 water entries (75%) vs 25% of days.
    const entries = [
      ...Array.from({ length: 6 }, () =>
        entry({ features: feat({ moonSign: "cancer", moonElement: "water" }) }),
      ),
      ...Array.from({ length: 2 }, () => entry()),
    ];
    const heads = highlights(computeInsights(entries, BASELINE));
    expect(
      heads.some(
        (h) =>
          h.text ===
          "Moon in water signs: 75% of your notes vs 25% of days.",
      ),
    ).toBe(true);
  });

  it("suppresses categories below 3 entries even when the lift is large", () => {
    // 5 entries with sky (clears MIN_ENTRIES) but only 2 water.
    const entries = [
      ...Array.from({ length: 2 }, () =>
        entry({ features: feat({ moonSign: "cancer", moonElement: "water" }) }),
      ),
      ...Array.from({ length: 3 }, () => entry()),
    ];
    const heads = highlights(computeInsights(entries, BASELINE));
    expect(heads.some((h) => h.text.includes("water"))).toBe(false);
  });

  it("stays silent below the entry and baseline minimums", () => {
    const four = Array.from({ length: 4 }, () =>
      entry({ features: feat({ moonElement: "water", moonSign: "cancer" }) }),
    );
    expect(highlights(computeInsights(four, BASELINE))).toEqual([]);
    const six = Array.from({ length: 6 }, () =>
      entry({ features: feat({ moonElement: "water", moonSign: "cancer" }) }),
    );
    const shortBaseline = BASELINE.slice(0, 29);
    expect(highlights(computeInsights(six, shortBaseline))).toEqual([]);
  });
});

describe("tagCounts", () => {
  it("orders by count descending, ties alphabetical", () => {
    const entries = [
      entry({ tags: ["work", "dreams"] }),
      entry({ tags: ["work"] }),
      entry({ tags: ["family"] }),
    ];
    expect(tagCounts(entries)).toEqual([
      { tag: "work", count: 2 },
      { tag: "dreams", count: 1 },
      { tag: "family", count: 1 },
    ]);
  });
});

describe("formatShare", () => {
  it("rounds to whole percent", () => {
    expect(formatShare(0.25)).toBe("25%");
    expect(formatShare(0.625)).toBe("63%");
    expect(formatShare(0)).toBe("0%");
  });
});
