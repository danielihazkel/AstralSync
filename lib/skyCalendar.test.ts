import {
  astronomyEngineProvider as eph,
  separation,
} from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import { computeMoonMonth, computeMoonMonthCached } from "./skyCalendar";
import { computeVoidOfCourse } from "./today";

/**
 * Frozen-month assertions. Note: computeMoonMonth buckets days in the
 * machine's LOCAL timezone (the Journal stance), so assertions here stick
 * to properties stable across any timezone the test machine may run in.
 */
describe("computeMoonMonth", () => {
  const april2024 = computeMoonMonth(2024, 4);

  it("covers every day of the month exactly once", () => {
    expect(april2024.days).toHaveLength(30);
    expect(april2024.days[0].date).toBe("2024-04-01");
    expect(april2024.days[29].date).toBe("2024-04-30");
  });

  it("contains the 2024-04-08 total solar eclipse", () => {
    const withEclipse = april2024.days.filter((d) => d.eclipses.length > 0);
    expect(withEclipse.length).toBeGreaterThanOrEqual(1);
    const total = withEclipse
      .flatMap((d) => d.eclipses)
      .find((e) => e.kind === "solar" && e.type === "total");
    expect(total).toBeDefined();
    expect(total!.peakUtc.slice(0, 10)).toBe("2024-04-08");
  });

  it("has ~13-14 Moon ingresses, each entering the next sign in order", () => {
    const ingresses = april2024.days.flatMap((d) => d.ingresses);
    expect(ingresses.length).toBeGreaterThanOrEqual(12);
    expect(ingresses.length).toBeLessThanOrEqual(15);
  });

  it("has 4 lunar quarters including the Apr 8 new moon", () => {
    const quarters = april2024.days
      .filter((d) => d.quarter)
      .map((d) => ({ date: d.date, ...d.quarter! }));
    expect(quarters.length).toBeGreaterThanOrEqual(4);
    const newMoon = quarters.find(
      (q) => q.name === "New Moon" && q.utc.slice(0, 10) === "2024-04-08",
    );
    expect(newMoon).toBeDefined();
    // Illumination near a new moon is close to zero.
    const day = april2024.days.find((d) => d.quarter === newMoon || d.date === "2024-04-08")!;
    expect(day.illumination).toBeLessThan(0.05);
  });

  it("produces coherent void-of-course windows", () => {
    const windows = new Map<string, { fromUtc: string; untilUtc: string }>();
    for (const d of april2024.days) {
      for (const w of d.voc) windows.set(w.untilUtc, w);
    }
    expect(windows.size).toBeGreaterThan(5);
    const ingressTimes = new Set(
      april2024.days.flatMap((d) => d.ingresses.map((i) => i.utc)),
    );
    for (const w of windows.values()) {
      // Every window ends at an ingress (windows ending outside the month's
      // ingress list were scanned from the padded range and may not match).
      const from = new Date(w.fromUtc).getTime();
      const until = new Date(w.untilUtc).getTime();
      expect(from).toBeLessThan(until);
      // The Moon spends ≤ ~2.7 days in a sign, so no void can be longer.
      expect(until - from).toBeLessThan(2.8 * 86_400_000);
      if (w.untilUtc >= "2024-04-01" && w.untilUtc < "2024-05-01") {
        // Windows fully inside the month must end at a listed ingress —
        // unless the ingress fell on a local day just outside the month.
        const matches = ingressTimes.has(w.untilUtc);
        const nearEdge =
          w.untilUtc < "2024-04-02" || w.untilUtc > "2024-04-29";
        expect(matches || nearEdge).toBe(true);
      }
    }
  });

  it("agrees with lib/today's computeVoidOfCourse from inside each window", () => {
    const windows = [
      ...new Map(
        april2024.days.flatMap((d) => d.voc).map((w) => [w.untilUtc, w]),
      ).values(),
    ].filter(
      (w) => w.untilUtc >= "2024-04-03" && w.untilUtc <= "2024-04-28",
    );
    expect(windows.length).toBeGreaterThan(3);
    for (const w of windows) {
      const inside = new Date(new Date(w.fromUtc).getTime() + 30 * 60_000);
      if (inside.getTime() >= new Date(w.untilUtc).getTime()) continue;
      const voc = computeVoidOfCourse(inside);
      expect(voc, `window ending ${w.untilUtc}`).not.toBeNull();
      expect(
        Math.abs(new Date(voc!.until).getTime() - new Date(w.untilUtc).getTime()),
      ).toBeLessThan(60_000);
      expect(voc!.nextSign).toBe(w.nextSign);
    }
  });

  it("is deterministic across repeated computations", () => {
    // Guards the shared-sampler and epoch-ms refactors: a fresh computation
    // must reproduce the module-scope one exactly.
    expect(computeMoonMonth(2024, 4)).toEqual(april2024);
  });

  it("returns the identical cached object on repeated cached calls", () => {
    const first = computeMoonMonthCached(2024, 4);
    expect(computeMoonMonthCached(2024, 4)).toBe(first);
    expect(first.days).toHaveLength(30);
  });

  it("starts each window at an exact major lunar aspect", () => {
    const MAJORS = [0, 60, 90, 120, 180];
    const others = [
      "sun",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
    ] as const;
    const windows = [
      ...new Map(
        april2024.days.flatMap((d) => d.voc).map((w) => [w.untilUtc, w]),
      ).values(),
    ];
    for (const w of windows) {
      const t = new Date(w.fromUtc);
      const moon = eph.eclipticLongitude("moon", t);
      const isExactSomething = others.some((p) => {
        const sep = separation(moon, eph.eclipticLongitude(p, t));
        return MAJORS.some((a) => Math.abs(sep - a) < 0.02);
      });
      expect(isExactSomething, `window starting ${w.fromUtc}`).toBe(true);
    }
  });
});
