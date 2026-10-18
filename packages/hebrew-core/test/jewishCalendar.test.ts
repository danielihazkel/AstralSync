import { describe, expect, it } from "vitest";
import {
  hebrewDateOf,
  hebrewDayLabel,
  isChanukahLights,
  jewishEvents,
  nextHebrewAnniversary,
  nextHebrewBirthday,
} from "../src";

const TEL_AVIV = { lat: 32.08, lng: 34.78, tzIana: "Asia/Jerusalem", label: "Tel Aviv" };
const TISHREI_5787 = { from: { year: 2026, month: 9, day: 10 }, to: { year: 2026, month: 10, day: 20 } };

function on(events: ReturnType<typeof jewishEvents>, date: string) {
  return events.filter((e) => e.date === date);
}

describe("jewishEvents", () => {
  const il = jewishEvents(TISHREI_5787.from, TISHREI_5787.to, {
    il: true,
    location: TEL_AVIV,
  });

  it("places the High Holidays on their civil days", () => {
    const rh = on(il, "2026-09-12").find((e) => e.title.startsWith("Rosh Hashana"));
    expect(rh).toMatchObject({ kind: "holiday", major: true, time: null });
    const yk = on(il, "2026-09-21").find((e) => e.title === "Yom Kippur");
    // Both a Yom Tov and a fast: it reads as the holiday.
    expect(yk).toMatchObject({ kind: "holiday", major: true });
  });

  it("times candle-lighting, havdalah and a minor fast for the place", () => {
    const candles = on(il, "2026-09-11").find((e) => e.kind === "candles");
    expect(candles?.time).toBe("2026-09-11T15:32:00.000Z");
    expect(on(il, "2026-09-13").some((e) => e.kind === "havdalah" && e.time)).toBe(true);
    const gedaliah = on(il, "2026-09-14");
    expect(gedaliah.filter((e) => e.kind === "fast" && e.time)).toHaveLength(2);
    expect(gedaliah.some((e) => e.kind === "fast" && !e.major && e.time === null)).toBe(true);
  });

  it("gives the parasha and Rosh Chodesh", () => {
    expect(on(il, "2026-10-17").find((e) => e.kind === "parasha")?.title).toBe(
      "Parashat Noach",
    );
    expect(on(il, "2026-10-11").some((e) => e.kind === "rosh_chodesh")).toBe(true);
  });

  it("follows the Israeli or Diaspora schedule", () => {
    const diaspora = jewishEvents(TISHREI_5787.from, TISHREI_5787.to, { il: false });
    // Sukkot's second day: Yom Tov abroad, Chol HaMoed in Israel.
    expect(on(diaspora, "2026-09-27").some((e) => e.major)).toBe(true);
    expect(on(il, "2026-09-27").some((e) => e.major)).toBe(false);
  });

  it("gives no times without a place", () => {
    const placeless = jewishEvents(TISHREI_5787.from, TISHREI_5787.to, { il: true });
    expect(placeless.some((e) => e.time !== null)).toBe(false);
    expect(placeless.some((e) => e.kind === "candles")).toBe(false);
  });

  it("times Chanukah's lights for the place, and leaves them untimed without one", () => {
    // Chanukah 5786: the first light on Sunday 14 Dec 2025.
    const from = { year: 2025, month: 12, day: 13 };
    const to = { year: 2025, month: 12, day: 23 };
    const timed = jewishEvents(from, to, { il: true, location: TEL_AVIV }).filter(
      isChanukahLights,
    );
    expect(timed).toHaveLength(8);
    expect(timed[0]).toMatchObject({ date: "2025-12-14", title: "Chanukah: 1 Candle" });
    expect(timed.every((e) => e.time !== null && !e.major)).toBe(true);
    const placeless = jewishEvents(from, to, { il: true }).filter(isChanukahLights);
    expect(placeless).toHaveLength(8);
    expect(placeless.every((e) => e.time === null)).toBe(true);
  });

  it("carries Hebrew titles", () => {
    expect(il.every((e) => /[֐-׿]/.test(e.titleHe))).toBe(true);
  });
});

describe("hebrewDayLabel", () => {
  it("letters the day of the Hebrew month", () => {
    // 18 Oct 2026 is 7 Cheshvan 5787.
    expect(hebrewDayLabel({ year: 2026, month: 10, day: 18 })).toEqual({
      day: "ז׳",
      monthName: "Cheshvan",
      isFirstOfMonth: false,
    });
    expect(hebrewDayLabel({ year: 2026, month: 10, day: 12 }).isFirstOfMonth).toBe(true);
  });
});

describe("nextHebrewBirthday", () => {
  it("moves a 30 Cheshvan birthday to 1 Kislev in a short Cheshvan", () => {
    // Cheshvan 5787 has 29 days.
    const next = nextHebrewBirthday({ year: 5751, month: 8, day: 30 }, { year: 2026, month: 10, day: 18 });
    expect(next.civil).toEqual({ year: 2026, month: 11, day: 11 });
    expect(next.age).toBe(36);
  });

  it("rolls to next year once this year's has passed", () => {
    // 1 Tishrei: Rosh Hashana 5787 was 12 Sep 2026; 5788's is 2 Oct 2027.
    const next = nextHebrewBirthday({ year: 5750, month: 7, day: 1 }, { year: 2026, month: 10, day: 18 });
    expect(next.civil).toEqual({ year: 2027, month: 10, day: 2 });
  });
});

describe("nextHebrewAnniversary", () => {
  const sameHebrewDay = (a: { year: number; month: number; day: number }, b: typeof a) => {
    const x = hebrewDayLabel(a);
    const y = hebrewDayLabel(b);
    return x.day === y.day && x.monthName === y.monthName;
  };

  it("lands on the same Hebrew day in a later year", () => {
    // Yom Kippur 5781 — 28 Sep 2020 — seen from after Yom Kippur 5787.
    const event = { year: 2020, month: 9, day: 28 };
    const next = nextHebrewAnniversary(event, { year: 2026, month: 10, day: 18 }, "anniversary")!;
    expect(sameHebrewDay(next.civil, event)).toBe(true);
    expect(next.years).toBe(7);
    expect(next.civil.year).toBe(2027);
  });

  it("counts today as the anniversary when it falls today", () => {
    const event = { year: 2020, month: 9, day: 28 };
    const yk5787 = { year: 2026, month: 9, day: 21 };
    expect(nextHebrewAnniversary(event, yk5787, "yahrzeit")!.civil).toEqual(yk5787);
  });

  it("never offers the event's own year", () => {
    const event = { year: 2026, month: 10, day: 1 };
    const next = nextHebrewAnniversary(event, { year: 2026, month: 10, day: 5 }, "anniversary")!;
    expect(next.years).toBe(1);
    expect(next.civil.year).toBe(2027);
  });

  it("agrees with the plain anniversary for an ordinary yahrzeit", () => {
    const event = { year: 2015, month: 6, day: 10 };
    const from = { year: 2026, month: 1, day: 1 };
    expect(nextHebrewAnniversary(event, from, "yahrzeit")).toEqual(
      nextHebrewAnniversary(event, from, "anniversary"),
    );
  });
});

describe("hebrewDateOf", () => {
  it("renders the daytime Hebrew date", () => {
    expect(hebrewDateOf({ year: 2026, month: 9, day: 21 })).toMatch(/תִּשְׁרֵי|תשרי/);
  });
});
