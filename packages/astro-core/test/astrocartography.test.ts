import * as Astronomy from "astronomy-engine";
import { describe, expect, it } from "vitest";
import {
  PLANETS,
  astronomyEngineProvider,
  astrocartographyLines,
  buildChart,
  horizonLongitude,
  mcLongitude,
  separation,
  splitAtAntimeridian,
} from "../src";

const AT = new Date(Date.UTC(1990, 2, 4, 10, 30));

describe("provider rightAscension", () => {
  it("matches the EQD rotation path within 0.01° for all planets", () => {
    const BODY = {
      sun: Astronomy.Body.Sun,
      moon: Astronomy.Body.Moon,
      mercury: Astronomy.Body.Mercury,
      venus: Astronomy.Body.Venus,
      mars: Astronomy.Body.Mars,
      jupiter: Astronomy.Body.Jupiter,
      saturn: Astronomy.Body.Saturn,
      uranus: Astronomy.Body.Uranus,
      neptune: Astronomy.Body.Neptune,
      pluto: Astronomy.Body.Pluto,
    };
    const rot = Astronomy.Rotation_EQJ_EQD(AT);
    for (const planet of PLANETS) {
      const v = Astronomy.RotateVector(rot, Astronomy.GeoVector(BODY[planet], AT, true));
      const reference = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
      expect(separation(astronomyEngineProvider.rightAscension(planet, AT), reference)).toBeLessThan(0.01);
    }
  });
});

describe("astrocartography lines", () => {
  const sunLon = astronomyEngineProvider.eclipticLongitude("sun", AT);
  const sunRa = astronomyEngineProvider.rightAscension("sun", AT);
  const sunDec = astronomyEngineProvider.declination("sun", AT);
  const gst = astronomyEngineProvider.siderealTimeDeg(AT);

  it("puts the Sun on the MC along its MC line", () => {
    // The Sun has (almost) no ecliptic latitude, so on its MC line the
    // chart's MC is the Sun's own degree, at any latitude.
    const lng = mcLongitude(sunRa, gst);
    for (const lat of [-40, 0, 51.5]) {
      const chart = buildChart({ utc: AT, latitude: lat, longitude: lng });
      expect(separation(chart.houses!.mc, sunLon)).toBeLessThan(0.05);
    }
  });

  it("puts the Sun on the Ascendant along its ASC line, and the Descendant along its DSC line", () => {
    for (const lat of [-35, 10, 48]) {
      const asc = horizonLongitude(sunRa, sunDec, gst, lat, "asc")!;
      const dsc = horizonLongitude(sunRa, sunDec, gst, lat, "dsc")!;
      const rising = buildChart({ utc: AT, latitude: lat, longitude: asc });
      const setting = buildChart({ utc: AT, latitude: lat, longitude: dsc });
      expect(separation(rising.houses!.ascendant, sunLon)).toBeLessThan(0.1);
      expect(separation(setting.houses!.ascendant, (sunLon + 180) % 360)).toBeLessThan(0.1);
    }
  });

  it("has no rising or setting where a planet is circumpolar", () => {
    // Declination 20°: never sets north of 70°N, never rises south of 70°S.
    expect(horizonLongitude(0, 20, 0, 75, "asc")).toBeNull();
    expect(horizonLongitude(0, 20, 0, -75, "dsc")).toBeNull();
    expect(horizonLongitude(0, 20, 0, 69, "asc")).not.toBeNull();
  });

  it("closes the rising and setting lines onto the meridian at the limit", () => {
    // Just inside the circumpolar latitude the planet barely rises: it
    // rises and sets close to lower culmination, i.e. near the IC line.
    const asc = horizonLongitude(10, 20, 0, 69.99, "asc")!;
    const dsc = horizonLongitude(10, 20, 0, 69.99, "dsc")!;
    const ic = mcLongitude(10, 0) + 180;
    expect(separation(asc, ic)).toBeLessThan(2);
    expect(separation(dsc, ic)).toBeLessThan(2);
  });

  it("runs each sampled rising/setting line all the way onto its meridian", () => {
    // June solstice: the Sun at δ ≈ +23.4° reaches its limit at ~66.6°,
    // well inside a 75° map.
    const at = new Date(Date.UTC(2026, 5, 21, 12));
    const gst = astronomyEngineProvider.siderealTimeDeg(at);
    const lines = astrocartographyLines(at, { maxLatitude: 75, planets: ["sun"] });
    const ra = astronomyEngineProvider.rightAscension("sun", at);
    const dec = astronomyEngineProvider.declination("sun", at);
    const mc = mcLongitude(ra, gst);
    const ic = mc + 180;
    for (const angle of ["asc", "dsc"] as const) {
      const pts = lines.find((l) => l.angle === angle)!.segments.flat();
      const north = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
      const south = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
      // Northern limit (90° − δ): lower culmination, on the IC line.
      expect(north[1]).toBeCloseTo(90 - dec, 3);
      expect(separation(north[0], ic)).toBeLessThan(0.5);
      // Southern limit (−(90° − δ)): beyond it the Sun never rises; it
      // grazes the horizon at upper culmination, on the MC line.
      expect(south[1]).toBeCloseTo(-(90 - dec), 3);
      expect(separation(south[0], mc)).toBeLessThan(0.5);
    }
  });

  it("meets the map edge at ±180° instead of stopping short", () => {
    const segs = splitAtAntimeridian([
      [170, 0],
      [178, 1],
      [-176, 2],
      [-170, 3],
    ]);
    expect(segs).toHaveLength(2);
    const [a, b] = segs;
    expect(a[a.length - 1][0]).toBe(180);
    expect(b[0][0]).toBe(-180);
    // 178 → 184 (unwrapped) crosses 180 a third of the way: latitude 1.333.
    expect(a[a.length - 1][1]).toBeCloseTo(1 + 1 / 3, 6);
    expect(b[0][1]).toBeCloseTo(1 + 1 / 3, 6);
  });

  it("draws four lines per planet and never jumps across the map", () => {
    const lines = astrocartographyLines(AT);
    expect(lines).toHaveLength(PLANETS.length * 4);
    for (const line of lines) {
      for (const seg of line.segments) {
        for (let i = 1; i < seg.length; i++) {
          expect(Math.abs(seg[i][0] - seg[i - 1][0])).toBeLessThan(180);
        }
      }
    }
  });
});
