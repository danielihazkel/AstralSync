import { describe, expect, it } from "vitest";
import { headlineEvent, jewishEventsNow, jewishMonth } from "./jewishMonth";

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

describe("jewishEventsNow", () => {
  const opts = {
    il: true,
    location: { lat: 32.08, lng: 34.78, tzIana: "Asia/Jerusalem" },
  };
  const titles = (now: string, afterSunset: boolean) =>
    jewishEventsNow(
      new Date(now),
      { civilDate: "2026-09-20", afterSunset },
      opts,
    ).map((e) => e.title);

  it("shows the eve and its candle-lighting in the afternoon", () => {
    // 15:00 in Tel Aviv on Erev Yom Kippur.
    const t = titles("2026-09-20T12:00:00Z", false);
    expect(t).toContain("Erev Yom Kippur");
    expect(t.some((x) => /candle/i.test(x))).toBe(true);
    expect(t).not.toContain("Yom Kippur");
  });

  it("rolls to Yom Kippur after sunset and drops the passed candles", () => {
    // 20:00 in Tel Aviv: the Hebrew date already reads 10 Tishrei.
    const t = titles("2026-09-20T17:00:00Z", true);
    expect(t).toContain("Yom Kippur");
    expect(t).not.toContain("Erev Yom Kippur");
    expect(t.some((x) => /candle/i.test(x))).toBe(false);
  });

  it("never lists the omer or the molad", () => {
    const all = jewishEventsNow(
      new Date("2026-04-10T09:00:00Z"),
      { civilDate: "2026-04-10", afterSunset: false },
      { ...opts, omer: true, molad: true },
    );
    expect(all.some((e) => e.kind === "omer" || e.kind === "molad")).toBe(false);
  });
});
