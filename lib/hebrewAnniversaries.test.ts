import { describe, expect, it } from "vitest";
import {
  anniversariesOn,
  anniversaryIcsEvents,
  anniversaryKind,
  anniversaryLabel,
  eventHebrewInfo,
  type AnniversaryEvent,
} from "./hebrewAnniversaries";

// Yom Kippur 5781 — 28 Sep 2020; its anniversaries fall on later Yom Kippurs.
const WEDDING: AnniversaryEvent = {
  id: 1,
  title: "Wedding",
  eventDate: "2020-09-28",
  precision: "day",
  category: "marriage",
};

describe("eventHebrewInfo", () => {
  it("dates a day event and finds its next anniversary", () => {
    const info = eventHebrewInfo(WEDDING, "2026-01-01")!;
    expect(info.kind).toBe("anniversary");
    expect(info.next).toMatchObject({ date: "2026-09-21", years: 6 });
    expect(info.hebrewDate.length).toBeGreaterThan(0);
  });

  it("skips month- and year-dated events", () => {
    expect(eventHebrewInfo({ ...WEDDING, precision: "month" }, "2026-01-01")).toBeNull();
    expect(eventHebrewInfo({ ...WEDDING, precision: "year" }, "2026-01-01")).toBeNull();
  });

  it("keeps a loss as a yahrzeit", () => {
    expect(anniversaryKind("loss")).toBe("yahrzeit");
    expect(eventHebrewInfo({ ...WEDDING, category: "loss" }, "2026-01-01")!.kind).toBe(
      "yahrzeit",
    );
  });
});

describe("anniversariesOn", () => {
  it("finds the events whose anniversary is that day", () => {
    const other = { ...WEDDING, id: 2, eventDate: "2019-03-01" };
    const hits = anniversariesOn([WEDDING, other], "2026-09-21");
    expect(hits.map((h) => h.id)).toEqual([1]);
    expect(hits[0].info.next?.years).toBe(6);
  });
});

describe("anniversaryLabel", () => {
  it("names the kind and the ordinal", () => {
    expect(anniversaryLabel("Wedding", "anniversary", 1)).toBe(
      "Hebrew anniversary — Wedding (1st)",
    );
    expect(anniversaryLabel("Grandpa", "yahrzeit", 12)).toBe("Yahrzeit — Grandpa (12th)");
    expect(anniversaryLabel("x", "anniversary", 22)).toMatch(/22nd/);
  });
});

describe("anniversaryIcsEvents", () => {
  it("lists the next years as all-day events, one per Hebrew year", () => {
    const events = anniversaryIcsEvents([WEDDING], "2026-01-01", 3);
    expect(events.map((e) => e.date)).toEqual(["2026-09-21", "2027-10-11", "2028-09-30"]);
    expect(new Set(events.map((e) => e.uid)).size).toBe(3);
    expect(events[0].summary).toBe("Hebrew anniversary — Wedding (6th)");
  });

  it("leaves out events without a day", () => {
    expect(anniversaryIcsEvents([{ ...WEDDING, precision: "year" }], "2026-01-01")).toEqual([]);
  });
});
