import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import type { ContentEntry } from "./content";
import { buildSynastryReadingPrompt } from "./llm";
import { renderSynastryData } from "./promptData";
import { computeSynastry, type SynastryInputSide } from "./synastry";
import type { WheelChart } from "./view-types";

function chartOf(
  utc: Date,
  timeCertainty: "exact" | "approx" | "unknown" = "exact",
): WheelChart {
  const chart = buildChart({
    utc,
    latitude: 51.48,
    longitude: 0,
    timeCertainty,
  });
  return { ...chart, tzWarnings: [] };
}

function side(
  profileId: number,
  displayName: string,
  chart: WheelChart,
): SynastryInputSide {
  return { profileId, displayName, version: 1, chart };
}

const A_UTC = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
const B_UTC = new Date(Date.UTC(1995, 5, 15, 6, 30, 0));
const VIEW = computeSynastry(
  side(1, "Alice", chartOf(A_UTC)),
  side(2, "Ben", chartOf(B_UTC)),
);

const ENTRIES: ContentEntry[] = [
  {
    key: "synastry_aspect/sun/moon/square",
    category: "synastry_aspect",
    title: "Sun square Moon (synastry)",
    essence: null,
    bodyMd: "Wants and needs collide between you.",
  },
];

describe("renderSynastryData", () => {
  const data = renderSynastryData(VIEW);

  it("includes both charts, the cross aspects, and the composite", () => {
    expect(data).toContain("### Alice's natal chart");
    expect(data).toContain("### Ben's natal chart");
    expect(data).toContain("### Cross aspects (tightest first)");
    expect(data).toContain("### Composite (midpoint) chart");
    expect(data).toContain("Composite aspects:");
  });

  it("never renders the birth instants or coordinates", () => {
    expect(data).not.toContain("2000-01-01");
    expect(data).not.toContain("1995-06-15");
    expect(data).not.toContain("51.48");
    // The composite's epoch-placeholder input must not leak either.
    expect(data).not.toContain("1970-01-01");
  });
});

describe("buildSynastryReadingPrompt", () => {
  it("addresses both people, includes the data block and entries", () => {
    const prompt = buildSynastryReadingPrompt(VIEW, ENTRIES);
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Ben");
    expect(prompt).toContain("roughly 400 words");
    expect(prompt).toContain("## Complete synastry data");
    expect(prompt).toContain("### Sun square Moon (synastry)");
    expect(prompt).toContain("Wants and needs collide between you.");
  });

  it("omits the entries section when nothing is authored", () => {
    const prompt = buildSynastryReadingPrompt(VIEW, []);
    expect(prompt).not.toContain("## Interpretation entries");
  });

  it("hedges the solar side by name", () => {
    const solarView = computeSynastry(
      side(1, "Alice", chartOf(A_UTC)),
      side(2, "Ben", chartOf(new Date(Date.UTC(1995, 5, 15, 12, 0, 0)), "unknown")),
    );
    const prompt = buildSynastryReadingPrompt(solarView, []);
    expect(prompt).toContain("Ben's birth time is unknown");
    expect(prompt).not.toContain("Alice's birth time is unknown");
  });

  it("never leaks birth instants or coordinates", () => {
    const prompt = buildSynastryReadingPrompt(VIEW, ENTRIES);
    expect(prompt).not.toContain("2000-01-01");
    expect(prompt).not.toContain("51.48");
  });
});
