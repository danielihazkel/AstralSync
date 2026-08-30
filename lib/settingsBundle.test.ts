import { describe, expect, it } from "vitest";
import { parseSettingsBundle } from "./settingsBundle";

describe("parseSettingsBundle", () => {
  it("rejects non-bundles", () => {
    expect(parseSettingsBundle(null)).toBeNull();
    expect(parseSettingsBundle("x")).toBeNull();
    expect(parseSettingsBundle({ exportVersion: 1 })).toBeNull();
    expect(parseSettingsBundle({ settingsVersion: 2 })).toBeNull();
  });

  it("sanitizes each recognised store and skips absent ones", () => {
    const parsed = parseSettingsBundle({
      settingsVersion: 1,
      theme: "light",
      orbs: { luminary: 40, default: "x", includeMinors: true },
      chart: {
        showPoints: false,
        nodeVariant: "mean",
        chartView: "table",
        defaultHouseSystem: "whole_sign",
      },
    });
    expect(parsed).toEqual({
      settingsVersion: 1,
      theme: "light",
      orbs: { luminary: 12, default: 2, minor: 2, includeMinors: true },
      chart: {
        showPoints: false,
        nodeVariant: "mean",
        showMinorAspects: false,
        chartView: "table",
        defaultHouseSystem: "whole_sign",
      },
    });
    expect(parsed).not.toHaveProperty("homeLocation");
  });

  it("keeps a well-formed home location and drops a malformed one", () => {
    const loc = { label: "Tel Aviv", lat: 32.08, lng: 34.78, tzIana: "Asia/Jerusalem" };
    expect(
      parseSettingsBundle({ settingsVersion: 1, homeLocation: loc })!.homeLocation,
    ).toEqual(loc);
    expect(
      parseSettingsBundle({ settingsVersion: 1, homeLocation: { lat: "1" } })!
        .homeLocation,
    ).toBeNull();
  });

  it("falls back to defaults for unknown values", () => {
    const parsed = parseSettingsBundle({
      settingsVersion: 1,
      theme: "sepia",
      chart: { defaultHouseSystem: "topocentric" },
    })!;
    expect(parsed.theme).toBe("dark");
    expect(parsed.chart!.defaultHouseSystem).toBe("placidus");
  });
});
