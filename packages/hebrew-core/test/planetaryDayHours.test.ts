import { describe, expect, it } from "vitest";
import {
  CHALDEAN_ORDER,
  DAY_PLANETS,
  planetaryDayHours,
  planetaryHour,
} from "../src";

const NYC = {
  latitude: 40.7128,
  longitude: -74.006,
  tzId: "America/New_York",
};

// Same anchor day as planetaryHours.test.ts: Sunday 2000-01-02, NYC.
const SUNDAY = { year: 2000, month: 1, day: 2 };

describe("planetaryDayHours", () => {
  it("returns 24 contiguous hours from sunrise to the next sunrise", () => {
    const day = planetaryDayHours({ civilDate: SUNDAY, ...NYC });
    expect(day).not.toBeNull();
    expect(day!.hours).toHaveLength(24);
    expect(day!.hours.slice(0, 12).every((h) => h.isDay)).toBe(true);
    expect(day!.hours.slice(12).every((h) => !h.isDay)).toBe(true);
    for (let i = 1; i < 24; i++) {
      expect(day!.hours[i].startUtc).toBe(day!.hours[i - 1].endUtc);
    }
  });

  it("runs one continuous Chaldean cycle with the day ruler first", () => {
    const day = planetaryDayHours({ civilDate: SUNDAY, ...NYC })!;
    expect(day.dayRuler).toBe("sun");
    expect(day.hours[0].planet).toBe("sun");
    const first = CHALDEAN_ORDER.indexOf(day.hours[0].planet);
    for (let i = 0; i < 24; i++) {
      expect(day.hours[i].planet).toBe(CHALDEAN_ORDER[(first + i) % 7]);
    }
  });

  it("matches DAY_PLANETS across a full week", () => {
    for (let offset = 0; offset < 7; offset++) {
      const day = planetaryDayHours({
        civilDate: { year: 2000, month: 1, day: 2 + offset },
        ...NYC,
      })!;
      expect(day.dayRuler).toBe(DAY_PLANETS[offset]);
    }
  });

  it("agrees with planetaryHour for an instant inside each span", () => {
    const day = planetaryDayHours({ civilDate: SUNDAY, ...NYC })!;
    for (const span of day.hours) {
      const mid = new Date(
        (new Date(span.startUtc).getTime() + new Date(span.endUtc).getTime()) /
          2,
      );
      // planetaryHour keys off the instant's own civil date; night hours
      // after midnight local belong to the next civil date.
      const civilDay = mid.getTime() >= Date.UTC(2000, 0, 3, 5, 0, 0) ? 3 : 2;
      const single = planetaryHour({
        civilDate: { year: 2000, month: 1, day: civilDay },
        utc: mid,
        ...NYC,
      });
      expect(single?.planet).toBe(span.planet);
      expect(single?.hourIndex).toBe(span.hourIndex);
      expect(single?.isDay).toBe(span.isDay);
    }
  });

  it("returns null where no sunrise/sunset exists (polar night)", () => {
    const day = planetaryDayHours({
      civilDate: { year: 2020, month: 12, day: 21 },
      latitude: 78.2232, // Longyearbyen
      longitude: 15.6267,
      tzId: "Europe/Oslo",
    });
    expect(day).toBeNull();
  });
});
