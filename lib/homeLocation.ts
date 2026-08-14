import type { HomeLocation } from "./today";

/**
 * The per-browser "home location" (planetary hours on Today, electional
 * windows on the Sky Calendar). Extracted from TodayDashboard so both pages
 * share one key; birth cities are never assumed. Type-only dependency on
 * lib/today keeps this module free of the ephemeris bundle.
 */

export const LOCATION_KEY = "today.homeLocation";

export function loadHomeLocation(): HomeLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeLocation;
    return typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      typeof parsed.tzIana === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function saveHomeLocation(loc: HomeLocation): void {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
  } catch {
    // Storage full/blocked — the session keeps the in-memory value.
  }
}
