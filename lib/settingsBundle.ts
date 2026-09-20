import {
  loadChartSettings,
  sanitizeChartSettings,
  saveChartSettings,
  type ChartDisplaySettings,
} from "./chartSettings";
import { loadHomeLocation, saveHomeLocation } from "./homeLocation";
import {
  loadOrbSettings,
  sanitizeOrbSettings,
  saveOrbSettings,
  type OrbSettings,
} from "./orbSettings";
import {
  loadThemePreference,
  sanitizeThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "./themeSettings";
import type { HomeLocation } from "./today";

/**
 * Every per-browser preference as one portable JSON document, so settings
 * can move between devices (they never live in the DB or in profile
 * exports). `collect` reads the four stores; `apply` validates a parsed
 * document field by field and writes only what it recognises — a partial
 * or foreign document leaves the missing preferences untouched.
 */

export interface SettingsBundle {
  settingsVersion: 1;
  theme: ThemePreference;
  orbs: OrbSettings;
  chart: ChartDisplaySettings;
  homeLocation: HomeLocation | null;
}

export function collectSettingsBundle(): SettingsBundle {
  return {
    settingsVersion: SETTINGS_VERSION,
    theme: loadThemePreference(),
    orbs: loadOrbSettings(),
    chart: loadChartSettings(),
    homeLocation: loadHomeLocation(),
  };
}

/**
 * Current settings-file format version.
 *
 * Like EXPORT_VERSION in lib/importProfile, the forward-compatibility
 * decision has one home: a file whose version this doesn't recognise is
 * refused rather than half-applied, and when the shape does change, the
 * upgrade belongs in parseSettingsBundle below. Adding a *new* preference
 * needs no bump — every field is read with `in` and sanitized
 * independently, so an older file simply carries fewer of them.
 */
export const SETTINGS_VERSION = 1;

/** Pure: unknown JSON → the recognised, sanitized parts of a bundle. Null
 *  when it isn't a settings document at all, or is a version this build
 *  cannot read. */
export function parseSettingsBundle(raw: unknown): Partial<SettingsBundle> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.settingsVersion !== SETTINGS_VERSION) return null;
  const out: Partial<SettingsBundle> = { settingsVersion: SETTINGS_VERSION };
  if ("theme" in r) out.theme = sanitizeThemePreference(r.theme);
  if ("orbs" in r) out.orbs = sanitizeOrbSettings(r.orbs);
  if (typeof r.chart === "object" && r.chart !== null) {
    const c = r.chart as Record<string, unknown>;
    // The chart store keeps strings; coerce the bundle's typed values.
    out.chart = sanitizeChartSettings({
      showPoints: c.showPoints === false ? "false" : null,
      nodeVariant: c.nodeVariant === "mean" ? "mean" : null,
      showMinorAspects: c.showMinorAspects === true ? "true" : null,
      chartView: c.chartView === "table" ? "table" : null,
      defaultHouseSystem:
        typeof c.defaultHouseSystem === "string" ? c.defaultHouseSystem : null,
    });
  }
  if ("homeLocation" in r) {
    const l = r.homeLocation as Record<string, unknown> | null;
    out.homeLocation =
      l !== null &&
      typeof l === "object" &&
      typeof l.lat === "number" &&
      typeof l.lng === "number" &&
      typeof l.tzIana === "string" &&
      typeof l.label === "string"
        ? (l as unknown as HomeLocation)
        : null;
  }
  return out;
}

/** Write a parsed bundle into the stores. Returns false when the document
 *  wasn't a settings bundle. A null homeLocation in the document is left
 *  alone — there is no "clear" affordance to mirror. */
export function applySettingsBundle(raw: unknown): boolean {
  const bundle = parseSettingsBundle(raw);
  if (!bundle) return false;
  if (bundle.theme !== undefined) saveThemePreference(bundle.theme);
  if (bundle.orbs !== undefined) saveOrbSettings(bundle.orbs);
  if (bundle.chart !== undefined) saveChartSettings(bundle.chart);
  if (bundle.homeLocation) saveHomeLocation(bundle.homeLocation);
  return true;
}
