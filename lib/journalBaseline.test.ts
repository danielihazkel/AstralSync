import {
  astronomyEngineProvider as eph,
  buildChart,
  signOf,
} from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import {
  BASELINE_CAP_DAYS,
  baselineDayFeatures,
  sampleBaseline,
} from "./journalBaseline";

describe("baselineDayFeatures", () => {
  it("is self-consistent with the ephemeris at local noon", () => {
    const f = baselineDayFeatures("2024-04-08", null);
    const noon = new Date("2024-04-08T12:00:00");
    expect(f.moonSign).toBe(signOf(eph.eclipticLongitude("moon", noon)));
    // Solar-eclipse day: the Moon is on the Sun.
    expect(f.phase).toBe("New Moon");
    expect(f.aspectPlanets).toEqual([]);
  });

  it("sees a known retrograde period", () => {
    // Mercury was retrograde 2024-04-01 → 2024-04-25.
    expect(baselineDayFeatures("2024-04-10", null).retrogrades).toContain(
      "mercury",
    );
    expect(baselineDayFeatures("2024-05-10", null).retrogrades).not.toContain(
      "mercury",
    );
  });

  it("reports aspecting planets against a natal chart", () => {
    const natal = buildChart({
      utc: new Date(Date.UTC(1990, 2, 4, 10, 30, 0)),
      latitude: 32.109,
      longitude: 34.855,
    });
    const f = baselineDayFeatures("2024-04-08", natal.placements);
    for (const p of f.aspectPlanets) {
      expect(natal.placements.map((x) => x.planet)).toContain(p);
    }
  });
});

describe("sampleBaseline", () => {
  it("samples every day of the span inclusively, in order", async () => {
    const progress: Array<[number, number]> = [];
    const days = await sampleBaseline("2024-04-01", "2024-04-10", null, (d, t) =>
      progress.push([d, t]),
    );
    expect(days).toHaveLength(10);
    expect(days[0].date).toBe("2024-04-01");
    expect(days[9].date).toBe("2024-04-10");
    expect(progress.at(-1)).toEqual([10, 10]);
  });

  it("returns [] for an inverted span", async () => {
    expect(await sampleBaseline("2024-04-10", "2024-04-01", null)).toEqual([]);
  });

  it("caps long spans to the most recent BASELINE_CAP_DAYS", async () => {
    // 2020-01-01 → 2024-01-01 is ~1462 days; the cap keeps the last 1096.
    const days = await sampleBaseline("2020-01-01", "2024-01-01", null);
    expect(days).toHaveLength(BASELINE_CAP_DAYS);
    expect(days.at(-1)!.date).toBe("2024-01-01");
    expect(days[0].date).toBe("2021-01-01");
  });
});
