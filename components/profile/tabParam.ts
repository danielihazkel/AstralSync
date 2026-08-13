/** URL `?tab=` values for the profile tabs — lowercase, stable, bookmarkable. */

export const TABS = [
  "Chart",
  "Reading",
  "Numerology",
  "Mazal",
  "Transits",
  "Cycles",
  "Forecast",
  "Details",
] as const;
export type Tab = (typeof TABS)[number];

export function paramFromTab(tab: Tab): string {
  return tab.toLowerCase();
}

/** Case-insensitive; unknown or missing values fall back to the Chart tab. */
export function tabFromParam(raw: string | null): Tab {
  if (raw === null) return "Chart";
  const lower = raw.toLowerCase();
  return TABS.find((t) => t.toLowerCase() === lower) ?? "Chart";
}
