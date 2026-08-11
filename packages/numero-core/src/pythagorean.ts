import { isMaster, reduceSteps } from "./reduce";
import type { LetterValue, NameNumberResult, WordDerivation } from "./types";

/** Pythagorean letter values: A=1 … I=9, J=1 … repeating in cycles of 9. */
export function letterValue(char: string): number {
  const code = char.toUpperCase().charCodeAt(0);
  if (code < 65 || code > 90) throw new Error(`Not a Latin letter: ${char}`);
  return ((code - 65) % 9) + 1;
}

const VOWELS = "AEIOU";

/**
 * Y-as-vowel rule (documented per PRD §8): Y is a consonant when it glides
 * into a following vowel ("Yolanda", "Maya", "Yes"); otherwise it is a vowel
 * ("Mary", "Lynn", "Sky"). This deterministic approximation of the
 * syllable-based rule is the project standard.
 */
export function isVowelAt(word: string, index: number): boolean {
  const char = word[index].toUpperCase();
  if (VOWELS.includes(char)) return true;
  if (char !== "Y") return false;
  const next = word[index + 1]?.toUpperCase();
  return !(next !== undefined && VOWELS.includes(next));
}

function splitWords(name: string): string[] {
  return name
    .split(/[\s\-]+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, "").toUpperCase())
    .filter((w) => w.length > 0);
}

function deriveWord(
  word: string,
  filter: (word: string, index: number) => boolean,
): WordDerivation {
  const letters: LetterValue[] = [];
  for (let i = 0; i < word.length; i++) {
    if (!filter(word, i)) continue;
    letters.push({
      char: word[i],
      value: letterValue(word[i]),
      isVowel: isVowelAt(word, i),
    });
  }
  const subtotal = letters.reduce((sum, l) => sum + l.value, 0);
  const steps = reduceSteps(subtotal);
  return { word, letters, subtotal, steps, reduced: steps[steps.length - 1] };
}

function nameNumber(
  name: string,
  filter: (word: string, index: number) => boolean,
): NameNumberResult {
  const words = splitWords(name).map((w) => deriveWord(w, filter));
  if (words.length === 0) throw new Error("Name contains no Latin letters");
  const total = words.reduce((sum, w) => sum + w.reduced, 0);
  const steps = reduceSteps(total);
  const value = steps[steps.length - 1];
  return {
    system: "pythagorean",
    value,
    isMaster: isMaster(value),
    derivation: { words, total, steps },
  };
}

/** Destiny/Expression Number: all letters of the full birth name. */
export function expression(name: string): NameNumberResult {
  return nameNumber(name, () => true);
}

/** Soul Urge Number: vowels only (with the project Y rule). */
export function soulUrge(name: string): NameNumberResult {
  return nameNumber(name, isVowelAt);
}
