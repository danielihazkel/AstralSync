/** URL `?tab=` values for the profile tabs — lowercase slugs, stable,
 *  bookmarkable ("Life events" → "life-events"). */

export const TABS = [
  "Chart",
  "Reading",
  "Numerology",
  "Mazal",
  "Transits",
  "Cycles",
  "Forecast",
  "Journal",
  "Life events",
  "Details",
] as const;
export type Tab = (typeof TABS)[number];

export function paramFromTab(tab: Tab): string {
  return tab.toLowerCase().replace(/\s+/g, "-");
}

/** Case-insensitive; spaces normalize to the slug's dashes; unknown or
 *  missing values fall back to the Chart tab. */
export function tabFromParam(raw: string | null): Tab {
  if (raw === null) return "Chart";
  const slug = raw.toLowerCase().replace(/\s+/g, "-");
  return TABS.find((t) => paramFromTab(t) === slug) ?? "Chart";
}
