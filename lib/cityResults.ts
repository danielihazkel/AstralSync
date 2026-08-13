/**
 * Pure helpers for the offline city search: substring-match ranking and the
 * per-row result mapping. Kept Prisma-free so the ranking rules and the
 * bad-row guard are unit-testable (repo discipline: logic in lib, IO in the
 * route).
 */

export interface RankableCity {
  name: string;
  asciiName: string;
  population: number;
}

export interface CityRow extends RankableCity {
  geonameId: number;
  countryCode: string;
  admin1: string | null;
  lat: number;
  lng: number;
}

export interface CityResult {
  geonameId: number;
  name: string;
  countryCode: string;
  admin1: string | null;
  lat: number;
  lng: number;
  tzIana: string;
}

// Characters that separate words inside GeoNames city names.
const WORD_BREAK = /[\s\-'’.(]/;

/**
 * Match quality of `city` for `query` (lower is better): 0 = name starts
 * with the query, 1 = a later word starts with it ("york" in "New York"),
 * 2 = plain substring, 3 = no match (possible when the DB matched on a
 * column variant the ranker normalizes differently).
 */
export function cityRank(city: RankableCity, query: string): number {
  const q = query.toLowerCase();
  let best = 3;
  for (const raw of [city.name, city.asciiName]) {
    const name = raw.toLowerCase();
    const at = name.indexOf(q);
    if (at < 0) continue;
    let rank: number;
    if (at === 0) rank = 0;
    else if (WORD_BREAK.test(name[at - 1])) rank = 1;
    else rank = 2;
    best = Math.min(best, rank);
  }
  return best;
}

/** Order by match quality, then population; keep the best `limit`. */
export function rankCities<T extends RankableCity>(
  cities: T[],
  query: string,
  limit: number,
): T[] {
  return cities
    .map((city) => ({ city, rank: cityRank(city, query) }))
    .sort((a, b) => a.rank - b.rank || b.city.population - a.city.population)
    .slice(0, limit)
    .map((r) => r.city);
}

/**
 * Map a DB row to an API result. `resolveTz` (geo-tz in production) throws
 * for coordinates outside every zone polygon; such a row is unusable for
 * onboarding (no offset preview), so it is dropped rather than failing the
 * whole search.
 */
export function toCityResult(
  row: CityRow,
  resolveTz: (lat: number, lng: number) => string,
): CityResult | null {
  try {
    return {
      geonameId: row.geonameId,
      name: row.name,
      countryCode: row.countryCode,
      admin1: row.admin1,
      lat: row.lat,
      lng: row.lng,
      tzIana: resolveTz(row.lat, row.lng),
    };
  } catch {
    console.warn(`[cities] dropping geonameId ${row.geonameId}: no timezone`);
    return null;
  }
}
