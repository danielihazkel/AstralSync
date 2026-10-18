/**
 * Per-browser choice of Jewish holiday schedule — Israel's or the
 * Diaspora's. It changes the holidays themselves (one day of Yom Tov or
 * two) and, for part of most years, the weekly parasha, so the calendar
 * cannot guess silently: "auto" follows the home location's zone, else
 * the browser's own, and Settings can pin either.
 *
 * localStorage like the other client prefs (themeSettings is the idiom);
 * parse/resolve logic is pure so node-env tests cover it.
 */

export type HolidaySchedule = "auto" | "israel" | "diaspora";

export const DEFAULT_HOLIDAY_SCHEDULE: HolidaySchedule = "auto";

export const HOLIDAY_SCHEDULE_KEY = "calendar.holidaySchedule";

/** Israel's IANA zone and its legacy alias. */
const ISRAEL_ZONES = new Set(["Asia/Jerusalem", "Asia/Tel_Aviv"]);

export function sanitizeHolidaySchedule(raw: unknown): HolidaySchedule {
  return raw === "israel" || raw === "diaspora" || raw === "auto"
    ? raw
    : DEFAULT_HOLIDAY_SCHEDULE;
}

/** Pure: the preference, the home location's zone (if set) and the
 *  browser's zone → whether to use the Israeli schedule. */
export function resolveIsraelSchedule(
  pref: HolidaySchedule,
  homeZone: string | null,
  browserZone: string | null,
): boolean {
  if (pref !== "auto") return pref === "israel";
  return ISRAEL_ZONES.has(homeZone ?? browserZone ?? "");
}

export function loadHolidaySchedule(): HolidaySchedule {
  try {
    return sanitizeHolidaySchedule(localStorage.getItem(HOLIDAY_SCHEDULE_KEY));
  } catch {
    return DEFAULT_HOLIDAY_SCHEDULE;
  }
}

export function saveHolidaySchedule(pref: HolidaySchedule): void {
  try {
    if (pref === DEFAULT_HOLIDAY_SCHEDULE) localStorage.removeItem(HOLIDAY_SCHEDULE_KEY);
    else localStorage.setItem(HOLIDAY_SCHEDULE_KEY, pref);
  } catch {
    // Storage full/blocked — the session keeps the in-memory value.
  }
}

/** The browser's IANA zone, or null when the runtime cannot name it. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
