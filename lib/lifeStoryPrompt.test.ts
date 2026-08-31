import { describe, expect, it } from "vitest";
import type { NumeroDerivation, WheelChart } from "./view-types";
import { buildLifeStoryPrompt } from "./llm";
import {
  birthDataFromProfile,
  MAX_LIFE_EVENTS_IN_PROMPT,
  renderBirthData,
  renderLifeEventsData,
  type BirthData,
  type LifeEventPromptItem,
} from "./promptData";

/**
 * Birth data and life events are shared by every personal reading/forecast
 * prompt under the personal-data policy (lib/promptData.ts header). These
 * tests cover the shared renderers and the Life Story builder, which
 * pioneered them; llm.test.ts covers the other builders.
 */

const birth: BirthData = {
  birthDate: "2000-08-09",
  birthTime: "13:00",
  timeCertainty: "exact",
  placeLabel: "Tel Aviv, 05, IL",
  birthLat: 32.1,
  birthLng: 34.8,
  tzIana: "Asia/Jerusalem",
};

// Chart and numerology fixtures mirror lib/llm.test.ts.
const chart: WheelChart = {
  schemaVersion: 1,
  input: {
    utc: "2000-08-09T10:00:00.000Z",
    latitude: 32.1,
    longitude: 34.8,
    houseSystem: "placidus",
    timeCertainty: "exact",
  },
  isSolarChart: false,
  houses: {
    system: "placidus",
    requestedSystem: "placidus",
    fallbackApplied: false,
    cusps: [222.5, 252, 282, 312, 342, 12, 42.5, 72, 102, 132, 162, 192],
    ascendant: 222.5,
    mc: 132,
  },
  placements: [
    {
      planet: "sun",
      longitude: 137.07,
      sign: "leo",
      degreeInSign: 17.07,
      house: 10,
      retrograde: false,
    },
    {
      planet: "pluto",
      longitude: 245.5,
      sign: "sagittarius",
      degreeInSign: 5.5,
      house: 2,
      retrograde: true,
    },
  ],
  aspects: [
    { a: "sun", b: "moon", type: "trine", angle: 120, orb: 1.05 },
    { a: "sun", b: "pluto", type: "square", angle: 90, orb: 5.2 },
  ],
  bigThree: { sun: "leo", moon: "sagittarius", ascendant: "scorpio" },
  uncertainties: [],
  engine: { name: "test", version: "0" },
  tzWarnings: [],
};

const solarChart: WheelChart = {
  ...chart,
  isSolarChart: true,
  houses: null,
  placements: chart.placements.map((p) => ({ ...p, house: null })),
  bigThree: { ...chart.bigThree, ascendant: null },
};

const numero: NumeroDerivation = {
  lifePath: {
    value: 7,
    isMaster: false,
    derivation: {
      components: [
        { part: "month", raw: 8, steps: [], reduced: 8 },
        { part: "day", raw: 9, steps: [], reduced: 9 },
        { part: "year", raw: 2000, steps: [2], reduced: 2 },
      ],
      total: 19,
      steps: [10, 1],
    },
  },
  destiny: null,
  soulUrge: null,
  hebrewDestiny: null,
};

const events: LifeEventPromptItem[] = [
  {
    title: "Started first job",
    eventDate: "2019-06-01",
    precision: "month",
    category: "career",
    notesMd: null,
  },
  {
    title: "Moved abroad",
    eventDate: "2021-03-12",
    precision: "day",
    category: "relocation",
    notesMd: "A big change that took years to settle.",
  },
  {
    title: "Lost a grandparent",
    eventDate: "2023-01-01",
    precision: "year",
    category: "loss",
    notesMd: null,
  },
];

describe("renderBirthData", () => {
  it("renders the full birth data", () => {
    const data = renderBirthData(birth);
    expect(data).toContain("Birth date: August 9, 2000");
    expect(data).toContain("Birth time: 13:00 (exact)");
    expect(data).toContain("Tel Aviv, 05, IL");
    expect(data).toContain("32.10°N, 34.80°E");
    expect(data).toContain("Timezone: Asia/Jerusalem");
  });

  it("marks approximate and unknown birth times", () => {
    expect(
      renderBirthData({ ...birth, timeCertainty: "approx" }),
    ).toContain("13:00 (approximate)");
    expect(
      renderBirthData({
        ...birth,
        birthTime: null,
        timeCertainty: "unknown",
      }),
    ).toContain("Birth time: unknown");
  });

  it("falls back to coordinates when no city label exists", () => {
    const data = renderBirthData({
      ...birth,
      placeLabel: null,
      birthLat: -33.9,
      birthLng: -70.7,
    });
    expect(data).toContain("Birthplace: 33.90°S, 70.70°W");
  });
});

describe("birthDataFromProfile", () => {
  it("builds the city label and passes the birth fields through", () => {
    const b = birthDataFromProfile({
      birthDate: "2000-08-09",
      birthTime: "13:00",
      timeCertainty: "exact",
      birthCity: { name: "Tel Aviv", admin1: "05", countryCode: "IL" },
      birthLat: 32.1,
      birthLng: 34.8,
      tzIana: "Asia/Jerusalem",
    });
    expect(b).toEqual(birth);
  });

  it("skips empty label parts and handles a missing city", () => {
    const base = {
      birthDate: "2000-08-09",
      birthTime: null,
      timeCertainty: "unknown" as const,
      birthLat: 51.5,
      birthLng: -0.1,
      tzIana: "Europe/London",
    };
    expect(
      birthDataFromProfile({
        ...base,
        birthCity: { name: "London", admin1: null, countryCode: "GB" },
      }).placeLabel,
    ).toBe("London, GB");
    expect(
      birthDataFromProfile({ ...base, birthCity: null }).placeLabel,
    ).toBeNull();
  });
});

describe("renderLifeEventsData", () => {
  it("renders chronological bullets with precision annotations", () => {
    const data = renderLifeEventsData(events);
    expect(data).toContain(
      "- June 2019 (month only) — Career & work: Started first job",
    );
    expect(data).toContain("- March 12, 2021 — Relocation: Moved abroad");
    expect(data).toContain("- 2023 (year only) — Loss: Lost a grandparent");
    expect(data).toContain("Notes: A big change that took years to settle.");
  });

  it("truncates long notes", () => {
    const data = renderLifeEventsData([
      { ...events[1], notesMd: "x".repeat(500) },
    ]);
    expect(data).toContain("…");
    expect(data).not.toContain("x".repeat(401));
  });

  it("keeps the most recent events over the cap and states the omission", () => {
    const many: LifeEventPromptItem[] = Array.from(
      { length: MAX_LIFE_EVENTS_IN_PROMPT + 5 },
      (_, i) => ({
        title: `Event ${i}`,
        eventDate: "2000-01-01",
        precision: "year",
        category: "other",
        notesMd: null,
      }),
    );
    const data = renderLifeEventsData(many);
    expect(data).toContain("(5 earlier events omitted)");
    // One omission line + exactly MAX bullets, ending with the newest.
    expect(data.split("\n")).toHaveLength(MAX_LIFE_EVENTS_IN_PROMPT + 1);
    expect(data).toContain(`Event ${MAX_LIFE_EVENTS_IN_PROMPT + 4}`);
    expect(data).not.toContain("Event 0");
  });
});

describe("buildLifeStoryPrompt", () => {
  it("includes birth data, chart, numerology and events — deliberately", () => {
    const prompt = buildLifeStoryPrompt(birth, chart, numero, events);
    expect(prompt).toContain("## Birth data");
    expect(prompt).toContain("August 9, 2000");
    expect(prompt).toContain("13:00 (exact)");
    expect(prompt).toContain("Tel Aviv, 05, IL");
    expect(prompt).toContain("## Complete chart data");
    expect(prompt).toContain("Pluto: Sagittarius 5°30′, 2nd house, retrograde");
    expect(prompt).toContain("## Complete numerology data");
    expect(prompt).toContain("Life Path: 7");
    expect(prompt).toContain("## Life events");
    expect(prompt).toContain("Moved abroad");
  });

  it("omits the numerology block when null", () => {
    expect(buildLifeStoryPrompt(birth, chart, null, events)).not.toContain(
      "## Complete numerology data",
    );
  });

  it("adds the solar-chart caveat", () => {
    const prompt = buildLifeStoryPrompt(birth, solarChart, numero, events);
    expect(prompt).toContain("solar chart");
    expect(prompt).not.toContain("2nd house");
  });
});
