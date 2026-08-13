import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "./exportSvg";

describe("sanitizeFileName", () => {
  it("lowercases and dashes plain names", () => {
    expect(sanitizeFileName("Dana Chart")).toBe("dana-chart");
  });

  it("strips diacritics", () => {
    expect(sanitizeFileName("José Ångström")).toBe("jose-angstrom");
  });

  it("keeps Hebrew letters", () => {
    expect(sanitizeFileName("דניאל chart")).toBe("דניאל-chart");
  });

  it("collapses punctuation runs and trims edge dashes", () => {
    expect(sanitizeFileName("  a / b?? c!  ")).toBe("a-b-c");
  });

  it("falls back to 'chart' when nothing survives", () => {
    expect(sanitizeFileName("???")).toBe("chart");
    expect(sanitizeFileName("")).toBe("chart");
  });
});
