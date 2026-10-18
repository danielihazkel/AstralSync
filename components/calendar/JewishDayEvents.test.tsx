import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { jewishMonth } from "@/lib/jewishMonth";
import JewishDayEvents from "./JewishDayEvents";

const TEL_AVIV = { lat: 32.08, lng: 34.78, tzIana: "Asia/Jerusalem", label: "Tel Aviv" };

describe("JewishDayEvents", () => {
  it("lists a Yom Tov first and its times in the place's own clock", () => {
    const sept = jewishMonth(2026, 9, { il: true, location: TEL_AVIV });
    const html = renderToStaticMarkup(<JewishDayEvents day={sept["2026-09-11"]} />);
    // Erev Rosh Hashana, then candle-lighting at 18:32 Tel Aviv time.
    expect(html.indexOf("Erev Rosh Hashana")).toBeLessThan(html.indexOf("Candle lighting"));
    expect(html).toContain("Candle lighting: 18:32");
  });

  it("shows just the Hebrew date on an ordinary day", () => {
    const oct = jewishMonth(2026, 10, { il: true });
    const html = renderToStaticMarkup(<JewishDayEvents day={oct["2026-10-20"]} />);
    expect(html).toContain("Cheshvan");
    expect(html).not.toContain("<ul");
  });
});
