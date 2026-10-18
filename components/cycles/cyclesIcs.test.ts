import { describe, expect, it } from "vitest";
import type { CyclesData } from "@/lib/cycles";
import { cyclesIcsEvents } from "./cyclesIcs";

const data = {
  solarReturn: { year: 2026, returnUtc: "2026-03-04T18:22:11.000Z" },
  lunarReturn: {
    returnUtc: "2026-10-02T04:00:00.000Z",
    nextReturnUtc: "2026-10-29T11:00:00.000Z",
  },
  planetaryReturns: [
    {
      planet: "saturn",
      crossings: ["2026-05-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"],
      nextExactUtc: "2027-01-10T00:00:00.000Z",
    },
    { planet: "jupiter", crossings: [], nextExactUtc: null },
  ],
  profection: { yearLord: "mars", yearEndUtc: "2027-02-01T09:00:00.000Z" },
  firdaria: {
    major: { lord: "north_node", startUtc: "x", endUtc: "2030-01-01T00:00:00.000Z" },
    sub: null,
  },
} as unknown as CyclesData;

describe("cyclesIcsEvents", () => {
  const events = cyclesIcsEvents(data, 28);

  it("lists returns as instants, numbering a retrograde return's passes", () => {
    expect(events.filter((e) => e.summary.startsWith("Saturn return")).map((e) => e.summary)).toEqual([
      "Saturn return (pass 1 of 3)",
      "Saturn return (pass 2 of 3)",
      "Saturn return (pass 3 of 3)",
    ]);
    expect(events.find((e) => e.summary === "Solar return 2026")?.start).toBe(
      "2026-03-04T18:22:11.000Z",
    );
    expect(events.filter((e) => e.summary === "Lunar return")).toHaveLength(2);
    expect(events.some((e) => e.summary.startsWith("Jupiter"))).toBe(false);
  });

  it("marks period ends as all-day events, naming node lords", () => {
    expect(events.find((e) => e.summary.startsWith("Profection"))).toMatchObject({
      summary: "Profection year ends (Mars year)",
      date: "2027-02-01",
    });
    expect(events.find((e) => e.summary.includes("firdaria ends"))?.summary).toBe(
      "North Node firdaria ends",
    );
  });

  it("gives every event a distinct uid scoped to the profile", () => {
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
    expect(events.every((e) => e.uid.startsWith("p28-"))).toBe(true);
  });
});
