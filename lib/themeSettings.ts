/**
 * Per-browser theme preference. localStorage like the other client prefs
 * (settings.orbs, chart.showPoints, today.homeLocation) — never in the DB.
 *
 * "system" follows prefers-color-scheme; the default is "dark", the app's
 * original look. The resolved value lands on <html data-theme="…"> — set
 * before paint by ThemeScript, kept live by ThemeToggle.
 *
 * Parse/resolve logic is pure so node-env tests cover it without a DOM.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME: ThemePreference = "dark";

export const THEME_STORAGE_KEY = "settings.theme";

/**
 * Same-tab change signal ("storage" events only fire in other tabs). The
 * layout-mounted ThemeToggle never remounts on client navigation, so it
 * listens for this to stay in sync when the Settings page saves a theme.
 */
export const THEME_CHANGE_EVENT = "astralsync:themechange";

/** Pure: any stored string → valid preference (unknown falls back). */
export function sanitizeThemePreference(raw: unknown): ThemePreference {
  return raw === "light" || raw === "dark" || raw === "system"
    ? raw
    : DEFAULT_THEME;
}

/** Pure: preference + the media query's answer → the theme to render. */
export function resolveTheme(
  pref: ThemePreference,
  prefersLight: boolean,
): ResolvedTheme {
  if (pref === "system") return prefersLight ? "light" : "dark";
  return pref;
}

export function loadThemePreference(): ThemePreference {
  try {
    return sanitizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveThemePreference(pref: ThemePreference): void {
  try {
    if (pref === DEFAULT_THEME) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage full/blocked — the session keeps the in-memory value.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
}

/** Applies a resolved theme to the document root. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}
