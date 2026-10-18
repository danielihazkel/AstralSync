import { describe, expect, it } from "vitest";
import {
  PLANETS,
  astrocartographyLines,
  astronomyEngineProvider,
  buildChart,
  horizonLongitude,
  mcLongitude,
  separation,
} from "@astralsync/astro-core";
import { linesNear, relocateChart } from "./relocation";
import type { WheelChart } from "./view-types";

const UTC = new Date(Date.UTC(1990, 2, 4, 10, 30));
const natal: WheelChart = {
  ...buildChart({ utc: UTC, latitude: 32.08, longitude: 34.78 }),
  tzWarnings: [],
};

describe("relocateChart", () => {
  it("keeps the planets and moves the angles", () => {
    const r = relocateChart(natal, { label: "New York", lat: 40.71, lng: -74.01 })!;
    for (const p of r.chart.placements) {
      const n = natal.placements.find((x) => x.planet === p.planet)!;
      expect(p.longitude).toBe(n.longitude);
    }
    expect(separation(r.chart.houses!.ascendant, natal.houses!.ascendant)).toBeGreaterThan(30);
    expect(r.chart.input.utc).toBe(natal.input.utc);
  });

  it("is a no-op at the birthplace", () => {
    const r = relocateChart(natal, { label: "Tel Aviv", lat: 32.08, lng: 34.78 })!;
    expect(r.houseChanges).toEqual([]);
    expect(r.ascendant.here).toBe(r.ascendant.natal);
  });

  it("finds the Sun culminating on its own MC line", () => {
    const gst = astronomyEngineProvider.siderealTimeDeg(UTC);
    const lng = mcLongitude(astronomyEngineProvider.rightAscension("sun", UTC), gst);
    const r = relocateChart(natal, { label: "on the line", lat: 20, lng })!;
    expect(r.angular[0]).toMatchObject({ planet: "sun", angle: "mc" });
    expect(r.angular[0].orb).toBeLessThan(0.1);
  });

  it("has nothing to relocate without a birth time", () => {
    const solar: WheelChart = {
      ...buildChart({ utc: UTC, latitude: 32.08, longitude: 34.78, timeCertainty: "unknown" }),
      tzWarnings: [],
    };
    expect(relocateChart(solar, { label: "x", lat: 0, lng: 0 })).toBeNull();
  });
});

describe("linesNear", () => {
  const gst = astronomyEngineProvider.siderealTimeDeg(UTC);
  const equatorial = Object.fromEntries(
    PLANETS.map((p) => [
      p,
      {
        ra: astronomyEngineProvider.rightAscension(p, UTC),
        dec: astronomyEngineProvider.declination(p, UTC),
      },
    ]),
  );
  const lines = astrocartographyLines(UTC);

  it("puts a place on a line at zero distance and orders by distance", () => {
    const lng = mcLongitude(equatorial.venus.ra, gst);
    const near = linesNear(lines, equatorial, gst, { label: "x", lat: 30, lng });
    expect(near[0]).toMatchObject({ planet: "venus", angle: "mc" });
    expect(near[0].km).toBeLessThan(1);
    for (let i = 1; i < near.length; i++) expect(near[i].km).toBeGreaterThanOrEqual(near[i - 1].km);
  });

  it("measures great-circle distance to a meridian and names the side", () => {
    const lng = mcLongitude(equatorial.venus.ra, gst);
    // Two degrees west of the line at 60°N: asin(cos 60° · sin 2°) ≈ 111 km.
    const near = linesNear(lines, equatorial, gst, { label: "x", lat: 60, lng: lng - 2 });
    const venus = near.find((n) => n.planet === "venus" && n.angle === "mc")!;
    expect(venus.km).toBeCloseTo(111.2, 0);
    expect(venus.side).toBe("east");
  });

  it("measures across the circumpolar bend, not along the latitude", () => {
    // June solstice Sun: its rising line bends into the IC meridian at
    // ~66.6°N, running almost east–west there. A place 0.4° north of the
    // line at 66°N is ~45 km from it, though the line's longitude at the
    // place's own latitude is far away.
    const at = new Date(Date.UTC(2026, 5, 21, 12));
    const g = astronomyEngineProvider.siderealTimeDeg(at);
    const eq = {
      sun: {
        ra: astronomyEngineProvider.rightAscension("sun", at),
        dec: astronomyEngineProvider.declination("sun", at),
      },
    };
    const onLine = horizonLongitude(eq.sun.ra, eq.sun.dec, g, 66, "asc")!;
    const alongLatitude = horizonLongitude(eq.sun.ra, eq.sun.dec, g, 66.4, "asc")!;
    expect(separation(alongLatitude, onLine)).toBeGreaterThan(5);
    const near = linesNear([{ planet: "sun", angle: "asc" }], eq, g, {
      label: "x",
      lat: 66.4,
      lng: onLine,
    });
    expect(near).toHaveLength(1);
    expect(near[0].km).toBeLessThan(50);
  });
});
