import {
  PLANETS,
  SIGNS,
  astronomyEngineProvider,
  findIngresses,
  findStations,
  pointsAt,
  positionsAt,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";

/**
 * The ephemeris table: daily 0h UT positions of the ten planets and the
 * true North Node for one civil month, with sign ingresses and stations
 * marked on the days they fall. Pure over the bundled engine (no DB) so the
 * /ephemeris page computes it in-browser via dynamic import, the Sky
 * Calendar way — and works offline. Also the app's own cross-check against
 * a published ephemeris.
 */

const DAY_MS = 86_400_000;

export interface EphemerisPosition {
  longitude: number;
  sign: Sign;
  degreeInSign: number;
  retrograde: boolean;
}

export interface EphemerisDay {
  /** "YYYY-MM-DD" (UTC civil date, positions at 0h UT). */
  date: string;
  positions: Record<Planet, EphemerisPosition>;
  northNode: EphemerisPosition;
  /** Human-readable markers for events on this UTC day. */
  events: string[];
}

export interface EphemerisMonth {
  year: number;
  month: number;
  days: EphemerisDay[];
  engine: { name: string; version: string };
}

const SIGN_ABBR: Record<Sign, string> = {
  aries: "Ari",
  taurus: "Tau",
  gemini: "Gem",
  cancer: "Can",
  leo: "Leo",
  virgo: "Vir",
  libra: "Lib",
  scorpio: "Sco",
  sagittarius: "Sag",
  capricorn: "Cap",
  aquarius: "Aqu",
  pisces: "Pis",
};

const PLANET_ABBR: Record<Planet, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mer",
  venus: "Ven",
  mars: "Mar",
  jupiter: "Jup",
  saturn: "Sat",
  uranus: "Ura",
  neptune: "Nep",
  pluto: "Plu",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toPosition(longitude: number, retrograde: boolean): EphemerisPosition {
  const norm = ((longitude % 360) + 360) % 360;
  return {
    longitude: norm,
    sign: SIGNS[Math.floor(norm / 30)],
    degreeInSign: norm % 30,
    retrograde,
  };
}

export function computeEphemerisMonth(year: number, month: number): EphemerisMonth {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const daysInMonth = Math.round((next.getTime() - first.getTime()) / DAY_MS);

  // Events over the month, keyed by UTC date.
  const events = new Map<string, string[]>();
  const push = (utc: Date, text: string) => {
    const key = utc.toISOString().slice(0, 10);
    const list = events.get(key) ?? [];
    list.push(text);
    events.set(key, list);
  };
  for (const planet of PLANETS) {
    for (const ing of findIngresses(planet, first, next)) {
      const hh = `${pad(ing.utc.getUTCHours())}:${pad(ing.utc.getUTCMinutes())}`;
      push(
        ing.utc,
        `${PLANET_ABBR[planet]}${ing.ascending ? " → " : " ℞ → "}${SIGN_ABBR[SIGNS[ing.signIndex]]} ${hh} UT`,
      );
    }
  }
  for (const st of findStations(first, next)) {
    const hh = `${pad(st.utc.getUTCHours())}:${pad(st.utc.getUTCMinutes())}`;
    push(st.utc, `${PLANET_ABBR[st.planet]} stations ${st.direction === "retrograde" ? "℞" : "D"} ${hh} UT`);
  }

  const days: EphemerisDay[] = [];
  for (let d = 0; d < daysInMonth; d++) {
    const utc = new Date(first.getTime() + d * DAY_MS);
    const date = utc.toISOString().slice(0, 10);
    const placements = positionsAt(utc);
    const positions = Object.fromEntries(
      placements.map((p) => [p.planet, toPosition(p.longitude, p.retrograde)]),
    ) as Record<Planet, EphemerisPosition>;
    const node = pointsAt(utc, "true").find((p) => p.point === "north_node")!;
    days.push({
      date,
      positions,
      northNode: toPosition(node.longitude, node.retrograde),
      events: events.get(date) ?? [],
    });
  }
  return {
    year,
    month,
    days,
    engine: {
      name: astronomyEngineProvider.name,
      version: astronomyEngineProvider.version,
    },
  };
}

/** "12°34′ Ari" — the ephemeris column format (arc-minutes, no seconds). */
export function formatEphemerisPosition(p: EphemerisPosition): string {
  const deg = Math.floor(p.degreeInSign);
  const min = Math.round((p.degreeInSign - deg) * 60);
  const [dd, mm] = min === 60 ? [deg + 1, 0] : [deg, min];
  return `${pad(dd)}°${pad(mm)}′ ${SIGN_ABBR[p.sign]}${p.retrograde ? " ℞" : ""}`;
}

/** CSV with absolute longitudes (decimal degrees) — the exchange format. */
export function ephemerisCsv(month: EphemerisMonth): string {
  const header = ["date", ...PLANETS, "north_node", "events"].join(",");
  const rows = month.days.map((d) =>
    [
      d.date,
      ...PLANETS.map((p) => {
        const pos = d.positions[p];
        return `${pos.longitude.toFixed(4)}${pos.retrograde ? "R" : ""}`;
      }),
      d.northNode.longitude.toFixed(4),
      `"${d.events.join("; ").replace(/"/g, '""')}"`,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
