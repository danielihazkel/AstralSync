import { describe, expect, it } from "vitest";
import { buildChart } from "@astralsync/astro-core";
import { castMoment, wallNowIn } from "./momentChart";
import { momentFromQuery, momentQuery } from "./momentQuery";

const TEL_AVIV = { label: "Tel Aviv", lat: 32.08, lng: 34.78, tzIana: "Asia/Jerusalem" };

describe("castMoment", () => {
  it("casts the wall time in the place's zone", () => {
    // 18 Oct 2026 is Israel summer time (UTC+3).
    const m = castMoment({ date: "2026-10-18", time: "15:30", place: TEL_AVIV, houseSystem: "placidus" });
    expect(m.utc.toISOString()).toBe("2026-10-18T12:30:00.000Z");
    expect(m.offsetMinutes).toBe(180);
    const direct = buildChart({ utc: m.utc, latitude: 32.08, longitude: 34.78 });
    expect(m.chart.houses?.ascendant).toBeCloseTo(direct.houses!.ascendant, 9);
    expect(m.chart.tzWarnings).toEqual([]);
  });

  it("rings the nodes, Lilith and the Part of Fortune", () => {
    const m = castMoment({ date: "2026-10-18", time: "15:30", place: TEL_AVIV, houseSystem: "whole_sign" });
    const names = m.points.true.map((p) => p.point);
    expect(names).toContain("north_node");
    expect(names).toContain("lilith");
    expect(names).toContain("part_of_fortune");
    expect(m.chart.houses?.system).toBe("whole_sign");
  });

  it("flags a clock-change time but not a pre-1970 date", () => {
    const gap = castMoment({ date: "2026-03-27", time: "02:30", place: TEL_AVIV, houseSystem: "placidus" });
    expect(gap.chart.tzWarnings).toEqual(["dst_gap"]);
    const old = castMoment({ date: "1950-06-01", time: "12:00", place: TEL_AVIV, houseSystem: "placidus" });
    expect(old.chart.tzWarnings).toEqual([]);
  });
});

describe("wallNowIn", () => {
  it("reads the clock at the place, not the browser", () => {
    const now = new Date("2026-10-18T22:30:00Z");
    expect(wallNowIn("Asia/Jerusalem", now)).toEqual({ date: "2026-10-19", time: "01:30" });
    expect(wallNowIn("America/New_York", now)).toEqual({ date: "2026-10-18", time: "18:30" });
  });
});

describe("momentQuery / momentFromQuery", () => {
  it("round-trips a moment through the URL", () => {
    const q = new URLSearchParams(momentQuery({ date: "2026-10-18", time: "15:30", place: TEL_AVIV }));
    expect(momentFromQuery(q)).toEqual({ date: "2026-10-18", time: "15:30", place: TEL_AVIV });
  });

  it("drops what it cannot trust", () => {
    const q = new URLSearchParams("date=1500-01-01&time=25:00&lat=95&lng=10&tz=UTC");
    expect(momentFromQuery(q)).toEqual({ date: null, time: null, place: null });
    expect(momentFromQuery(new URLSearchParams("")).place).toBeNull();
  });
});
