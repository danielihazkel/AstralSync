import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHART_SETTINGS,
  sanitizeChartSettings,
} from "./chartSettings";

describe("sanitizeChartSettings", () => {
  it("returns defaults for empty storage", () => {
    expect(sanitizeChartSettings({})).toEqual(DEFAULT_CHART_SETTINGS);
    expect(
      sanitizeChartSettings({
        showPoints: null,
        nodeVariant: null,
        showMinorAspects: null,
      }),
    ).toEqual(DEFAULT_CHART_SETTINGS);
  });

  it("parses the stored non-default markers", () => {
    expect(
      sanitizeChartSettings({
        showPoints: "false",
        nodeVariant: "mean",
        showMinorAspects: "true",
      }),
    ).toEqual({ showPoints: false, nodeVariant: "mean", showMinorAspects: true });
  });

  it("accepts the legacy String(checked) writes", () => {
    // ChartWheel used to store "true" for checked boxes too.
    expect(sanitizeChartSettings({ showPoints: "true" }).showPoints).toBe(true);
    expect(
      sanitizeChartSettings({ showMinorAspects: "false" }).showMinorAspects,
    ).toBe(false);
    expect(sanitizeChartSettings({ nodeVariant: "true" }).nodeVariant).toBe(
      "true",
    );
  });

  it("falls back to defaults on garbage", () => {
    expect(
      sanitizeChartSettings({
        showPoints: "banana",
        nodeVariant: "banana",
        showMinorAspects: "banana",
      }),
    ).toEqual(DEFAULT_CHART_SETTINGS);
  });
});
