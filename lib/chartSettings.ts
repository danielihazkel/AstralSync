import type { HouseSystem, NodeVariant } from "@astralsync/astro-core";

/**
 * Per-browser chart-wheel display preferences, extracted from ChartWheel so
 * the Settings page can edit them too. The storage shape predates this
 * module and is kept byte-compatible: each key is written only when it
 * differs from the default and removed otherwise (themeSettings-style).
 * Parse logic is pure so node-env tests cover it without a DOM.
 */

export type ChartView = "wheel" | "table";

export interface ChartDisplaySettings {
  showPoints: boolean;
  nodeVariant: NodeVariant;
  showMinorAspects: boolean;
  /** Preferred chart rendering: the SVG wheel or the accessible tables. */
  chartView: ChartView;
  /** House system a NEW profile starts with (the wizard's default). Existing
   *  profiles keep their own per-version choice. */
  defaultHouseSystem: HouseSystem;
}

export const DEFAULT_CHART_SETTINGS: ChartDisplaySettings = {
  showPoints: true,
  nodeVariant: "true",
  showMinorAspects: false,
  chartView: "wheel",
  defaultHouseSystem: "placidus",
};

export const SHOW_POINTS_KEY = "chart.showPoints";
export const NODE_VARIANT_KEY = "chart.nodeVariant";
export const SHOW_MINOR_ASPECTS_KEY = "chart.showMinorAspects";
export const CHART_VIEW_KEY = "chart.view";
export const DEFAULT_HOUSE_SYSTEM_KEY = "chart.houseSystem";

const HOUSE_SYSTEMS: readonly HouseSystem[] = [
  "placidus",
  "whole_sign",
  "equal",
  "porphyry",
  "koch",
  "regiomontanus",
  "campanus",
  "alcabitius",
];

/** Pure: raw stored strings → valid settings (unknown values → defaults). */
export function sanitizeChartSettings(raw: {
  showPoints?: string | null;
  nodeVariant?: string | null;
  showMinorAspects?: string | null;
  chartView?: string | null;
  defaultHouseSystem?: string | null;
}): ChartDisplaySettings {
  return {
    // Historically stored as String(checked), so "true" may exist too —
    // anything but the non-default marker reads as the default.
    showPoints: raw.showPoints !== "false",
    nodeVariant: raw.nodeVariant === "mean" ? "mean" : "true",
    showMinorAspects: raw.showMinorAspects === "true",
    chartView: raw.chartView === "table" ? "table" : "wheel",
    defaultHouseSystem: HOUSE_SYSTEMS.includes(
      raw.defaultHouseSystem as HouseSystem,
    )
      ? (raw.defaultHouseSystem as HouseSystem)
      : "placidus",
  };
}

export function loadChartSettings(): ChartDisplaySettings {
  try {
    return sanitizeChartSettings({
      showPoints: localStorage.getItem(SHOW_POINTS_KEY),
      nodeVariant: localStorage.getItem(NODE_VARIANT_KEY),
      showMinorAspects: localStorage.getItem(SHOW_MINOR_ASPECTS_KEY),
      chartView: localStorage.getItem(CHART_VIEW_KEY),
      defaultHouseSystem: localStorage.getItem(DEFAULT_HOUSE_SYSTEM_KEY),
    });
  } catch {
    return DEFAULT_CHART_SETTINGS;
  }
}

/** Persist a full settings object or a partial patch — a patch is merged
 *  over what is stored, so a component that owns only some of the fields
 *  (the wheel's toggles) never clobbers the others. */
export function saveChartSettings(patch: Partial<ChartDisplaySettings>): void {
  const s: ChartDisplaySettings = { ...loadChartSettings(), ...patch };
  try {
    if (s.showPoints) localStorage.removeItem(SHOW_POINTS_KEY);
    else localStorage.setItem(SHOW_POINTS_KEY, "false");
    if (s.nodeVariant === "true") localStorage.removeItem(NODE_VARIANT_KEY);
    else localStorage.setItem(NODE_VARIANT_KEY, "mean");
    if (s.showMinorAspects)
      localStorage.setItem(SHOW_MINOR_ASPECTS_KEY, "true");
    else localStorage.removeItem(SHOW_MINOR_ASPECTS_KEY);
    if (s.chartView === "table") localStorage.setItem(CHART_VIEW_KEY, "table");
    else localStorage.removeItem(CHART_VIEW_KEY);
    if (s.defaultHouseSystem === "placidus")
      localStorage.removeItem(DEFAULT_HOUSE_SYSTEM_KEY);
    else localStorage.setItem(DEFAULT_HOUSE_SYSTEM_KEY, s.defaultHouseSystem);
  } catch {
    // Storage full/blocked — the session keeps the in-memory value.
  }
}
