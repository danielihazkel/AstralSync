import { meanObliquity, norm360 } from "./angles";
import { detectAspects } from "./aspects";
import { astronomyEngineProvider } from "./ephemeris/astronomyEngine";
import type { EphemerisProvider } from "./ephemeris/interface";
import { computeHouses, houseOf } from "./houses";
import type {
  ChartInput,
  ChartSnapshot,
  Placement,
  Sign,
  Uncertainty,
} from "./types";
import { DEFAULT_ORBS, PLANETS, SIGNS } from "./types";

export function signOf(longitude: number): Sign {
  return SIGNS[Math.floor(norm360(longitude) / 30) % 12];
}

/** Degrees to the nearest sign boundary (cusp), [0, 15]. */
function distanceToSignCusp(longitude: number): number {
  const inSign = norm360(longitude) % 30;
  return Math.min(inSign, 30 - inSign);
}

/**
 * Build a natal chart snapshot (PRD §3.2, §4.2).
 *
 * Pure function of (UTC instant, coordinates, options): no I/O, no clock, no
 * timezone logic. Solar-chart mode ('unknown' time certainty) suppresses the
 * Ascendant and houses and flags the Moon when its sign is time-sensitive.
 */
export function buildChart(
  input: ChartInput,
  provider: EphemerisProvider = astronomyEngineProvider,
): ChartSnapshot {
  const houseSystem = input.houseSystem ?? "placidus";
  const timeCertainty = input.timeCertainty ?? "exact";
  const orbs = input.orbs ?? DEFAULT_ORBS;
  const isSolarChart = timeCertainty === "unknown";
  const uncertainties: Uncertainty[] = [];

  const longitudes = PLANETS.map((planet) => ({
    planet,
    longitude: provider.eclipticLongitude(planet, input.utc),
    retrograde: provider.isRetrograde(planet, input.utc),
  }));

  let houses = null;
  if (!isSolarChart) {
    const eps = meanObliquity(input.utc);
    const ramc = norm360(provider.siderealTimeDeg(input.utc) + input.longitude);
    houses = computeHouses(houseSystem, ramc, input.latitude, eps);
    if (houses.fallbackApplied) {
      uncertainties.push({
        field: "houses",
        reason:
          "Placidus is undefined at this latitude; Whole Sign houses were used instead.",
      });
    }
  } else {
    uncertainties.push(
      {
        field: "ascendant",
        reason: "Birth time unknown: the Ascendant cannot be computed.",
      },
      {
        field: "houses",
        reason: "Birth time unknown: house placements cannot be computed.",
      },
    );
  }

  const placements: Placement[] = longitudes.map(
    ({ planet, longitude, retrograde }) => ({
      planet,
      longitude,
      sign: signOf(longitude),
      degreeInSign: norm360(longitude) % 30,
      house: houses ? houseOf(longitude, houses.cusps) : null,
      retrograde,
    }),
  );

  const moon = placements.find((p) => p.planet === "moon")!;
  if (isSolarChart && distanceToSignCusp(moon.longitude) <= 7.5) {
    // The Moon moves ~13°/day, so ±12h of time uncertainty is ~±7° of motion.
    uncertainties.push({
      field: "moon_sign",
      reason:
        "Birth time unknown and the noon Moon is near a sign boundary: the Moon sign is uncertain.",
    });
  }
  if (timeCertainty === "approx") {
    uncertainties.push(
      {
        field: "ascendant",
        reason:
          "Birth time approximate: the Ascendant moves ~1° every 4 minutes.",
      },
      {
        field: "houses",
        reason: "Birth time approximate: house placements may shift.",
      },
    );
    if (distanceToSignCusp(moon.longitude) <= 2.5) {
      // ±2h of time uncertainty is ~±1° of Moon motion; 2.5° adds margin.
      uncertainties.push({
        field: "moon_sign",
        reason:
          "Birth time approximate and the Moon is near a sign boundary: the Moon sign is uncertain.",
      });
    }
  }

  const sun = placements.find((p) => p.planet === "sun")!;
  return {
    schemaVersion: 1,
    input: {
      utc: input.utc.toISOString(),
      latitude: input.latitude,
      longitude: input.longitude,
      houseSystem,
      timeCertainty,
    },
    isSolarChart,
    houses,
    placements,
    aspects: detectAspects(placements, orbs),
    bigThree: {
      sun: sun.sign,
      moon: moon.sign,
      ascendant: houses ? signOf(houses.ascendant) : null,
    },
    uncertainties,
    engine: { name: provider.name, version: provider.version },
  };
}
