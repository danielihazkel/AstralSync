import type { HouseSystem } from "@astralsync/astro-core";

/**
 * The "what changed" note stored on a new snapshot version (AstroSnapshot
 * .note): a short, human-readable diff of the compute-relevant fields
 * between the previous state and the edit that produced the version. Pure —
 * the caller passes both sides — so the wording is tested without a DB.
 */

/** The compute-relevant fields, as stored (`before`) and as submitted
 *  (`after`); everything else on a profile is presentational. */
export interface SnapshotNoteInput {
  /** "YYYY-MM-DD" */
  birthDate: string;
  /** "HH:MM" or null. */
  birthTime: string | null;
  timeCertainty: "exact" | "approx" | "unknown";
  birthLat: number;
  birthLng: number;
  /** City label when known, else null (coordinates are always compared). */
  placeLabel: string | null;
  tzIana: string;
  /** Manual offset override in minutes, or null when resolved automatically. */
  overrideOffsetMinutes: number | null;
  fullBirthName: string | null;
  hebrewBirthName: string | null;
  houseSystem: HouseSystem;
}

const HOUSE_SYSTEM_LABEL: Record<HouseSystem, string> = {
  placidus: "Placidus",
  whole_sign: "Whole Sign",
  equal: "Equal House",
};

const CERTAINTY_LABEL = {
  exact: "exact",
  approx: "approximate",
  unknown: "unknown",
} as const;

export const MAX_NOTE_LENGTH = 400;

function offsetLabel(minutes: number | null): string {
  if (minutes === null) return "automatic";
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `manual UTC${sign}${h}:${m}`;
}

function placeLabel(s: SnapshotNoteInput): string {
  return s.placeLabel ?? `${s.birthLat.toFixed(2)}°, ${s.birthLng.toFixed(2)}°`;
}

/** Null when nothing compute-relevant differs (the caller then makes no new
 *  version). Clauses are joined with " · " and clipped to the column width. */
export function describeSnapshotChange(
  before: SnapshotNoteInput,
  after: SnapshotNoteInput,
): string | null {
  const parts: string[] = [];
  if (before.birthDate !== after.birthDate) {
    parts.push(`Birth date: ${before.birthDate} → ${after.birthDate}`);
  }
  if (before.birthTime !== after.birthTime) {
    parts.push(
      `Birth time: ${before.birthTime ?? "unknown"} → ${after.birthTime ?? "unknown"}`,
    );
  }
  if (before.timeCertainty !== after.timeCertainty) {
    parts.push(
      `Time certainty: ${CERTAINTY_LABEL[before.timeCertainty]} → ${CERTAINTY_LABEL[after.timeCertainty]}`,
    );
  }
  if (before.birthLat !== after.birthLat || before.birthLng !== after.birthLng) {
    parts.push(`Birthplace: ${placeLabel(before)} → ${placeLabel(after)}`);
  }
  if (before.tzIana !== after.tzIana) {
    parts.push(`Time zone: ${before.tzIana} → ${after.tzIana}`);
  }
  if (before.overrideOffsetMinutes !== after.overrideOffsetMinutes) {
    parts.push(
      `UTC offset: ${offsetLabel(before.overrideOffsetMinutes)} → ${offsetLabel(after.overrideOffsetMinutes)}`,
    );
  }
  // Names feed numerology, not the chart — say that they changed without
  // echoing them (the note is shown on every version row).
  if (before.fullBirthName !== after.fullBirthName) {
    parts.push(
      after.fullBirthName === null
        ? "Birth name removed"
        : before.fullBirthName === null
          ? "Birth name added"
          : "Birth name changed",
    );
  }
  if (before.hebrewBirthName !== after.hebrewBirthName) {
    parts.push(
      after.hebrewBirthName === null
        ? "Hebrew name removed"
        : before.hebrewBirthName === null
          ? "Hebrew name added"
          : "Hebrew name changed",
    );
  }
  if (before.houseSystem !== after.houseSystem) {
    parts.push(
      `House system: ${HOUSE_SYSTEM_LABEL[before.houseSystem]} → ${HOUSE_SYSTEM_LABEL[after.houseSystem]}`,
    );
  }
  if (parts.length === 0) return null;
  const note = parts.join(" · ");
  return note.length > MAX_NOTE_LENGTH
    ? `${note.slice(0, MAX_NOTE_LENGTH - 1)}…`
    : note;
}
