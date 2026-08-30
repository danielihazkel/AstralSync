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
        chartView: "table",
      }),
    ).toEqual({
      showPoints: false,
      nodeVariant: "mean",
      showMinorAspects: true,
      chartView: "table",
      defaultHouseSystem: "placidus",
    });
  });

  it("accepts only the three house systems as a new-profile default", () => {
    expect(
      sanitizeChartSettings({ defaultHouseSystem: "whole_sign" })
        .defaultHouseSystem,
    ).toBe("whole_sign");
    expect(
      sanitizeChartSettings({ defaultHouseSystem: "equal" }).defaultHouseSystem,
    ).toBe("equal");
    expect(
      sanitizeChartSettings({ defaultHouseSystem: "koch" }).defaultHouseSystem,
    ).toBe("placidus");
  });

  it("reads only 'table' as a non-default chart view", () => {
    expect(sanitizeChartSettings({ chartView: "table" }).chartView).toBe(
      "table",
    );
    expect(sanitizeChartSettings({ chartView: "wheel" }).chartView).toBe(
      "wheel",
    );
    expect(sanitizeChartSettings({ chartView: "banana" }).chartView).toBe(
      "wheel",
    );
    expect(sanitizeChartSettings({}).chartView).toBe("wheel");
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
