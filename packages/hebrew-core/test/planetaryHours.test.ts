import { GeoLocation, HDate, Zmanim } from "@hebcal/core";
import { describe, expect, it } from "vitest";
import { CHALDEAN_ORDER, DAY_PLANETS, planetaryHour, type MazalInput } from "../src";

const NYC = {
  latitude: 40.7128,
  longitude: -74.006,
  tzId: "America/New_York",
};

// Sunday 2000-01-02, NYC: sunrise 12:20:14Z, sunset 21:40:37Z;
// Monday 2000-01-03 sunrise 12:20:16Z (verified against @hebcal NOAA output).
const SUNDAY = { year: 2000, month: 1, day: 2 };

function at(utc: Date, overrides: Partial<MazalInput> = {}): MazalInput {
  return { civilDate: SUNDAY, utc, ...NYC, ...overrides };
}

describe("planetary hour of birth (Phase 2a)", () => {
  it("anchors Sunday's first daylight hour to the Sun", () => {
    const r = planetaryHour(at(new Date(Date.UTC(2000, 0, 2, 12, 25, 0))));
    expect(r).toMatchObject({
      planet: "sun",
      hourIndex: 1,
      isDay: true,
      dayRuler: "sun",
      uncertain: false,
    });
  });

  it("reproduces every classical day ruler from the continuous Chaldean cycle", () => {
    // Sunday 2000-01-02 through Saturday 2000-01-08, each just after sunrise.
    for (let offset = 0; offset < 7; offset++) {
      const r = planetaryHour(
        at(new Date(Date.UTC(2000, 0, 2 + offset, 12, 30, 0)), {
          civilDate: { year: 2000, month: 1, day: 2 + offset },
        }),
      );
      expect(r?.dayRuler).toBe(DAY_PLANETS[offset]);
      expect(r?.planet).toBe(DAY_PLANETS[offset]); // first hour = day ruler
      expect(r?.hourIndex).toBe(1);
    }
  });

  it("splits daylight into twelve unequal hours that exactly partition sunrise→sunset", () => {
    const gloc = new GeoLocation(null, NYC.latitude, NYC.longitude, 0, NYC.tzId);
    const z = new Zmanim(gloc, new HDate(new Date(2000, 0, 2)), false);
    const sunrise = z.sunrise().getTime();
    const sunset = z.sunset().getTime();
    const hourLen = (sunset - sunrise) / 12;

    for (let i = 0; i < 12; i++) {
      const mid = new Date(sunrise + (i + 0.5) * hourLen);
      const r = planetaryHour(at(mid));
      expect(r?.hourIndex).toBe(i + 1);
      expect(r?.isDay).toBe(true);
      expect(new Date(r!.startUtc).getTime()).toBeCloseTo(sunrise + i * hourLen, -1);
      expect(new Date(r!.endUtc).getTime()).toBeCloseTo(sunrise + (i + 1) * hourLen, -1);
    }
    // Chaldean continuity within the day: consecutive hours step through the order.
    const first = planetaryHour(at(new Date(sunrise + 0.5 * hourLen)));
    const second = planetaryHour(at(new Date(sunrise + 1.5 * hourLen)));
    const i1 = CHALDEAN_ORDER.indexOf(first!.planet);
    expect(CHALDEAN_ORDER[(i1 + 1) % 7]).toBe(second!.planet);
  });

  it("attributes a birth between midnight and sunrise to the previous day's night", () => {
    // Monday 02:00 EST — planetary days run sunrise→sunrise, so this is
    // still Sunday's night. Night hour 8 (73.3-minute hours) → Jupiter.
    const r = planetaryHour(
      at(new Date(Date.UTC(2000, 0, 3, 7, 0, 0)), {
        civilDate: { year: 2000, month: 1, day: 3 },
      }),
    );
    expect(r).toMatchObject({
      isDay: false,
      dayRuler: "sun",
      hourIndex: 8,
      planet: "jupiter",
    });
  });

  it("fetches the adjacent day's sunrise for a birth after sunset", () => {
    // Sunday 18:00 EST = 23:00Z; sunset 21:40:37Z, night hour 2.
    const r = planetaryHour(at(new Date(Date.UTC(2000, 0, 2, 23, 0, 0))));
    expect(r?.isDay).toBe(false);
    expect(r?.dayRuler).toBe("sun");
    expect(r?.hourIndex).toBe(2);
    // Night hours continue the cycle: h = 12 + 1 → (3 + 13) % 7 = 2 → mars.
    expect(r?.planet).toBe("mars");
  });

  it("returns null for unknown birth time", () => {
    const r = planetaryHour(
      at(new Date(Date.UTC(2000, 0, 2, 17, 0, 0)), { timeCertainty: "unknown" }),
    );
    expect(r).toBeNull();
  });

  it("marks approximate birth times as uncertain", () => {
    const r = planetaryHour(
      at(new Date(Date.UTC(2000, 0, 2, 17, 0, 0)), { timeCertainty: "approx" }),
    );
    expect(r?.uncertain).toBe(true);
  });

  it("returns null when the location has no sunrise/sunset (polar)", () => {
    const r = planetaryHour({
      civilDate: { year: 2020, month: 6, day: 21 },
      utc: new Date(Date.UTC(2020, 5, 21, 10, 0, 0)),
      latitude: 78.22,
      longitude: 15.64,
      tzId: "Arctic/Longyearbyen",
    });
    expect(r).toBeNull();
  });
});
