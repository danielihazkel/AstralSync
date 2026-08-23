import * as Astronomy from "astronomy-engine";
import type { Planet } from "../types";
import type { EphemerisProvider } from "./interface";
import { DEG, angleDiff, meanObliquity, norm360 } from "../angles";

const BODY: Record<Planet, Astronomy.Body> = {
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

function longitudeOfDate(planet: Planet, utc: Date): number {
  // GeoVector returns J2000 equatorial; Ecliptic converts to true ecliptic
  // of date (ECT) — the tropical frame astrology uses.
  const vec = Astronomy.GeoVector(BODY[planet], utc, true);
  return norm360(Astronomy.Ecliptic(vec).elon);
}

export const astronomyEngineProvider: EphemerisProvider = {
  name: "astronomy-engine",
  version: "2.1.19",

  eclipticLongitude: longitudeOfDate,

  isRetrograde(planet: Planet, utc: Date): boolean {
    if (planet === "sun" || planet === "moon") return false;
    const dtMs = 3_600_000; // ±1 hour
    const before = longitudeOfDate(planet, new Date(utc.getTime() - dtMs));
    const after = longitudeOfDate(planet, new Date(utc.getTime() + dtMs));
    return angleDiff(after, before) < 0;
  },

  longitudeSpeed(planet: Planet, utc: Date): number {
    const dtMs = 3_600_000; // ±1 hour, same difference isRetrograde signs on
    const before = longitudeOfDate(planet, new Date(utc.getTime() - dtMs));
    const after = longitudeOfDate(planet, new Date(utc.getTime() + dtMs));
    return angleDiff(after, before) * 12; // per 2 h → per day
  },

  siderealTimeDeg(utc: Date): number {
    return norm360(Astronomy.SiderealTime(utc) * 15);
  },

  declination(planet: Planet, utc: Date): number {
    // Ecliptic() already precesses to the true ecliptic of date; rotating its
    // latitude/longitude back through the (mean) obliquity gives the of-date
    // equatorial declination. Nutation (±9″) is negligible at the ~1° orbs
    // declination aspects are read at.
    const ecl = Astronomy.Ecliptic(Astronomy.GeoVector(BODY[planet], utc, true));
    const beta = ecl.elat * DEG;
    const lambda = ecl.elon * DEG;
    const eps = meanObliquity(utc) * DEG;
    const sinDec =
      Math.sin(beta) * Math.cos(eps) +
      Math.cos(beta) * Math.sin(eps) * Math.sin(lambda);
    return Math.asin(sinDec) / DEG;
  },
};
