import { astronomyEngineProvider, norm360 } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import {
  INTENT_PLANETS,
  lunarDayScan,
  lunarNatalScan,
  scoreDay,
  type ElectionalNatal,
} from "./electional";

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

  it("is deterministic across repeated calls", () => {
    const opts = {
      year: 2024,
      month: 4,
      day: 10,
      location: NYC,
      intent: "growth",
    } as const;
    expect(scoreDay(opts)).toEqual(scoreDay(opts));
  });

  it("rescores a new intent over the same lunar structure", () => {
    const base = { year: 2024, month: 4, day: 10, location: NYC } as const;
    const comm = scoreDay({ ...base, intent: "communication" });
    const love = scoreDay({ ...base, intent: "love" });
    // Intent changes the factors...
    expect(comm.windows.flatMap((w) => w.factors)).not.toEqual(
      love.windows.flatMap((w) => w.factors),
    );
    // ...but not the underlying day structure.
    expect(comm.moonSign).toBe(love.moonSign);
    expect(comm.dayRuler).toBe(love.dayRuler);
    expect(comm.windows.map((w) => w.startUtc)).toEqual(
      love.windows.map((w) => w.startUtc),
    );
  });

  it("caches the per-date scan (identical object on the second call)", () => {
    const first = lunarDayScan(2024, 4, 10);
    expect(lunarDayScan(2024, 4, 10)).toBe(first);
    expect(first.hits.length).toBeGreaterThan(0);
    expect(first.ingresses.length).toBeGreaterThan(0);
  });

  it("scores the Moon phase by intent, inverted for commitment", () => {
    // 2024-04-10 was two days after the Apr 8 new moon — waxing.
    const growth = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: "growth",
    });
    const waxes = growth.windows[0].factors.find(
      (f) => f.label === "Waxing Moon favors beginnings",
    );
    expect(waxes?.score).toBe(1);

    const commit = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: "commitment",
    });
    const offPhase = commit.windows[0].factors.find((f) =>
      f.label.startsWith("Waxing Moon"),
    );
    expect(offPhase?.score).toBe(0);

    // 2024-04-04 was before that new moon — waning: commitment gets the
    // credit, growth gets the informational reading.
    const waningCommit = scoreDay({
      year: 2024,
      month: 4,
      day: 4,
      location: null,
      intent: "commitment",
    });
    const consolidates = waningCommit.windows[0].factors.find(
      (f) => f.label === "Waning Moon suits consolidation",
    );
    expect(consolidates?.score).toBe(1);
    const noIntent = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: null,
    });
    expect(
      noIntent.windows[0].factors.some((f) => f.label.includes("Moon fav")),
    ).toBe(false);
  });

  it("penalizes a combust intent planet", () => {
    // Mercury's inferior conjunction fell on 2024-04-11: on the 10th it sat
    // a degree or two from the Sun — combust, well inside 8.5°.
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: "communication",
    });
    const combust = day.windows[0].factors.find(
      (f) => f.label === "Mercury is combust",
    );
    expect(combust?.score).toBe(-2);
    // The Sun intent never reads its own solar condition.
    const sunDay = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: "visibility",
    });
    expect(
      sunDay.windows[0].factors.some((f) => f.label.includes("cazimi")),
    ).toBe(false);
  });

  it("reads dignity for the elected Ascendant ruler and hour ruler", () => {
    // 2024-04-10: Sun exalted in Aries, Venus exalted in Pisces — both rule
    // hours (and rising signs) somewhere in any 24-hour day.
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: NYC,
      intent: null,
    });
    const factors = day.windows.flatMap((w) => w.factors);
    const hourDignities = factors.filter((f) =>
      /^Hour ruler .+ \((domicile|exaltation|detriment|fall)\)$/.test(f.label),
    );
    expect(hourDignities.length).toBeGreaterThan(0);
    const ascDignities = factors.filter((f) =>
      / rises; ruler .+ \((domicile|exaltation|detriment|fall)\)$/.test(
        f.label,
      ),
    );
    expect(ascDignities.length).toBeGreaterThan(0);
    for (const f of [...hourDignities, ...ascDignities]) {
      expect([-1, 1]).toContain(f.score);
      const dignified = /(domicile|exaltation)\)$/.test(f.label);
      expect(f.score).toBe(dignified ? 1 : -1);
    }
    // Chart-of-the-moment factors need a location.
    const dayless = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: null,
    });
    expect(
      dayless.windows[0].factors.some(
        (f) => f.label.includes("Hour ruler") || f.label.includes("rises;"),
      ),
    ).toBe(false);
  });

  it("adds day-level natal factors for benefic support and malefic affliction", () => {
    // Build the natal chart around the actual 2024-04-10 noon sky, so the
    // contacts are exact by construction: natal Sun trine transiting
    // Jupiter, natal Moon square transiting Saturn.
    const noon = new Date(2024, 3, 10, 12);
    const eph = astronomyEngineProvider;
    const natal: ElectionalNatal = {
      key: "test-v1",
      sunLongitude: norm360(eph.eclipticLongitude("jupiter", noon) - 120),
      moonLongitude: norm360(eph.eclipticLongitude("saturn", noon) - 90),
    };
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: null,
      natal,
    });
    const factors = day.windows[0].factors;
    const jupiter = factors.find(
      (f) => f.label === "Transiting Jupiter in a trine to your natal Sun",
    );
    expect(jupiter?.score).toBe(1);
    const saturn = factors.find(
      (f) => f.label === "Transiting Saturn in a square to your natal Moon",
    );
    expect(saturn?.score).toBe(-1);

    // Without a natal chart, no personal factor ever appears.
    const mundane = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: null,
    });
    expect(
      mundane.windows[0].factors.some((f) => f.label.includes("your natal")),
    ).toBe(false);
  });

  it("scores the Moon perfecting a contact to a natal luminary in-window", () => {
    // Natal Sun placed exactly where the transiting Moon sits at noon: the
    // conjunction perfects that day, inside the single whole-day window.
    const noon = new Date(2024, 3, 10, 12);
    const natal: ElectionalNatal = {
      key: "test-moonhit-v1",
      sunLongitude: astronomyEngineProvider.eclipticLongitude("moon", noon),
      moonLongitude: null,
    };
    const day = scoreDay({
      year: 2024,
      month: 4,
      day: 10,
      location: null,
      intent: null,
      natal,
    });
    const hit = day.windows[0].factors.find(
      (f) => f.label === "Moon perfects a conjunction to your natal Sun",
    );
    expect(hit?.score).toBe(1);
    // A null natal Moon never produces "your natal Moon" factors.
    expect(
      day.windows
        .flatMap((w) => w.factors)
        .some((f) => f.label.endsWith("your natal Moon")),
    ).toBe(false);
  });

  it("caches the Moon-to-natal scan per (date, natal key)", () => {
    const natal: ElectionalNatal = {
      key: "test-cache-v1",
      sunLongitude: 100,
      moonLongitude: 200,
    };
    const first = lunarNatalScan(2024, 4, 10, natal);
    expect(lunarNatalScan(2024, 4, 10, natal)).toBe(first);
    // A different natal key rescans rather than reusing the wrong chart.
    expect(
      lunarNatalScan(2024, 4, 10, { ...natal, key: "other-v2" }),
    ).not.toBe(first);
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
