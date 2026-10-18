import { DEG, meanObliquity, norm360 } from "./angles";
import { astronomyEngineProvider } from "./ephemeris/astronomyEngine";
import type { EphemerisProvider } from "./ephemeris/interface";

/** Right ascension of an ecliptic longitude on the ecliptic (latitude 0),
 *  degrees [0, 360). Preserves quadrant. */
export function eclipticToRightAscension(longitude: number, eps: number): number {
  const l = longitude * DEG;
  return norm360(
    Math.atan2(Math.sin(l) * Math.cos(eps * DEG), Math.cos(l)) / DEG,
  );
}

/** RAMC of a chart cast for `utc` at east longitude `lng`, degrees. */
export function ramcAt(
  utc: Date,
  lng: number,
  provider: EphemerisProvider = astronomyEngineProvider,
): number {
  return norm360(provider.siderealTimeDeg(utc) + lng);
}

/**
 * The progressed RAMC by solar arc in right ascension: the natal RAMC
 * advanced by the progressed Sun's motion in RA since birth (~1° a year).
 *
 * Casting the progressed chart at the progressed instant itself (the
 * quotidian method) is not an alternative here: sidereal time turns ~361°
 * per ephemeris day, so each progressed day — each year of life — spins the
 * angles a full circle and the fractional year places them anywhere.
 */
export function progressedRamc(
  natalUtc: Date,
  progressedUtc: Date,
  lng: number,
  provider: EphemerisProvider = astronomyEngineProvider,
): number {
  const natalSunRa = eclipticToRightAscension(
    provider.eclipticLongitude("sun", natalUtc),
    meanObliquity(natalUtc),
  );
  const progressedSunRa = eclipticToRightAscension(
    provider.eclipticLongitude("sun", progressedUtc),
    meanObliquity(progressedUtc),
  );
  return norm360(
    ramcAt(natalUtc, lng, provider) + (progressedSunRa - natalSunRa),
  );
}
