import { describe, expect, it } from "vitest";
import { astronomyEngineProvider as eph } from "@astralsync/astro-core";
import { computeTransitGraphRows } from "./transitGraphCore";

const DAY_MS = 86_400_000;

describe("computeTransitGraphRows", () => {
  it("draws the Sun's conjunction window over a natal degree the Sun crosses in the range", () => {
    // Natal Sun at the Sun's longitude on 2024-06-10 → exact conjunction
    // (the solar return) inside a June 2024 range.
    const natalLon = eph.eclipticLongitude("sun", new Date(Date.UTC(2024, 5, 10)));
    const rows = computeTransitGraphRows(
      [{ planet: "sun", longitude: natalLon }],
      new Date(Date.UTC(2024, 5, 1)),
      new Date(Date.UTC(2024, 6, 1)),
    );
    expect(rows).toHaveLength(1);
    const conj = rows[0].bars.find((b) => b.transiter === "sun" && b.type === "conjunction");
    expect(conj).toBeDefined();
    expect(conj!.exactUtc.slice(0, 10)).toBe("2024-06-10");
    // 3° luminary orb ≈ 3 days each side.
    const entry = Date.parse(conj!.entryUtc);
    const exit = Date.parse(conj!.exitUtc);
    const exact = Date.parse(conj!.exactUtc);
    expect((exact - entry) / DAY_MS).toBeGreaterThan(2.7);
    expect((exit - exact) / DAY_MS).toBeLessThan(3.4);
    expect(conj!.retrograde).toBe(false);
    expect(conj!.pass).toEqual({ n: 1, of: 1 });
  });

  it("keeps a window that straddles the range edge and drops one that doesn't touch it", () => {
    const natalLon = eph.eclipticLongitude("sun", new Date(Date.UTC(2024, 5, 10)));
    // Range starts the day after the exact hit: the window still overlaps.
    const straddle = computeTransitGraphRows(
      [{ planet: "sun", longitude: natalLon }],
      new Date(Date.UTC(2024, 5, 11)),
      new Date(Date.UTC(2024, 5, 20)),
    );
    expect(
      straddle[0].bars.some((b) => b.type === "conjunction" && b.exactUtc.startsWith("2024-06-10")),
    ).toBe(true);
    // A range a month later sees no conjunction at all.
    const later = computeTransitGraphRows(
      [{ planet: "sun", longitude: natalLon }],
      new Date(Date.UTC(2024, 6, 20)),
      new Date(Date.UTC(2024, 6, 25)),
    );
    expect(later[0].bars.some((b) => b.type === "conjunction")).toBe(false);
  });

  it("honours custom orbs", () => {
    const natalLon = eph.eclipticLongitude("sun", new Date(Date.UTC(2024, 5, 10)));
    const wide = computeTransitGraphRows(
      [{ planet: "sun", longitude: natalLon }],
      new Date(Date.UTC(2024, 5, 1)),
      new Date(Date.UTC(2024, 6, 1)),
      { orbs: { luminary: 6, default: 6 } },
    );
    const conj = wide[0].bars.find((b) => b.transiter === "sun" && b.type === "conjunction")!;
    expect((Date.parse(conj.exactUtc) - Date.parse(conj.entryUtc)) / DAY_MS).toBeGreaterThan(5.5);
  });
});
