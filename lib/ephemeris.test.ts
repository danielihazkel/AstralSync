import { describe, expect, it } from "vitest";
import {
  computeEphemerisMonth,
  ephemerisCsv,
  formatEphemerisPosition,
} from "./ephemeris";

describe("computeEphemerisMonth", () => {
  it("lists every UTC day with positions and marks the equinox ingress", () => {
    const m = computeEphemerisMonth(2024, 3);
    expect(m.days).toHaveLength(31);
    expect(m.days[0].date).toBe("2024-03-01");
    // Sun enters Aries 2024-03-20 03:06 UT.
    const day = m.days.find((d) => d.date === "2024-03-20")!;
    expect(day.events.some((e) => e.startsWith("Sun → Ari 03:0"))).toBe(true);
    expect(day.positions.sun.sign).toBe("pisces");
    expect(m.days[20].positions.sun.sign).toBe("aries");
    // Mercury stations retrograde 2024-04-01, direct 2024-04-25 — none in March
    // but Mercury enters Aries on the 10th.
    expect(m.days[9].events.some((e) => e.startsWith("Mer → Ari"))).toBe(true);
  });

  it("marks stations", () => {
    const m = computeEphemerisMonth(2024, 4);
    expect(m.days[0].events.some((e) => e.startsWith("Mer stations ℞"))).toBe(true);
    expect(m.days[24].events.some((e) => e.startsWith("Mer stations D"))).toBe(true);
  });
});

describe("formatting", () => {
  it("prints degrees and minutes with a sign abbreviation", () => {
    expect(
      formatEphemerisPosition({
        longitude: 45.5,
        sign: "taurus",
        degreeInSign: 15.5,
        retrograde: true,
      }),
    ).toBe("15°30′ Tau ℞");
    expect(
      formatEphemerisPosition({
        longitude: 29.999,
        sign: "aries",
        degreeInSign: 29.999,
        retrograde: false,
      }),
    ).toBe("30°00′ Ari");
  });

  it("emits a CSV with one row per day and an R suffix on retrograde longitudes", () => {
    const csv = ephemerisCsv(computeEphemerisMonth(2024, 4));
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "date,sun,moon,mercury,venus,mars,jupiter,saturn,uranus,neptune,pluto,north_node,events",
    );
    expect(lines).toHaveLength(31);
    // Mercury retrograde 2024-04-02 → 04-24.
    expect(lines[10].split(",")[3]).toMatch(/R$/);
  });
});
