import type { NodeVariant } from "@astralsync/astro-core";

/**
 * Per-browser chart-wheel display preferences, extracted from ChartWheel so
 * the Settings page can edit them too. The storage shape predates this
 * module and is kept byte-compatible: each key is written only when it
 * differs from the default and removed otherwise (themeSettings-style).
 * Parse logic is pure so node-env tests cover it without a DOM.
 */

export interface ChartDisplaySettings {
  showPoints: boolean;
  nodeVariant: NodeVariant;
  showMinorAspects: boolean;
}

export const DEFAULT_CHART_SETTINGS: ChartDisplaySettings = {
  showPoints: true,
  nodeVariant: "true",
  showMinorAspects: false,
};

export const SHOW_POINTS_KEY = "chart.showPoints";
export const NODE_VARIANT_KEY = "chart.nodeVariant";
export const SHOW_MINOR_ASPECTS_KEY = "chart.showMinorAspects";

/** Pure: raw stored strings → valid settings (unknown values → defaults). */
export function sanitizeChartSettings(raw: {
  showPoints?: string | null;
  nodeVariant?: string | null;
  showMinorAspects?: string | null;
}): ChartDisplaySettings {
  return {
    // Historically stored as String(checked), so "true" may exist too —
    // anything but the non-default marker reads as the default.
    showPoints: raw.showPoints !== "false",
    nodeVariant: raw.nodeVariant === "mean" ? "mean" : "true",
    showMinorAspects: raw.showMinorAspects === "true",
  };
}

export function loadChartSettings(): ChartDisplaySettings {
  try {
    return sanitizeChartSettings({
      showPoints: localStorage.getItem(SHOW_POINTS_KEY),
      nodeVariant: localStorage.getItem(NODE_VARIANT_KEY),
      showMinorAspects: localStorage.getItem(SHOW_MINOR_ASPECTS_KEY),
    });
  } catch {
    return DEFAULT_CHART_SETTINGS;
  }
}

export function saveChartSettings(s: ChartDisplaySettings): void {
  try {
    if (s.showPoints) localStorage.removeItem(SHOW_POINTS_KEY);
    else localStorage.setItem(SHOW_POINTS_KEY, "false");
    if (s.nodeVariant === "true") localStorage.removeItem(NODE_VARIANT_KEY);
    else localStorage.setItem(NODE_VARIANT_KEY, "mean");
    if (s.showMinorAspects)
      localStorage.setItem(SHOW_MINOR_ASPECTS_KEY, "true");
    else localStorage.removeItem(SHOW_MINOR_ASPECTS_KEY);
  } catch {
    // Storage full/blocked — the session keeps the in-memory value.
  }
}
