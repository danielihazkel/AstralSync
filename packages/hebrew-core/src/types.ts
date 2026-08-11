export type TimeCertainty = "exact" | "approx" | "unknown";

/** Gregorian civil date, 1-based month. */
export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

export interface MazalInput {
  /**
   * Local civil (wall-clock) birth date at the birthplace, as entered by the
   * user. Taken as ground truth rather than derived from `utc` — the app's
   * manual offset override can make an Intl-derived date disagree with what
   * the user typed for near-midnight births.
   */
  civilDate: CivilDate;
  /**
   * The birth moment as a UTC instant, resolved by the caller (hebrew-core
   * does no timezone arithmetic, same stance as astro-core). For unknown
   * birth time, the caller passes local noon converted to UTC.
   */
  utc: Date;
  /** Geographic latitude in degrees, north positive. */
  latitude: number;
  /** Geographic longitude in degrees, east positive. */
  longitude: number;
  /** IANA zone id, forwarded verbatim to hebcal's GeoLocation for zmanim. */
  tzId: string;
  timeCertainty?: TimeCertainty;
}

/**
 * Hebrew month content keys. Adar I and Adar II collapse to the single
 * `adar` key (they share a mazal and Sefer Yetzirah row); display names
 * preserve the distinction via `HebrewDateParts.monthName`.
 */
export type HebrewMonthKey =
  | "nisan"
  | "iyyar"
  | "sivan"
  | "tamuz"
  | "av"
  | "elul"
  | "tishrei"
  | "cheshvan"
  | "kislev"
  | "tevet"
  | "shvat"
  | "adar";

/** Nisan-first order, matching the mazalot cycle (Nisan = Aries). */
export const HEBREW_MONTH_KEYS: readonly HebrewMonthKey[] = [
  "nisan",
  "iyyar",
  "sivan",
  "tamuz",
  "av",
  "elul",
  "tishrei",
  "cheshvan",
  "kislev",
  "tevet",
  "shvat",
  "adar",
] as const;

/**
 * The seven classical planets. String values intentionally match
 * astro-core's `Planet` strings so Phase 2d can reuse the existing glyphs.
 */
export type ClassicalPlanet =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn";

export type DateAmbiguity =
  | "unknown_time"
  | "approx_time_near_sunset"
  | "no_sunset_polar";

export interface HebrewDateParts {
  /** Hebrew year, e.g. 5769. */
  year: number;
  /** hebcal month numbering: 1=Nisan … 12=Adar/Adar I, 13=Adar II. */
  month: number;
  /** Day of the Hebrew month, 1–30. */
  day: number;
  /** Content key; Adar I/II collapsed to "adar". */
  monthKey: HebrewMonthKey;
  /** Transliterated display name, Adar I/II distinction preserved. */
  monthName: string;
  /** Day of week, 0=Sunday … 6=Saturday. */
  weekday: number;
  /** Traditional Hebrew rendering, e.g. 'ט״ו חֶשְׁוָן תשס״ט' (default nikud form). */
  renderGematriya: string;
}

export interface HebrewBirthDate {
  /** Hebrew date of the civil daytime date. */
  civil: HebrewDateParts;
  /** Sunset-adjusted date (== civil unless `afterSunset`). */
  effective: HebrewDateParts;
  /**
   * True when the birth instant is at or after sunset of the civil date, so
   * the Hebrew day has already rolled over. Early-morning births need no
   * flip: Hebrew day H(D) spans sunset(D−1) → sunset(D), so the civil
   * daytime mapping already holds before sunset.
   */
  afterSunset: boolean;
  /** Sunset of the civil date as an ISO instant; null when not computable (polar). */
  sunsetUtc: string | null;
  ambiguity: DateAmbiguity | null;
}

export interface MazalEntry {
  month: HebrewMonthKey;
  /** Transliteration slug — stable content key for Phase 2c. */
  mazal: string;
  hebrew: string;
  /** astro-core Sign string, for glyph reuse in Phase 2d. */
  sign: string;
}

export interface SeferYetzirahEntry {
  month: HebrewMonthKey;
  letter: string;
  letterName: string;
  /** Transliteration slug — stable content key. */
  tribe: string;
  tribeHebrew: string;
  /** English key, stable for content. */
  faculty: string;
  facultyHebrew: string;
}

export interface DayPlanetResult {
  /** Weekday of the sunset-adjusted effective date, 0=Sunday. */
  weekday: number;
  planet: ClassicalPlanet;
  /** True when date ambiguity could flip the weekday (any non-null ambiguity). */
  ambiguous: boolean;
}

export interface PlanetaryHourResult {
  planet: ClassicalPlanet;
  /** 1–12 within the day or night half. */
  hourIndex: number;
  isDay: boolean;
  /** Ruler of the planetary day (sunrise-to-sunrise). */
  dayRuler: ClassicalPlanet;
  /** ISO instants bounding the birth hour. */
  startUtc: string;
  endUtc: string;
  /** True for approximate birth time — hour boundaries shift with the time. */
  uncertain: boolean;
}

/** Same shape as astro-core: machine-stable snake_case field + human sentence. */
export interface Uncertainty {
  field: string;
  reason: string;
}

export interface MazalChart {
  schemaVersion: 1;
  input: {
    civilDate: CivilDate;
    utc: string;
    latitude: number;
    longitude: number;
    tzId: string;
    timeCertainty: TimeCertainty;
  };
  hebrewDate: HebrewBirthDate;
  /** Keyed by the effective (sunset-adjusted) month. */
  mazal: MazalEntry;
  seferYetzirah: SeferYetzirahEntry;
  dayPlanet: DayPlanetResult;
  /** Null for unknown birth time or when no sunrise/sunset exists (polar). */
  planetaryHour: PlanetaryHourResult | null;
  uncertainties: Uncertainty[];
  engine: { name: string; version: string };
}
