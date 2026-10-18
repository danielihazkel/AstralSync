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

/**
 * The tabs in four sections — what the chart is, what the names say, what
 * time is doing to it, and what the user brings — so the bar shows a short
 * row of sections and only the open section's tabs, instead of ten tabs
 * wrapping into three rows on a phone. TABS keeps its order (the 1–9 keys
 * and old links index it).
 */
export const TAB_GROUPS: ReadonlyArray<{ label: string; tabs: readonly Tab[] }> = [
  { label: "Natal", tabs: ["Chart", "Reading", "Details"] },
  { label: "Names & Mazal", tabs: ["Numerology", "Mazal"] },
  { label: "Timing", tabs: ["Transits", "Cycles", "Forecast"] },
  { label: "Personal", tabs: ["Journal", "Life events"] },
];

/** The section a tab sits in. */
export function groupOf(tab: Tab): (typeof TAB_GROUPS)[number] {
  return TAB_GROUPS.find((g) => g.tabs.includes(tab)) ?? TAB_GROUPS[0];
}
