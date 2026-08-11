import type { HouseSystem, TimeCertainty } from "@astralsync/astro-core";

/** A birthplace as the wizard carries it: either a picked GeoNames city or
 *  (in edit mode) the coordinates already stored on the profile. */
export interface CityOption {
  geonameId: number | null;
  label: string;
  lat: number;
  lng: number;
  tzIana: string;
}

export interface WizardDraft {
  birthDate: string; // "YYYY-MM-DD"
  timeCertainty: TimeCertainty;
  birthTime: string; // "HH:MM"; ignored when timeCertainty is "unknown"
  city: CityOption | null;
  offsetOverridden: boolean;
  overrideOffsetMinutes: number | null;
  displayName: string;
  fullBirthName: string;
  /** Latin transliteration, used when the name is non-Latin and non-Hebrew. */
  transliteration: string;
}

export interface WizardInitial extends WizardDraft {
  houseSystem: HouseSystem;
}

export type DetectedScript = "none" | "latin" | "hebrew" | "other";

/**
 * Script detection for the name step. Any Hebrew letter wins (gematria
 * handles mixed input); otherwise any Latin letter → Pythagorean; otherwise
 * the transliteration path.
 */
export function detectScript(name: string): DetectedScript {
  if (!name.trim()) return "none";
  if (/[֐-׿]/.test(name)) return "hebrew";
  if (/[A-Za-z]/.test(name)) return "latin";
  return "other";
}
