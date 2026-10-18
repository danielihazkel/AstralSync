import { PLANETS, buildChart, norm360, positionsAt } from "@astralsync/astro-core";
import { computeProgressions } from "./cycles";
import { describe, expect, it } from "vitest";
import {
  decisiveness,
  scoreCandidates,
  sensitivity,
  sweepCandidates,
  sweepNotes,
  topCandidates,
  usableEventCount,
  type RectifyEvent,
} from "./rectification";

const PLACE = {
  birthDate: { year: 1985, month: 6, day: 14 },
  tzIana: "Asia/Jerusalem",
  lat: 32.08,
  lng: 34.78,
  overrideOffsetMinutes: null,
};

const TRUE_MINUTES = 14 * 60 + 20; // 14:20
const LAST = 24 * 60 - 1;

describe("sensitivity", () => {
  const day = sweepCandidates(PLACE, 0, 24 * 60 - 1, 10);

  it("covers the window without gaps", () => {
    const s = sensitivity(day);
    expect(s.ascendant[0].fromMinutes).toBe(0);
    expect(s.ascendant.at(-1)!.toMinutes).toBe(day.at(-1)!.minutes);
    for (let i = 1; i < s.ascendant.length; i++) {
      expect(s.ascendant[i].fromMinutes).toBe(s.ascendant[i - 1].toMinutes + 10);
    }
  });

  it("finds the Ascendant passing through all twelve signs in a day", () => {
    const signs = new Set(sensitivity(day).ascendant.map((s) => s.sign));
    expect(signs.size).toBe(12);
  });

  it("keeps the Moon in one or two signs over a day", () => {
    expect(sensitivity(day).moon.length).toBeLessThanOrEqual(2);
  });
});

describe("rectification", () => {
  // Plant the answer: for the true time, the ages at which the solar-arc
  // directed Ascendant and MC perfect a hard aspect to a natal planet —
  // about a degree a year — become the "life events", dated to the day.
  const [truth] = sweepCandidates(PLACE, TRUE_MINUTES, TRUE_MINUTES, 1);
  const birthMs = truth.utc.getTime();
  // The age at which the real solar arc (progressed Sun − natal Sun, the
  // same ephemeris the scorer uses) reaches `arc`, by bisection: the arc
  // grows monotonically, about a degree a year but not exactly.
  const arcAt = (age: number) =>
    norm360(
      positionsAt(new Date(birthMs + age * 86_400_000)).find((x) => x.planet === "sun")!
        .longitude - truth.planets.sun,
    );
  function ageForArc(arc: number): number | null {
    if (arc > 70) return null;
    let lo = 0;
    let hi = 75;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (arcAt(mid) < arc) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const events: RectifyEvent[] = [];
  let id = 1;
  for (const angle of ["ascendant", "mc"] as const) {
    for (const planet of PLANETS) {
      for (const aspect of [0, 90, 180, 270]) {
      const arc = norm360(truth.planets[planet] - aspect - truth[angle]);
      const age = ageForArc(arc);
      if (age === null || age < 2 || age > 60) continue;
      const at = new Date(birthMs + age * 365.2422 * 86_400_000);
      events.push({
        id: id++,
        title: `${angle} to ${planet}`,
        eventDate: at.toISOString().slice(0, 10),
        precision: "day",
        category: "other",
      });
      }
    }
  }

  it("plants enough events to test with", () => {
    expect(events.length).toBeGreaterThanOrEqual(4);
  });

  it("recovers the planted time from a ±2-hour window", () => {
    const window = sweepCandidates(PLACE, TRUE_MINUTES - 120, TRUE_MINUTES + 120, 2);
    const scored = scoreCandidates(window, events, PLACE);
    const [best] = topCandidates(scored, 3, 20);
    expect(Math.abs(best.minutes - TRUE_MINUTES)).toBeLessThanOrEqual(6);
  });

  it("still finds it among the top three from a sparse, partly month-dated record", () => {
    // Six events, every other one known only to the month — closer to what
    // a person actually remembers.
    const sparse = events
      .filter((_, i) => i % Math.max(1, Math.floor(events.length / 6)) === 0)
      .slice(0, 6)
      .map((e, i) =>
        i % 2 === 0
          ? e
          : { ...e, eventDate: `${e.eventDate.slice(0, 7)}-01`, precision: "month" as const },
      );
    const window = sweepCandidates(PLACE, TRUE_MINUTES - 120, TRUE_MINUTES + 120, 2);
    const top = topCandidates(scoreCandidates(window, sparse, PLACE), 3, 20);
    expect(top.some((t) => Math.abs(t.minutes - TRUE_MINUTES) <= 10)).toBe(true);
  });

  it("shows its working: every hit names an event, a technique and an orb", () => {
    const scored = scoreCandidates(
      sweepCandidates(PLACE, TRUE_MINUTES, TRUE_MINUTES, 1),
      events,
      PLACE,
    );
    const solarArc = scored[0].hits.filter((h) => h.technique === "solar_arc");
    // One counted hit per event and technique, and every planted event
    // lands: the plant solved for the real arc.
    expect(solarArc).toHaveLength(events.length);
    for (const h of scored[0].hits) {
      expect(events.some((e) => e.id === h.eventId)).toBe(true);
      expect(h.orb).toBeLessThanOrEqual(2.5);
      expect(h.weight).toBeGreaterThan(0);
    }
  });

  it("progresses the angles exactly as the Cycles tab does", () => {
    // Plant one event where the Cycles tab's progressed MC (solar arc in RA)
    // reaches a natal planet; the scorer's progressed hit must land on it.
    // Casting the angles at the progressed instant would miss: that clock
    // turns the MC ~361° per year of age.
    const natal = {
      ...buildChart({ utc: truth.utc, latitude: PLACE.lat, longitude: PLACE.lng }),
      tzWarnings: [],
    };
    const progMc = (age: number) =>
      computeProgressions(natal, new Date(birthMs + age * 365.2422 * 86_400_000))
        .chart.houses!.mc;
    // The first hard aspect to a natal planet the progressed MC perfects
    // after age 5.
    const ahead = (lon: number) => norm360(lon - natal.houses!.mc);
    const target = PLANETS.flatMap((p) =>
      [0, 90, 180, 270].map((a) => ({ p, d: ahead(truth.planets[p] - a) })),
    )
      .filter((x) => x.d > 5 && x.d < 60)
      .sort((a, b) => a.d - b.d)[0];
    let lo = 0;
    let hi = 70;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (ahead(progMc(mid)) < target.d) lo = mid;
      else hi = mid;
    }
    const at = new Date(birthMs + lo * 365.2422 * 86_400_000);
    const [scored] = scoreCandidates(
      [truth],
      [{ id: 1, title: "x", eventDate: at.toISOString().slice(0, 10), precision: "day", category: "other" }],
      PLACE,
    );
    const hit = scored.hits.find(
      (h) => h.technique === "progressed" && h.mover === "mc" && h.target === target.p,
    );
    expect(hit).toBeDefined();
    expect(hit!.orb).toBeLessThan(0.05);
  });

  it("weighs a year-only date less, and gives it no transits", () => {
    const one = sweepCandidates(PLACE, TRUE_MINUTES, TRUE_MINUTES, 1);
    const asDay = scoreCandidates(one, events.slice(0, 1), PLACE)[0];
    const asYear = scoreCandidates(
      one,
      [{ ...events[0], precision: "year" }],
      PLACE,
    )[0];
    expect(asYear.score).toBeLessThan(asDay.score);
    expect(asYear.hits.some((h) => h.technique === "transit")).toBe(false);
  });

  it("ignores events before birth", () => {
    const one = sweepCandidates(PLACE, TRUE_MINUTES, TRUE_MINUTES, 1);
    const before = scoreCandidates(
      one,
      [{ id: 99, title: "x", eventDate: "1980-01-01", precision: "day", category: "other" }],
      PLACE,
    )[0];
    expect(before.hits).toHaveLength(0);
  });
});

describe("sweep edges", () => {
  it("always scores the recorded time, even off the grid", () => {
    const c = sweepCandidates(PLACE, 0, 240, 3, [61]);
    expect(c.some((x) => x.minutes === 61)).toBe(true);
    expect(c.map((x) => x.minutes)).toEqual([...c.map((x) => x.minutes)].sort((a, b) => a - b));
    // Outside the window it is not forced in.
    expect(sweepCandidates(PLACE, 0, 60, 3, [500]).some((x) => x.minutes === 500)).toBe(false);
  });

  it("says when the window is cut at midnight", () => {
    expect(sweepNotes(PLACE, 23 * 60 - 120, 23 * 60 + 120).clipped).toBe(true);
    expect(sweepNotes(PLACE, 600, 840).clipped).toBe(false);
  });

  const NY = {
    tzIana: "America/New_York",
    lat: 40.71,
    lng: -74.01,
    overrideOffsetMinutes: null,
  };

  it("skips the wall times a spring-forward gap never had", () => {
    const place = { ...NY, birthDate: { year: 2026, month: 3, day: 8 } };
    const c = sweepCandidates(place, 60, 240, 30);
    expect(c.map((x) => x.minutes)).toEqual([60, 90, 180, 210, 240]);
    // No two candidates share an instant.
    expect(new Set(c.map((x) => x.utc.getTime())).size).toBe(c.length);
    expect(sweepNotes(place, 60, 240).clockChange).toBe("forward");
  });

  it("notes a fall-back fold", () => {
    const place = { ...NY, birthDate: { year: 2026, month: 11, day: 1 } };
    expect(sweepNotes(place, 0, 240).clockChange).toBe("back");
    expect(sweepNotes(place, 600, 840).clockChange).toBeNull();
  });

  it("notices a window that starts inside a gap", () => {
    // Santiago, 3 Sep 2023: 00:00 jumped to 01:00 — "Whole day" starts in it.
    const place = {
      tzIana: "America/Santiago",
      lat: -33.45,
      lng: -70.67,
      overrideOffsetMinutes: null,
      birthDate: { year: 2023, month: 9, day: 3 },
    };
    expect(sweepNotes(place, 0, LAST).clockChange).toBe("forward");
    expect(sweepCandidates(place, 0, 120, 30).map((x) => x.minutes)).toEqual([60, 90, 120]);
  });

  it("notices a window that ends inside a fold", () => {
    // New York, 1 Nov 2026: 01:00–01:59 happened twice; ±30 around 01:00.
    const place = { ...NY, birthDate: { year: 2026, month: 11, day: 1 } };
    expect(sweepNotes(place, 30, 90).clockChange).toBe("back");
  });

  it("stays quiet on an ordinary day, and under a manual offset", () => {
    const place = { ...NY, birthDate: { year: 2026, month: 6, day: 1 } };
    expect(sweepNotes(place, 0, LAST).clockChange).toBeNull();
    const fixed = { ...NY, birthDate: { year: 2026, month: 3, day: 8 }, overrideOffsetMinutes: -300 };
    expect(sweepNotes(fixed, 0, LAST).clockChange).toBeNull();
  });
});

describe("decisiveness", () => {
  const flat = (n: number) => ({ minutes: n, score: 3, hits: [] });

  it("calls a winner that barely beats the field inconclusive", () => {
    const scored = [flat(0), flat(2), flat(4), { minutes: 6, score: 3.5, hits: [] }];
    expect(decisiveness(scored).verdict).toBe("inconclusive");
  });

  it("calls a standout clear", () => {
    const scored = [flat(0), flat(2), flat(4), { minutes: 6, score: 9, hits: [] }];
    expect(decisiveness(scored)).toMatchObject({ ratio: 3, verdict: "clear" });
  });

  it("survives an empty window", () => {
    expect(decisiveness([]).verdict).toBe("inconclusive");
  });
});

describe("topCandidates and usableEventCount", () => {
  it("keeps distinct times apart and drops zero scores", () => {
    const scored = [
      { minutes: 600, score: 5, hits: [] },
      { minutes: 602, score: 4.9, hits: [] },
      { minutes: 700, score: 3, hits: [] },
      { minutes: 800, score: 0, hits: [] },
    ];
    expect(topCandidates(scored, 3, 20).map((s) => s.minutes)).toEqual([600, 700]);
  });

  it("counts only day and month dates", () => {
    const e = (precision: RectifyEvent["precision"]): RectifyEvent => ({
      id: 1, title: "", eventDate: "2000-01-01", precision, category: "other",
    });
    expect(usableEventCount([e("day"), e("month"), e("year")])).toBe(2);
  });
});
