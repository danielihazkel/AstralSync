import { describe, expect, it } from "vitest";
import { formatBirthDate, formatDegreeInSign, formatOffset } from "./format";

describe("formatOffset", () => {
  it("formats positive offsets", () => {
    expect(formatOffset(120)).toBe("UTC+02:00");
    expect(formatOffset(330)).toBe("UTC+05:30");
  });

  it("formats negative offsets", () => {
    expect(formatOffset(-300)).toBe("UTC−05:00");
    expect(formatOffset(-570)).toBe("UTC−09:30");
  });

  it("formats zero as +00:00", () => {
    expect(formatOffset(0)).toBe("UTC+00:00");
  });
});

describe("formatDegreeInSign", () => {
  it("formats whole and fractional degrees", () => {
    expect(formatDegreeInSign(15)).toBe("15°00′");
    expect(formatDegreeInSign(15.5333333)).toBe("15°32′");
    expect(formatDegreeInSign(0.0166667)).toBe("0°01′");
  });

  it("rolls 60 minutes into the next degree", () => {
    expect(formatDegreeInSign(14.9999)).toBe("15°00′");
  });
});

describe("formatBirthDate", () => {
  it("renders locale-independent dates", () => {
    expect(formatBirthDate("1990-03-04")).toBe("March 4, 1990");
    expect(formatBirthDate("1965-12-31")).toBe("December 31, 1965");
  });
});
