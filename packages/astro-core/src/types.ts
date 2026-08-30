export type HouseSystem =
  | "placidus"
  | "whole_sign"
  | "equal"
  | "porphyry"
  | "koch"
  | "regiomontanus"
  | "campanus"
  | "alcabitius";
export type TimeCertainty = "exact" | "approx" | "unknown";

export type Planet =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export const PLANETS: Planet[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

export type Sign =
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius"
  | "capricorn"
  | "aquarius"
  | "pisces";

export const SIGNS: Sign[] = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

export type AspectType =
  | "conjunction"
  | "sextile"
  | "square"
  | "trine"
  | "opposition"
  | "quincunx"
  | "semisextile"
  | "semisquare"
  | "sesquiquadrate"
  | "quintile";

export interface OrbConfig {
  /** Max orb in degrees when either body is the Sun or Moon. */
  luminary: number;
  /** Max orb in degrees for all other pairs. */
  default: number;
  /** Max orb in degrees for minor aspects (all pairs); defaults to 2 when
   *  minor aspects are requested. */
  minor?: number;
}

export const DEFAULT_ORBS: OrbConfig = { luminary: 8, default: 6 };

export interface ChartInput {
  /**
   * The birth moment as a UTC instant. Timezone resolution is the caller's
   * responsibility (astro-core is pure math). For unknown birth time, the
   * caller should pass local noon converted to UTC.
   */
  utc: Date;
  /** Geographic latitude in degrees, north positive. */
  latitude: number;
  /** Geographic longitude in degrees, east positive. */
  longitude: number;
  houseSystem?: HouseSystem;
  timeCertainty?: TimeCertainty;
  orbs?: OrbConfig;
}

export interface Placement {
  planet: Planet;
  /** Tropical ecliptic longitude of date, degrees [0, 360). */
  longitude: number;
  sign: Sign;
  /** Degrees into the sign, [0, 30). */
  degreeInSign: number;
  /** 1–12, or null on a solar chart. */
  house: number | null;
  retrograde: boolean;
}

export interface Aspect {
  a: Planet;
  b: Planet;
  type: AspectType;
  /** Exact angle of this aspect type (e.g. 0, 60, 90, 120, 180). */
  angle: number;
  /** Deviation from exact, degrees. */
  orb: number;
}

/** An aspect between two different charts: `a` belongs to the moving/partner
 *  chart, `b` to the natal/reference chart. Same-planet pairs are meaningful
 *  here (e.g. transit Sun conjunct natal Sun). Never stored in ChartSnapshot —
 *  cross-chart results are ephemeral reads. */
export interface CrossAspect {
  a: Planet;
  b: Planet;
  type: AspectType;
  /** Exact angle of this aspect type (e.g. 0, 60, 90, 120, 180). */
  angle: number;
  /** Deviation from exact, degrees. */
  orb: number;
}

/** Tighter orbs for transit reading; synastry keeps DEFAULT_ORBS. */
export const DEFAULT_TRANSIT_ORBS: OrbConfig = { luminary: 3, default: 2 };

export interface Houses {
  /** The system actually used (may differ from requested after fallback). */
  system: HouseSystem;
  /** Requested system, recorded when a fallback was applied. */
  requestedSystem: HouseSystem;
  /** True when Placidus degenerated at high latitude and Whole Sign was used. */
  fallbackApplied: boolean;
  /** Cusp longitudes, index 0 = 1st house cusp. */
  cusps: number[];
  ascendant: number;
  mc: number;
}

export interface Uncertainty {
  field: string;
  reason: string;
}

export interface ChartSnapshot {
  schemaVersion: 1;
  input: {
    utc: string;
    latitude: number;
    longitude: number;
    houseSystem: HouseSystem;
    timeCertainty: TimeCertainty;
  };
  isSolarChart: boolean;
  /** Null on a solar chart. */
  houses: Houses | null;
  placements: Placement[];
  aspects: Aspect[];
  bigThree: { sun: Sign; moon: Sign; ascendant: Sign | null };
  uncertainties: Uncertainty[];
  engine: { name: string; version: string };
}
