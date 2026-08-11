import type { ClassicalPlanet, HebrewMonthKey } from "@astralsync/hebrew-core";
import {
  contentRoot,
  getEntry,
  loadContentIndex,
  LOCALE_DIRECTION,
  type ContentIndex,
} from "./content";
import type { StoredHebrewGematria, StoredMazal } from "./view-types";

/**
 * Resolver for the Hebrew (Mazal) reading — the `content/he` counterpart of
 * `resolveReading` in lib/content.ts. Same degradation contract: missing
 * entries are collected in `missingKeys`, never thrown. All display strings
 * here are Hebrew; the UI wraps the result in a `dir="rtl"` container using
 * the `dir` field.
 */

export type HebrewReadingSlot =
  | "hebrew_date"
  | "month_mazal"
  | "day_planet"
  | "hour_planet"
  | "sefer_yetzirah"
  | "date_gematria"
  | "name_gematria";

export interface HebrewReadingSection {
  slot: HebrewReadingSlot;
  /** Canonical entry key, or null for the data-only hebrew_date section. */
  key: string | null;
  title: string;
  bodyMd: string;
  /** Human-readable provenance, in Hebrew. */
  source: string;
}

export interface ResolvedHebrewReading {
  /** Library version this reading was rendered with. */
  contentVersion: string;
  /** Library version the snapshot was computed under. */
  snapshotContentVersion: string;
  /** True when the two differ — the UI shows a provenance note. */
  stale: boolean;
  dir: (typeof LOCALE_DIRECTION)["he"];
  sections: HebrewReadingSection[];
  /** Keys referenced but not authored — sections silently omitted. */
  missingKeys: string[];
}

const PLANET_HE: Record<ClassicalPlanet, string> = {
  sun: "חמה",
  moon: "לבנה",
  mercury: "כוכב",
  venus: "נוגה",
  mars: "מאדים",
  jupiter: "צדק",
  saturn: "שבתאי",
};

const WEEKDAY_HE = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "שבת",
] as const;

const MONTH_HE: Record<HebrewMonthKey, string> = {
  nisan: "ניסן",
  iyyar: "אייר",
  sivan: "סיוון",
  tamuz: "תמוז",
  av: "אב",
  elul: "אלול",
  tishrei: "תשרי",
  cheshvan: "חשוון",
  kislev: "כסלו",
  tevet: "טבת",
  shvat: "שבט",
  adar: "אדר",
};

/** The Hebrew date itself, rendered from snapshot data — no library entry. */
function hebrewDateSection(mazal: StoredMazal): HebrewReadingSection {
  const { civilDate } = mazal.input;
  const paragraphs = [mazal.hebrewDate.effective.renderGematriya];
  if (mazal.hebrewDate.afterSunset) {
    paragraphs.push(
      "הלידה לאחר שקיעת החמה — היום העברי כבר התחדש, והתאריך העברי מקדים את התאריך הלועזי ביום אחד.",
    );
  }
  return {
    slot: "hebrew_date",
    key: null,
    title: "התאריך העברי",
    bodyMd: paragraphs.join("\n\n"),
    source: `${civilDate.day}.${civilDate.month}.${civilDate.year}`,
  };
}

export function resolveHebrewReading(
  mazal: StoredMazal,
  gematria: StoredHebrewGematria,
  snapshotContentVersion: string,
  index: ContentIndex = loadContentIndex(contentRoot("he")),
): ResolvedHebrewReading {
  const sections: HebrewReadingSection[] = [hebrewDateSection(mazal)];
  const missingKeys: string[] = [];

  const take = (key: string, slot: HebrewReadingSlot, source: string): void => {
    const entry = getEntry(index, key);
    if (!entry) {
      missingKeys.push(key);
      return;
    }
    sections.push({ slot, key, title: entry.title, bodyMd: entry.bodyMd, source });
  };

  const monthKey = mazal.hebrewDate.effective.monthKey;
  take(
    `mazal_month/${monthKey}`,
    "month_mazal",
    `חודש ${MONTH_HE[monthKey]} — מזל ${mazal.mazal.hebrew}`,
  );

  take(
    `day_planet/${mazal.dayPlanet.planet}`,
    "day_planet",
    `${WEEKDAY_HE[mazal.dayPlanet.weekday]} — ${PLANET_HE[mazal.dayPlanet.planet]}`,
  );

  // Skipped for unknown birth time and the polar fallback (hour is null).
  if (mazal.planetaryHour !== null) {
    const hour = mazal.planetaryHour;
    take(
      `hour_planet/${hour.planet}`,
      "hour_planet",
      `השעה ה־${hour.hourIndex} של ה${hour.isDay ? "יום" : "לילה"} — ${PLANET_HE[hour.planet]}`,
    );
  }

  take(
    `sefer_yetzirah/${monthKey}`,
    "sefer_yetzirah",
    `אות ${mazal.seferYetzirah.letter} — שבט ${mazal.seferYetzirah.tribeHebrew}`,
  );

  const date = gematria.dateGematria;
  take(
    `hebrew_date_gematria/${date.value}`,
    "date_gematria",
    `יום ${mazal.hebrewDate.effective.day} ושנת ${mazal.hebrewDate.effective.year} מצטמצמים ל־${date.value}`,
  );

  // Skipped when the profile has no Hebrew birth name.
  if (gematria.katanName !== null) {
    const name = gematria.katanName.derivation.words
      .map((w) => w.word)
      .join(" ");
    take(
      `name_gematria/${gematria.katanName.value}`,
      "name_gematria",
      `${name} — מספר קטן ${gematria.katanName.value}`,
    );
  }

  return {
    contentVersion: index.version,
    snapshotContentVersion,
    stale: snapshotContentVersion !== index.version,
    dir: LOCALE_DIRECTION.he,
    sections,
    missingKeys,
  };
}
