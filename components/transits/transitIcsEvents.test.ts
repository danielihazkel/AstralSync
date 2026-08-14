import { describe, expect, it } from "vitest";
import type { TransitCalendarData } from "@/lib/transitCalendar";
import { transitMonthIcsEvents } from "./transitIcsEvents";

function data(events: TransitCalendarData["events"]): TransitCalendarData {
  return {
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-09-01T00:00:00.000Z",
    natal: { version: 1, isSolarChart: false, moonUncertain: false },
    events,
    engine: { name: "astronomy-engine", version: "2.1.19" },
  };
}

describe("transitMonthIcsEvents", () => {
  it("maps aspect perfections with retrograde and pass annotations", () => {
    const events = transitMonthIcsEvents(
      data([
        {
          kind: "aspect",
          utc: "2026-08-14T10:00:00.000Z",
          a: "mars",
          b: "venus",
          type: "square",
          angle: 90,
          retrograde: true,
          pass: { n: 2, of: 3 },
        },
        {
          kind: "aspect",
          utc: "2026-08-15T10:00:00.000Z",
          a: "jupiter",
          b: "sun",
          type: "trine",
          angle: 120,
          retrograde: false,
          pass: { n: 1, of: 1 },
        },
      ]),
    );
    expect(events[0].summary).toBe("Mars ℞ square natal Venus (pass 2 of 3)");
    expect(events[0].uid).toBe(
      "transit-aspect-20260814T100000Z-mars-square-venus",
    );
    expect(events[1].summary).toBe("Jupiter trine natal Sun");
    expect(events[1].end).toBeUndefined();
  });

  it("maps ingresses, stations and eclipses", () => {
    const events = transitMonthIcsEvents(
      data([
        {
          kind: "ingress",
          utc: "2026-08-02T00:00:00.000Z",
          planet: "mars",
          signIndex: 5,
          retrograde: false,
        },
        {
          kind: "ingress",
          utc: "2026-08-03T00:00:00.000Z",
          planet: "saturn",
          signIndex: 0,
          retrograde: true,
        },
        {
          kind: "station",
          utc: "2026-08-04T00:00:00.000Z",
          planet: "mercury",
          direction: "retrograde",
        },
        {
          kind: "eclipse",
          utc: "2026-08-05T00:00:00.000Z",
          eclipse: {
            kind: "solar",
            type: "annular",
            peakUtc: "2026-08-05T00:00:00.000Z",
            longitude: 132.25,
            sign: "leo",
            degreeInSign: 12.25,
            obscuration: null,
          },
        },
      ]),
    );
    expect(events.map((e) => e.summary)).toEqual([
      "Mars enters Virgo",
      "Saturn ℞ re-enters Aries",
      "Mercury stations retrograde",
      "Annular solar eclipse at 12°15′ Leo",
    ]);
    expect(events[3].uid).toBe("eclipse-20260805T000000Z");
  });
});
