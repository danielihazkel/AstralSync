import { isMaster, reduceSteps } from "./reduce";
import type { NameNumberResult, WordDerivation } from "./types";

/**
 * Standard gematria (mispar hechrachi) letter values. Final forms carry the
 * same value as their base letters (PRD §3.3).
 */
export const GEMATRIA_VALUES: Record<string, number> = {
  "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
  "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40, "נ": 50, "ן": 50,
  "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90,
  "ק": 100, "ר": 200, "ש": 300, "ת": 400,
};

function deriveWord(word: string): WordDerivation {
  const letters = [...word]
    .filter((char) => char in GEMATRIA_VALUES)
    .map((char) => ({ char, value: GEMATRIA_VALUES[char] }));
  const subtotal = letters.reduce((sum, l) => sum + l.value, 0);
  const steps = reduceSteps(subtotal);
  return { word, letters, subtotal, steps, reduced: steps[steps.length - 1] };
}

/**
 * Destiny/Expression equivalent for Hebrew names, computed natively in
 * gematria (no lossy transliteration). A Soul Urge split is not offered:
 * Hebrew orthography does not encode vowels as letters, so a vowels-only
 * number would be ill-defined — this limitation is by design.
 */
export function gematriaExpression(name: string): NameNumberResult {
  const words = name
    .split(/[\s\-]+/)
    .map(deriveWord)
    .filter((w) => w.letters.length > 0);
  if (words.length === 0) throw new Error("Name contains no Hebrew letters");
  const total = words.reduce((sum, w) => sum + w.reduced, 0);
  const steps = reduceSteps(total);
  const value = steps[steps.length - 1];
  return {
    system: "gematria",
    value,
    isMaster: isMaster(value),
    derivation: { words, total, steps },
  };
}

/** Raw (unreduced) gematria value of a name — traditional total. */
export function gematriaValue(name: string): number {
  return [...name]
    .filter((char) => char in GEMATRIA_VALUES)
    .reduce((sum, char) => sum + GEMATRIA_VALUES[char], 0);
}
