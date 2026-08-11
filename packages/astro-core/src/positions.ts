import { norm360 } from "./angles";
import { signOf } from "./chart";
import { astronomyEngineProvider } from "./ephemeris/astronomyEngine";
import type { EphemerisProvider } from "./ephemeris/interface";
import { houseOf } from "./houses";
import type { Placement } from "./types";
import { PLANETS } from "./types";

/** Placements at an arbitrary UTC instant — no houses or angles (`house` is
 *  null; overlay against another chart's cusps with `overlayHouses`). The
 *  lean input to transits and synastry: pure function of (instant, provider),
 *  like `buildChart` minus the location-dependent parts. */
export function positionsAt(
  utc: Date,
  provider: EphemerisProvider = astronomyEngineProvider,
): Placement[] {
  return PLANETS.map((planet) => {
    const longitude = provider.eclipticLongitude(planet, utc);
    return {
      planet,
      longitude,
      sign: signOf(longitude),
      degreeInSign: norm360(longitude) % 30,
      house: null,
      retrograde: provider.isRetrograde(planet, utc),
    };
  });
}

/** Locate placements in another chart's houses ("her Sun in his 7th",
 *  "transiting Saturn in the natal 4th"). Null cusps (solar chart) leaves the
 *  placements' houses unchanged. */
export function overlayHouses(
  placements: Placement[],
  cusps: number[] | null,
): Placement[] {
  if (!cusps) return placements;
  return placements.map((p) => ({ ...p, house: houseOf(p.longitude, cusps) }));
}
