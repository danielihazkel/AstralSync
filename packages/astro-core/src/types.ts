export type HouseSystem = "placidus" | "whole_sign" | "equal";
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
  | "opposition";

export interface OrbConfig {
  /** Max orb in degrees when either body is the Sun or Moon. */
  luminary: number;
  /** Max orb in degrees for all other pairs. */
  default: number;
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
  /** Exact angle of this aspect type (0, 60, 90, 120, 180). */
  angle: number;
  /** Deviation from exact, degrees. */
  orb: number;
}

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
