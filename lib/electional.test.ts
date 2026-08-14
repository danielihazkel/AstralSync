import { describe, expect, it } from "vitest";
import { INTENT_PLANETS, scoreDay } from "./electional";

const NYC = {
  label: "New York",
  lat: 40.7128,
  lng: -74.006,
  tzIana: "America/New_York",
};

describe("scoreDay", () => {
  it("returns one whole-day window without a location", () => {
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: null,
    });
    expect(day.windows).toHaveLength(1);
    expect(day.windows[0].hourRuler).toBeNull();
    expect(day.date).toBe("2024-04-10");
  });

  it("returns 24 planetary-hour windows with a location", () => {
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: NYC,
      intent: null,
    });
    expect(day.windows).toHaveLength(24);
    for (let i = 1; i < 24; i++) {
      expect(day.windows[i].startUtc).toBe(day.windows[i - 1].endUtc);
    }
    // 2024-04-10 was a Wednesday: Mercury rules the day.
    expect(day.dayRuler).toBe("mercury");
  });

  it("marks void-of-course windows as avoid regardless of other factors", () => {
    // The Moon was void from the Apr 8 2024 eclipse conjunction until the
    // Taurus ingress — windows overlapping a void must never score "good".
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 8,
      location: NYC,
      intent: "growth",
    });
    const voided = day.windows.filter((w) =>
      w.factors.some((f) => f.label === "Moon void of course"),
    );
    expect(voided.length).toBeGreaterThan(0);
    for (const w of voided) expect(w.verdict).toBe("avoid");
  });

  it("credits the intent's planetary hour and day ruler", () => {
    // Wednesday + Mercury intent: the day-ruler credit applies everywhere,
    // and exactly the Mercury hours also get the hour credit.
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: NYC,
      intent: "communication",
    });
    const withDay = day.windows.filter((w) =>
      w.factors.some((f) => f.label === "Mercury rules the day"),
    );
    expect(withDay).toHaveLength(24);
    const withHour = day.windows.filter((w) =>
      w.factors.some((f) => f.label === "Mercury rules this hour"),
    );
    expect(withHour.length).toBeGreaterThanOrEqual(3);
    for (const w of withHour) expect(w.hourRuler).toBe("mercury");
  });

  it("penalizes Mercury retrograde only for Mercury intents", () => {
    // Mercury was retrograde across 2024-04-10.
    const comm = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: "communication",
    });
    expect(comm.mercuryRetrograde).toBe(true);
    const f = comm.windows[0].factors.find((x) =>
      x.label.startsWith("Mercury is retrograde"),
    );
    expect(f?.score).toBe(-1);

    const love = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: "love",
    });
    const g = love.windows[0].factors.find((x) =>
      x.label.startsWith("Mercury is retrograde"),
    );
    expect(g?.score).toBe(0);
  });

  it("labels the Moon's applying aspect with a bounded score", () => {
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 12,
      location: NYC,
      intent: null,
    });
    const applying = day.windows
      .flatMap((w) => w.factors)
      .filter((f) => f.label.startsWith("Moon applying"));
    expect(applying.length).toBeGreaterThan(0);
    for (const f of applying) {
      expect(f.score).toBeGreaterThanOrEqual(-2);
      expect(f.score).toBeLessThanOrEqual(2);
    }
  });

  it("keeps every intent mapped to a classical planet", () => {
    for (const planet of Object.values(INTENT_PLANETS)) {
      expect([
        "sun",
        "moon",
        "mercury",
        "venus",
        "mars",
        "jupiter",
        "saturn",
      ]).toContain(planet);
    }
  });
});
