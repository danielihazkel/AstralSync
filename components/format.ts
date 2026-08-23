import type {
  AngleBody,
  AspectType,
  DeclinationAspectType,
  EssentialDignity,
  HouseSystem,
  Planet,
  PointName,
  Sign,
  SolarCondition,
} from "@astralsync/astro-core";
import type { ClassicalPlanet, HebrewMonthKey } from "@astralsync/hebrew-core";
import type { TzWarning } from "@/lib/tz";

/** Pure display formatters and label maps shared across the UI. */

export const SIGN_NAMES: Record<Sign, string> = {
  aries: "Aries",
  taurus: "Taurus",
  gemini: "Gemini",
  cancer: "Cancer",
  leo: "Leo",
  virgo: "Virgo",
  libra: "Libra",
  scorpio: "Scorpio",
  sagittarius: "Sagittarius",
  capricorn: "Capricorn",
  aquarius: "Aquarius",
  pisces: "Pisces",
};

export const PLANET_NAMES: Record<Planet, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
};

/** The chart angles for read-time angle-aspect rows ("Venus conj Ascendant"). */
export const ANGLE_NAMES: Record<AngleBody, string> = {
  ascendant: "Ascendant",
  mc: "Midheaven",
};

/** Compact angle markers for the glyph slot in tables. */
export const ANGLE_GLYPH_LABELS: Record<AngleBody, string> = {
  ascendant: "ASC",
  mc: "MC",
};

/** Essential dignity states (classical seven-planet doctrine). */
export const DIGNITY_NAMES: Record<EssentialDignity, string> = {
  domicile: "Domicile",
  exaltation: "Exaltation",
  detriment: "Detriment",
  fall: "Fall",
};

/** Solar conditions by separation from the Sun. */
export const SOLAR_CONDITION_NAMES: Record<SolarCondition, string> = {
  cazimi: "Cazimi",
  combust: "Combust",
  under_beams: "Under beams",
};

/** Declination aspects (read-time, fixed 1° orb). */
export const DECLINATION_ASPECT_NAMES: Record<DeclinationAspectType, string> = {
  parallel: "Parallel",
  contraparallel: "Contraparallel",
};

/** Calculated chart points (nodes, Lilith, Fortune) — ephemeral, never stored. */
export const POINT_NAMES: Record<PointName, string> = {
  north_node: "North Node",
  south_node: "South Node",
  lilith: "Lilith",
  part_of_fortune: "Part of Fortune",
};

/** The seven classical planets of the Mazal chart (English chrome). */
export const CLASSICAL_PLANET_LABELS: Record<ClassicalPlanet, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
};

export const HEBREW_MONTH_LABELS: Record<HebrewMonthKey, string> = {
  nisan: "Nisan",
  iyyar: "Iyyar",
  sivan: "Sivan",
  tamuz: "Tamuz",
  av: "Av",
  elul: "Elul",
  tishrei: "Tishrei",
  cheshvan: "Cheshvan",
  kislev: "Kislev",
  tevet: "Tevet",
  shvat: "Shvat",
  adar: "Adar",
};

/** Index 0 = Sunday, matching hebrew-core's weekday numbering. */
export const HEBREW_WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Shabbat",
] as const;

export const ASPECT_NAMES: Record<AspectType, string> = {
  conjunction: "Conjunction",
  sextile: "Sextile",
  square: "Square",
  trine: "Trine",
  opposition: "Opposition",
  quincunx: "Quincunx",
  semisextile: "Semisextile",
  semisquare: "Semisquare",
  sesquiquadrate: "Sesquiquadrate",
  quintile: "Quintile",
};

/** Relational phrasing for the major angles ("Venus trine Jupiter") — used
 *  where an event carries the perfected angle rather than an AspectType. */
export const MAJOR_ANGLE_NAMES: Record<number, string> = {
  0: "conjunct",
  60: "sextile",
  90: "square",
  120: "trine",
  180: "opposite",
};

export const HOUSE_SYSTEM_NAMES: Record<HouseSystem, string> = {
  placidus: "Placidus",
  whole_sign: "Whole Sign",
  equal: "Equal House",
};

export const TZ_WARNING_COPY: Record<TzWarning, string> = {
  pre_1970_offset_uncertain:
    "Timezone records before 1970 are imperfect in every available database. Please verify this offset against the birth record, or override it manually.",
  dst_gap:
    "This wall-clock time falls in a daylight-saving gap (clocks sprang forward past it). The moment just after the gap was used.",
  dst_ambiguous:
    "This wall-clock time occurred twice (clocks fell back across it). The earlier of the two moments was used.",
};

/** Minutes east of UTC → "UTC+02:00" / "UTC−05:30" / "UTC±00:00". */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

/** Degrees into a sign → "15°32′". */
export function formatDegreeInSign(deg: number): string {
  let d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  if (m === 60) {
    d += 1;
    m = 0;
  }
  return `${d}°${String(m).padStart(2, "0")}′`;
}

/** "23°26′ N" / "5°09′ S" for a signed declination (N positive). */
export function formatDeclination(dec: number): string {
  return `${formatDegreeInSign(Math.abs(dec))} ${dec < 0 ? "S" : "N"}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "YYYY-MM-DD" → "March 4, 1990" (locale-independent, SSR-safe). */
export function formatBirthDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export const TIME_CERTAINTY_LABELS: Record<string, string> = {
  exact: "Exact time",
  approx: "Approximate time",
  unknown: "Unknown time",
};
