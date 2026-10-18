import { buildChart } from "@astralsync/astro-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { periodFor } from "@/lib/forecast";
import { computeForecastSky } from "@/lib/forecastSky";
import PeriodSky from "./PeriodSky";

const natal = {
  chart: {
    ...buildChart({
      utc: new Date(Date.UTC(1988, 3, 12, 11, 30)),
      latitude: 32.08,
      longitude: 34.78,
    }),
    tzWarnings: [],
  },
  version: 1,
};
const OCT_18 = { year: 2026, month: 10, day: 18 };

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("PeriodSky", () => {
  it("lays out a western month: Moon spans, contacts, and authored prose", () => {
    const sky = computeForecastSky("western", periodFor("month", "western", OCT_18), natal);
    const html = renderToStaticMarkup(<PeriodSky sky={sky} />);
    expect(text(html)).toContain("The Moon");
    expect(text(html)).toContain("Strongest contacts to your chart");
    if (sky.mode !== "western") throw new Error("mode");
    // One list item per window; prose (where authored) sits in a <details>.
    const authored = sky.prose.filter(Boolean).length;
    expect(html.split("<details").length - 1).toBe(authored);
    expect(authored).toBeGreaterThan(0);
  });

  it("says the Moon's sign in one sentence for a single day", () => {
    const sky = computeForecastSky("western", periodFor("day", "western", OCT_18), natal);
    expect(text(renderToStaticMarkup(<PeriodSky sky={sky} />))).toMatch(/In . \w+/);
  });

  it("lays out a Hebrew week with its months and seven days", () => {
    const sky = computeForecastSky("hebrew", periodFor("week", "hebrew", OCT_18), natal);
    const html = renderToStaticMarkup(<PeriodSky sky={sky} />);
    expect(text(html)).toContain("mazal");
    expect(html.split("<tr").length - 1).toBe(1 + 7);
  });
});
