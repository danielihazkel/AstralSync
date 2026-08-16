import { describe, expect, it } from "vitest";
import {
  JOURNAL_MOODS,
  moodScore,
  normalizeTags,
  parseTagsInput,
} from "./journalMeta";

describe("moodScore", () => {
  it("maps the scale to 1..5 in order", () => {
    expect(JOURNAL_MOODS.map(moodScore)).toEqual([1, 2, 3, 4, 5]);
    expect(moodScore("neutral")).toBe(3);
  });
});

describe("normalizeTags", () => {
  it("trims, lowercases and collapses inner whitespace", () => {
    expect(normalizeTags(["  Work ", "Deep\t Sleep"])).toEqual([
      "work",
      "deep sleep",
    ]);
  });

  it("drops empties and dedupes case-insensitively, keeping first-seen order", () => {
    expect(normalizeTags(["b", "", "  ", "A", "a", "B "])).toEqual(["b", "a"]);
  });

  it("returns [] for no usable input", () => {
    expect(normalizeTags([])).toEqual([]);
    expect(normalizeTags(["", "   "])).toEqual([]);
  });
});

describe("parseTagsInput", () => {
  it("splits on commas and normalizes the pieces", () => {
    expect(parseTagsInput("Work, dreams ,work,")).toEqual(["work", "dreams"]);
  });

  it("returns [] for an empty or comma-only string", () => {
    expect(parseTagsInput("")).toEqual([]);
    expect(parseTagsInput(" , ,")).toEqual([]);
  });
});
