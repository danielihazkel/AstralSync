import { describe, expect, it } from "vitest";
import type { AlmanacDay } from "@/lib/almanac";
import type { ElectionalDay } from "@/lib/electional";
import type { MoonDayCell, MoonMonth } from "@/lib/skyCalendar";
import {
  almanacDayIcsEvents,
  electionalDayIcsEvents,
  moonMonthIcsEvents,
} from "./calendarIcsEvents";

function cell(overrides: Partial<MoonDayCell>): MoonDayCell {
  return {
    date: "2026-08-08",
    signAtNoon: "leo",
    illumination: 0.5,
    ingresses: [],
    quarter: null,
    voc: [],
    eclipses: [],
    ...overrides,
  };
}

describe("moonMonthIcsEvents", () => {
  it("maps quarters, ingresses, VoC windows and eclipses", () => {
    const month: MoonMonth = {
      year: 2026,
      month: 8,
      days: [
        cell({
          date: "2026-08-08",
          quarter: { name: "Full Moon", utc: "2026-08-08T02:00:00.000Z" },
          ingresses: [{ utc: "2026-08-08T05:00:00.000Z", sign: "virgo" }],
          voc: [
            {
              fromUtc: "2026-08-08T01:00:00.000Z",
              untilUtc: "2026-08-08T05:00:00.000Z",
              nextSign: "virgo",
            },
          ],
          eclipses: [
            {
              kind: "lunar",
              type: "total",
              peakUtc: "2026-08-08T02:10:00.000Z",
              longitude: 315.5,
              sign: "aquarius",
              degreeInSign: 15.5,
              obscuration: 1,
            },
          ],
        }),
      ],
    };
    const events = moonMonthIcsEvents(month);
    expect(events.map((e) => e.summary)).toEqual([
      "Full Moon",
      "Moon enters Virgo",
      "Moon void of course (then Virgo)",
      "Total lunar eclipse at 15°30′ Aquarius",
    ]);
    const voc = events[2];
    expect(voc.start).toBe("2026-08-08T01:00:00.000Z");
    expect(voc.end).toBe("2026-08-08T05:00:00.000Z");
    // Instantaneous events carry no end.
    expect(events[0].end).toBeUndefined();
    expect(events[3].uid).toBe("eclipse-20260808T021000Z");
  });

  it("dedupes VoC windows listed on every day they touch", () => {
    const w = {
      fromUtc: "2026-08-08T20:00:00.000Z",
      untilUtc: "2026-08-09T06:00:00.000Z",
      nextSign: "virgo" as const,
    };
    const month: MoonMonth = {
      year: 2026,
      month: 8,
      days: [
        cell({ date: "2026-08-08", voc: [w] }),
        cell({ date: "2026-08-09", voc: [w] }),
      ],
    };
    const events = moonMonthIcsEvents(month);
    expect(events).toHaveLength(1);
  });
});

describe("almanacDayIcsEvents", () => {
  const day: AlmanacDay = {
    date: "2026-08-08",
    moon: cell({
      date: "2026-08-08",
      quarter: { name: "Full Moon", utc: "2026-08-08T02:00:00.000Z" },
      voc: [
        {
          fromUtc: "2026-08-08T01:00:00.000Z",
          untilUtc: "2026-08-08T05:00:00.000Z",
          nextSign: "virgo",
        },
      ],
    }),
    phaseName: "Full Moon",
    mundane: [
      { a: "venus", b: "jupiter", angle: 120, utc: "2026-08-08T14:32:00.000Z" },
    ],
    ingresses: [
      { planet: "mars", sign: "leo", utc: "2026-08-08T18:40:00.000Z" },
    ],
    stations: [
      {
        planet: "mercury",
        direction: "retrograde",
        utc: "2026-08-08T03:11:00.000Z",
      },
    ],
  };

  it("maps moon, mundane, ingress and station events with stable uids", () => {
    const events = almanacDayIcsEvents(day);
    expect(events.map((e) => e.summary)).toEqual([
      "Full Moon",
      "Moon void of course (then Virgo)",
      "Venus trine Jupiter",
      "Mars enters Leo",
      "Mercury stations retrograde",
    ]);
    expect(events.map((e) => e.uid)).toEqual([
      "quarter-20260808T020000Z",
      "voc-20260808T050000Z",
      "mundane-venus-jupiter-20260808T143200Z",
      "ingress-mars-20260808T184000Z",
      "station-mercury-20260808T031100Z",
    ]);
    // Only the VoC window is a span; the rest are instants.
    expect(events[1].end).toBe("2026-08-08T05:00:00.000Z");
    expect(events[2].end).toBeUndefined();
  });

  it("shares moon-event uids with the month export so re-imports dedupe", () => {
    const dayEvents = almanacDayIcsEvents(day);
    const monthEvents = moonMonthIcsEvents({
      year: 2026,
      month: 8,
      days: [day.moon],
    });
    for (const m of monthEvents) {
      expect(dayEvents.map((e) => e.uid)).toContain(m.uid);
    }
  });
});

describe("electionalDayIcsEvents", () => {
  const day: ElectionalDay = {
    date: "2026-08-08",
    moonSign: "leo",
    dayRuler: "sun",
    mercuryRetrograde: false,
    windows: [
      {
        startUtc: "2026-08-08T08:00:00.000Z",
        endUtc: "2026-08-08T09:00:00.000Z",
        hourRuler: "venus",
        isDay: true,
        score: 4,
        verdict: "good",
        factors: [
          { label: "Venus rules this hour", score: 2 },
          { label: "Mercury is retrograde (caution)", score: 0 },
        ],
      },
      {
        startUtc: "2026-08-08T09:00:00.000Z",
        endUtc: "2026-08-08T10:00:00.000Z",
        hourRuler: "saturn",
        isDay: true,
        score: 0,
        verdict: "mixed",
        factors: [],
      },
      {
        startUtc: "2026-08-08T10:00:00.000Z",
        endUtc: "2026-08-08T11:00:00.000Z",
        hourRuler: "mars",
        isDay: true,
        score: -3,
        verdict: "avoid",
        factors: [{ label: "Moon void of course", score: -3 }],
      },
    ],
  };

  it("exports good and mixed windows, skipping avoid", () => {
    const events = electionalDayIcsEvents(day, null);
    expect(events).toHaveLength(2);
    expect(events[0].summary).toBe("Good window — Venus hour");
    expect(events[1].summary).toBe("Mixed window — Saturn hour");
    expect(events[0].start).toBe("2026-08-08T08:00:00.000Z");
    expect(events[0].end).toBe("2026-08-08T09:00:00.000Z");
  });

  it("prefixes the intent label and joins factors into the description", () => {
    const events = electionalDayIcsEvents(day, "Love & beauty");
    expect(events[0].summary).toBe("Love & beauty: Good window — Venus hour");
    expect(events[0].description).toBe(
      "Venus rules this hour (+2)\nMercury is retrograde (caution)\nScore 4",
    );
    expect(events[0].uid).toContain("love");
  });
});
