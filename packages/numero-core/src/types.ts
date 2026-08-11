export type NumerologySystem = "pythagorean" | "gematria";

export const MASTER_NUMBERS = [11, 22, 33] as const;

export interface LetterValue {
  char: string;
  value: number;
  /** Present only for systems that distinguish vowels (Pythagorean). */
  isVowel?: boolean;
}

export interface WordDerivation {
  word: string;
  letters: LetterValue[];
  subtotal: number;
  /** Reduction steps from subtotal to its reduced value, e.g. [24, 6]. */
  steps: number[];
  reduced: number;
}

export interface NameNumberResult {
  system: NumerologySystem;
  value: number;
  isMaster: boolean;
  derivation: {
    words: WordDerivation[];
    /** Sum of per-word reduced values. */
    total: number;
    /** Reduction steps from total to the final value. */
    steps: number[];
  };
}

export interface LifePathResult {
  value: number;
  isMaster: boolean;
  derivation: {
    components: {
      part: "month" | "day" | "year";
      raw: number;
      steps: number[];
      reduced: number;
    }[];
    total: number;
    steps: number[];
  };
}
