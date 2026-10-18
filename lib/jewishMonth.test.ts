import { describe, expect, it } from "vitest";
import { headlineEvent, jewishMonth } from "./jewishMonth";

describe("jewishMonth", () => {
  const sept = jewishMonth(2026, 9, { il: true });

  it("covers every civil day with its Hebrew date", () => {
    expect(Object.keys(sept)).toHaveLength(30);
    // Rosh Hashana 5787 — 1 Tishrei — is 12 Sep 2026.
    expect(sept["2026-09-12"]).toMatchObject({
      hebrewDay: "א׳",
      monthName: "Tishrei",
      isFirstOfMonth: true,
    });
  });

  it("files events under their own day", () => {
    expect(sept["2026-09-21"].events.some((e) => e.title === "Yom Kippur")).toBe(true);
    expect(sept["2026-09-20"].events.some((e) => e.title === "Yom Kippur")).toBe(false);
  });
});

describe("headlineEvent", () => {
  const sept = jewishMonth(2026, 9, {
    il: true,
    location: { lat: 32.08, lng: 34.78, tzIana: "Asia/Jerusalem" },
  });

  it("names the Yom Tov over its candle-lighting", () => {
    expect(headlineEvent(sept["2026-09-12"].events)?.title).toMatch(/^Rosh Hashana/);
  });

  it("names a Shabbat's special name over its parasha", () => {
    // 19 Sep 2026: Shabbat Shuva, Parashat Ha'azinu.
    expect(headlineEvent(sept["2026-09-19"].events)?.title).toBe("Shabbat Shuva");
  });

  it("never headlines a time", () => {
    // A plain Friday: candle-lighting only.
    expect(headlineEvent(sept["2026-09-18"].events)).toBeNull();
  });
});
