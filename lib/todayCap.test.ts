import { describe, expect, it } from "vitest";
import { capTodayProfiles } from "./todayCap";

function p(
  id: number,
  over: Partial<{
    isPrimary: boolean;
    lastViewedAt: string | null;
    createdAt: string;
  }> = {},
) {
  return {
    id,
    isPrimary: false,
    lastViewedAt: null as string | null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("capTodayProfiles", () => {
  it("passes small lists through untouched", () => {
    const list = [p(1), p(2), p(3)];
    expect(capTodayProfiles(list, 3)).toEqual({ shown: list, hiddenCount: 0 });
  });

  it("keeps the primary regardless of view recency", () => {
    const list = [
      p(1, { lastViewedAt: "2026-08-30T00:00:00Z" }),
      p(2, { lastViewedAt: "2026-08-29T00:00:00Z" }),
      p(3, { isPrimary: true, lastViewedAt: null }),
    ];
    const { shown, hiddenCount } = capTodayProfiles(list, 2);
    expect(shown.map((x) => x.id)).toEqual([1, 3]);
    expect(hiddenCount).toBe(1);
  });

  it("prefers recently viewed, then newest created; keeps input order", () => {
    const list = [
      p(1, { lastViewedAt: null, createdAt: "2026-01-01T00:00:00Z" }),
      p(2, { lastViewedAt: "2026-08-20T00:00:00Z" }),
      p(3, { lastViewedAt: "2026-08-28T00:00:00Z" }),
      p(4, { lastViewedAt: null, createdAt: "2026-08-01T00:00:00Z" }),
    ];
    const { shown, hiddenCount } = capTodayProfiles(list, 3);
    // 3 (newest view), 2 (older view), 4 (never viewed, newer creation).
    expect(shown.map((x) => x.id)).toEqual([2, 3, 4]);
    expect(hiddenCount).toBe(1);
  });

  it("accepts Date objects too", () => {
    const list = [
      { id: 1, isPrimary: false, lastViewedAt: new Date("2026-08-30"), createdAt: new Date("2026-01-01") },
      { id: 2, isPrimary: false, lastViewedAt: null, createdAt: new Date("2026-01-02") },
      { id: 3, isPrimary: false, lastViewedAt: new Date("2026-08-31"), createdAt: new Date("2026-01-03") },
    ];
    expect(capTodayProfiles(list, 2).shown.map((x) => x.id)).toEqual([1, 3]);
  });

  it("never mutates the input", () => {
    const list = [p(1), p(2, { lastViewedAt: "2026-08-30T00:00:00Z" }), p(3)];
    const copy = list.map((x) => ({ ...x }));
    capTodayProfiles(list, 2);
    expect(list).toEqual(copy);
  });
});
