import { describe, expect, it } from "vitest";
import { formatEventDate, isCanonicalEventDate } from "./lifeEventMeta";

describe("isCanonicalEventDate", () => {
  it("accepts any well-formed day for day precision", () => {
    expect(isCanonicalEventDate("2014-03-12", "day")).toBe(true);
    expect(isCanonicalEventDate("2014-12-31", "day")).toBe(true);
  });

  it("requires day 01 for month precision", () => {
    expect(isCanonicalEventDate("2014-03-01", "month")).toBe(true);
    expect(isCanonicalEventDate("2014-03-12", "month")).toBe(false);
  });

  it("requires January 01 for year precision", () => {
    expect(isCanonicalEventDate("2014-01-01", "year")).toBe(true);
    expect(isCanonicalEventDate("2014-03-01", "year")).toBe(false);
    expect(isCanonicalEventDate("2014-01-02", "year")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isCanonicalEventDate("2014-3-1", "day")).toBe(false);
    expect(isCanonicalEventDate("", "year")).toBe(false);
  });
});

describe("formatEventDate", () => {
  it("renders each precision with only what the user knows", () => {
    expect(formatEventDate("2014-03-12", "day")).toBe("March 12, 2014");
    expect(formatEventDate("2014-03-01", "month")).toBe("March 2014");
    expect(formatEventDate("2014-01-01", "year")).toBe("2014");
  });

  it("handles range edges", () => {
    expect(formatEventDate("1700-01-01", "day")).toBe("January 1, 1700");
    expect(formatEventDate("2199-12-01", "month")).toBe("December 2199");
  });
});
