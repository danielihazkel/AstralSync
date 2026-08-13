import { find } from "geo-tz";

/**
 * Offline timezone resolution (PRD §4.3): geo-tz maps lat/lng → IANA zone,
 * then Node's built-in IANA database (via Intl) resolves the historical UTC
 * offset for the birth moment, including DST.
 *
 * Known limitation, surfaced as a warning: historical offsets before ~1970
 * are imperfect in every available database (zones often report the LMT of
 * the country's reference city, not the birth city). Onboarding must always
 * show the resolved offset and allow manual override (PRD §3.1).
 */

export type TzWarning =
  | "pre_1970_offset_uncertain"
  | "dst_gap"
  | "dst_ambiguous";

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number;
  minute: number;
}

export interface ResolvedBirthMoment {
  utc: Date;
  offsetMinutes: number;
  warnings: TzWarning[];
}

/** IANA timezone for coordinates, resolved fully offline. */
export function timezoneFor(lat: number, lng: number): string {
  const zones = find(lat, lng);
  if (zones.length === 0) {
    throw new Error(`No timezone found for ${lat}, ${lng}`);
  }
  return zones[0];
}

/**
 * Whether `zone` names a timezone the runtime's IANA database knows —
 * validates client-supplied zones (manual-location onboarding) before they
 * reach offset resolution. Pure: an Intl constructor probe, no geo lookup.
 */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function parseGmtOffset(value: string): number {
  // Formats seen from ICU: "GMT", "GMT+2", "GMT+05:30", "GMT+00:53:28" (LMT).
  const m = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const minutes =
    Number(m[2]) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60;
  return sign * Math.round(minutes);
}

/** UTC offset in minutes (east positive) of `zone` at a UTC instant. */
export function offsetMinutesAt(zone: string, utc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(utc);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return parseGmtOffset(name);
}

/**
 * Convert a local wall-clock birth time to a UTC instant.
 *
 * DST edge handling (Temporal "compatible" semantics):
 * - a time skipped by a spring-forward gap is shifted forward past the gap
 *   and flagged `dst_gap`;
 * - a time repeated by a fall-back fold resolves to the earlier instant
 *   (the DST side) and is flagged `dst_ambiguous`.
 */
export function resolveBirthMoment(
  zone: string,
  wall: WallTime,
): ResolvedBirthMoment {
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  );
  const dayMs = 86_400_000;
  const before = offsetMinutesAt(zone, new Date(wallAsUtc - dayMs));
  const after = offsetMinutesAt(zone, new Date(wallAsUtc + dayMs));
  const candidates = [...new Set([before, after])];
  const valid = candidates.filter(
    (o) => offsetMinutesAt(zone, new Date(wallAsUtc - o * 60_000)) === o,
  );

  const warnings: TzWarning[] = [];
  let offsetMinutes: number;
  if (valid.length === 1) {
    offsetMinutes = valid[0];
  } else if (valid.length > 1) {
    // Fold: both offsets reproduce the wall time; larger offset = earlier instant.
    offsetMinutes = Math.max(...valid);
    warnings.push("dst_ambiguous");
  } else {
    // Gap: the wall time never existed; use the pre-transition offset, which
    // lands just after the gap.
    offsetMinutes = before;
    warnings.push("dst_gap");
  }

  if (wall.year < 1970) warnings.push("pre_1970_offset_uncertain");

  return {
    utc: new Date(wallAsUtc - offsetMinutes * 60_000),
    offsetMinutes,
    warnings,
  };
}
