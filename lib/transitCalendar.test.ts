import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import { computeTransitCalendar } from "./transitCalendar";
import type { WheelChart } from "./view-types";

// The 2024-04-08 golden-fixture instant: natal Sun 19°24' Aries.
const natal: WheelChart = {
  ...buildChart({
    utc: new Date(Date.UTC(2024, 3, 8, 18, 18, 0)),
    latitude: -34.6037,
    longitude: -58.3816,
  }),
  tzWarnings: [],
};

// Noon Moon ~29° Aries — near the Taurus boundary, so the solar chart
// carries the moon_sign uncertainty.
const solar: WheelChart = {
  ...buildChart({
    utc: new Date(Date.UTC(2024, 3, 9, 12, 0, 0)),
    latitude: -34.6037,
    longitude: -58.3816,
    timeCertainty: "unknown",
  }),
  tzWarnings: [],
};

function range(fromIso: string, toIso: string): [Date, Date] {
  return [new Date(fromIso), new Date(toIso)];
}

describe("computeTransitCalendar", () => {
  it("finds the solar return as a Sun–Sun conjunction near the birthday", () => {
    const [from, to] = range("2025-04-01T00:00:00Z", "2025-04-15T00:00:00Z");
    const data = computeTransitCalendar(natal, 1, from, to);
    const hit = data.events.find(
      (e) =>
        e.kind === "aspect" &&
        e.a === "sun" &&
        e.b === "sun" &&
        e.type === "conjunction",
    );
    expect(hit).toBeDefined();
    // The tropical year is ~5h49m longer than 365 days, so the 2025 return
    // drifts into April 9.
    expect(["2025-04-08", "2025-04-09"]).toContain(hit!.utc.slice(0, 10));
  });

  it("never emits transiting-Moon events and stays inside the range", () => {
    const [from, to] = range("2025-04-01T00:00:00Z", "2025-05-01T00:00:00Z");
    const data = computeTransitCalendar(natal, 1, from, to);
    expect(data.events.length).toBeGreaterThan(0);
    for (const e of data.events) {
      if (e.kind === "aspect") expect(e.a).not.toBe("moon");
      if (e.kind === "ingress" || e.kind === "station") {
        expect(e.planet).not.toBe("moon");
      }
      const t = new Date(e.utc).getTime();
      expect(t).toBeGreaterThanOrEqual(from.getTime());
      expect(t).toBeLessThanOrEqual(to.getTime());
    }
  });

  it("orders events by time and numbers retrograde passes per contact", () => {
    const [from, to] = range("2025-06-01T00:00:00Z", "2025-08-30T00:00:00Z");
    const data = computeTransitCalendar(natal, 1, from, to);
    for (let i = 1; i < data.events.length; i++) {
      expect(
        data.events[i].utc >= data.events[i - 1].utc,
      ).toBe(true);
    }
    for (const e of data.events) {
      if (e.kind !== "aspect") continue;
      expect(e.pass.n).toBeGreaterThanOrEqual(1);
      expect(e.pass.n).toBeLessThanOrEqual(e.pass.of);
    }
  });

  it("includes the 2024-04-08 eclipse and Mercury's April station", () => {
    const [from, to] = range("2024-04-01T00:00:00Z", "2024-05-01T00:00:00Z");
    const data = computeTransitCalendar(natal, 1, from, to);
    const eclipse = data.events.find((e) => e.kind === "eclipse");
    expect(eclipse).toBeDefined();
    expect(eclipse!.utc.slice(0, 10)).toBe("2024-04-08");
    // Mercury stationed direct on 2024-04-25.
    const station = data.events.find(
      (e) =>
        e.kind === "station" &&
        e.planet === "mercury" &&
        e.direction === "direct",
    );
    expect(station).toBeDefined();
    expect(station!.utc.slice(0, 10)).toBe("2024-04-25");
  });

  it("flags solar charts and the natal-Moon uncertainty", () => {
    const [from, to] = range("2025-04-01T00:00:00Z", "2025-04-10T00:00:00Z");
    const data = computeTransitCalendar(solar, 2, from, to);
    expect(data.natal.version).toBe(2);
    expect(data.natal.isSolarChart).toBe(true);
    expect(data.natal.moonUncertain).toBe(true);
  });

  it("only adds minor-aspect events when asked", () => {
    const [from, to] = range("2025-04-01T00:00:00Z", "2025-05-01T00:00:00Z");
    const majors = computeTransitCalendar(natal, 1, from, to);
    const all = computeTransitCalendar(natal, 1, from, to, {
      includeMinors: true,
    });
    const minorTypes = new Set([
      "semisextile",
      "semisquare",
      "quintile",
      "sesquiquadrate",
      "quincunx",
    ]);
    expect(
      majors.events.some((e) => e.kind === "aspect" && minorTypes.has(e.type)),
    ).toBe(false);
    expect(
      all.events.some((e) => e.kind === "aspect" && minorTypes.has(e.type)),
    ).toBe(true);
  });
});
