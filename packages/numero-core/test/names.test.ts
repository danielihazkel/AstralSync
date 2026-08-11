import { describe, expect, it } from "vitest";
import {
  expression,
  gematriaExpression,
  gematriaValue,
  isVowelAt,
  soulUrge,
} from "../src";

describe("Expression/Destiny Number (Pythagorean)", () => {
  it("computes per-word reductions then a final sum (JOHN SMITH → 8)", () => {
    const r = expression("John Smith");
    // JOHN = 1+6+8+5 = 20 → 2; SMITH = 1+4+9+2+8 = 24 → 6; 2+6 = 8
    expect(r.value).toBe(8);
    expect(r.derivation.words.map((w) => w.reduced)).toEqual([2, 6]);
  });

  it("preserves master numbers (RUTH → 22)", () => {
    const r = expression("Ruth"); // 9+3+2+8 = 22
    expect(r.value).toBe(22);
    expect(r.isMaster).toBe(true);
  });

  it("provides a letter-by-letter breakdown (PRD §3.3 trust requirement)", () => {
    const r = expression("Mary");
    expect(r.derivation.words[0].letters).toEqual([
      { char: "M", value: 4, isVowel: false },
      { char: "A", value: 1, isVowel: true },
      { char: "R", value: 9, isVowel: false },
      { char: "Y", value: 7, isVowel: true },
    ]);
  });

  it("ignores punctuation and handles hyphenated names as separate words", () => {
    const plain = expression("Anne Marie");
    const hyphen = expression("Anne-Marie");
    expect(hyphen.value).toBe(plain.value);
  });
});

describe("Soul Urge Number and the Y-as-vowel rule (PRD §8)", () => {
  it("sums vowels only (JOHN SMITH → 6)", () => {
    const r = soulUrge("John Smith"); // O=6 → 6; I=9 → 9; 6+9 = 15 → 6
    expect(r.value).toBe(6);
  });

  it("treats trailing/standalone Y as a vowel (MARY, LYNN)", () => {
    expect(isVowelAt("MARY", 3)).toBe(true);
    expect(isVowelAt("LYNN", 1)).toBe(true);
    expect(soulUrge("Mary").value).toBe(8); // A=1 + Y=7
    expect(soulUrge("Lynn").value).toBe(7); // Y=7
  });

  it("treats Y gliding into a vowel as a consonant (YOLANDA, MAYA)", () => {
    expect(isVowelAt("YOLANDA", 0)).toBe(false);
    expect(isVowelAt("MAYA", 2)).toBe(false);
    expect(soulUrge("Yolanda").value).toBe(8); // O+A+A = 6+1+1
    expect(soulUrge("Maya").value).toBe(2); // A+A
  });
});

describe("Gematria (Hebrew, PRD §3.3)", () => {
  it("computes standard letter values (דוד = 14 → 5)", () => {
    expect(gematriaValue("דוד")).toBe(14);
    const r = gematriaExpression("דוד");
    expect(r.value).toBe(5);
    expect(r.system).toBe("gematria");
  });

  it("values final forms as their base letters (שלום, ארץ)", () => {
    expect(gematriaValue("שלום")).toBe(376); // ם (final mem) = 40
    expect(gematriaValue("ארץ")).toBe(291); // ץ (final tsadi) = 90
    expect(gematriaExpression("שלום").value).toBe(7); // 376 → 16 → 7
  });

  it("keeps the letter-by-letter breakdown", () => {
    const r = gematriaExpression("דוד");
    expect(r.derivation.words[0].letters).toEqual([
      { char: "ד", value: 4 },
      { char: "ו", value: 6 },
      { char: "ד", value: 4 },
    ]);
  });

  it("rejects input with no Hebrew letters", () => {
    expect(() => gematriaExpression("David")).toThrow();
  });
});
