import { describe, expect, it } from "vitest";
import { astronomyEngineProvider, findStations } from "../src";

/**
 * Provider-level tests for the finite-difference derived quantities —
 * previously exercised only through consumers. The retrograde flag and
 * longitudeSpeed both use a ±1h central difference, so the interesting
 * boundary is a station, where the sign flips.
 */

const DAY_MS = 86_400_000;

describe("astronomyEngineProvider", () => {
  it("self-reports engine metadata for snapshots", () => {
    expect(astronomyEngineProvider.name).toBe("astronomy-engine");
    expect(astronomyEngineProvider.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("flips the retrograde flag across Mercury's 2023 spring stations", () => {
    // Mercury stationed retrograde ~Apr 21 and direct ~May 15, 2023 (the
    // pair scan.test.ts pins to within a day).
    const stations = findStations(
      new Date(Date.UTC(2023, 3, 1)),
      new Date(Date.UTC(2023, 4, 20)),
      ["mercury"],
    );
    expect(stations).toHaveLength(2);
    expect(stations[0].direction).toBe("retrograde");
    expect(stations[1].direction).toBe("direct");
    for (const s of stations) {
      const before = new Date(s.utc.getTime() - 2 * DAY_MS);
      const after = new Date(s.utc.getTime() + 2 * DAY_MS);
      expect(astronomyEngineProvider.isRetrograde("mercury", before)).not.toBe(
        astronomyEngineProvider.isRetrograde("mercury", after),
      );
    }
  });

  it("keeps longitudeSpeed's sign consistent with the retrograde flag", () => {
    // Deep inside the loop vs. well outside it.
    const retro = new Date(Date.UTC(2023, 4, 1));
    const direct = new Date(Date.UTC(2023, 5, 15));
    expect(astronomyEngineProvider.isRetrograde("mercury", retro)).toBe(true);
    expect(
      astronomyEngineProvider.longitudeSpeed("mercury", retro),
    ).toBeLessThan(0);
    expect(astronomyEngineProvider.isRetrograde("mercury", direct)).toBe(false);
    expect(
      astronomyEngineProvider.longitudeSpeed("mercury", direct),
    ).toBeGreaterThan(0);
  });

  it("keeps the Sun and Moon direct (never retrograde from the geocenter)", () => {
    for (const m of [0, 3, 6, 9]) {
      const t = new Date(Date.UTC(2026, m, 15));
      expect(astronomyEngineProvider.isRetrograde("sun", t)).toBe(false);
      expect(astronomyEngineProvider.isRetrograde("moon", t)).toBe(false);
      expect(astronomyEngineProvider.longitudeSpeed("moon", t)).toBeGreaterThan(
        11,
      );
    }
  });
});
