/**
 * Life-event vocabulary — the canonical category and date-precision unions
 * plus the shared date helpers. Pure and dependency-free so client
 * components and the prompt renderer both import it statically (the
 * journalMeta stance); lib/lifeEvents.ts casts Prisma's generated enums to
 * these unions at the store boundary. Keep LIFE_EVENT_CATEGORIES and
 * LIFE_EVENT_PRECISIONS in sync with the LifeEventCategory and
 * LifeEventPrecision enums in prisma/schema.prisma.
 */

export const LIFE_EVENT_CATEGORIES = [
  "marriage",
  "child",
  "career",
  "relocation",
  "loss",
  "health",
  "education",
  "other",
] as const;

export type LifeEventCategory = (typeof LIFE_EVENT_CATEGORIES)[number];

/** Display labels (also rendered into the Life Story prompt). */
export const LIFE_EVENT_CATEGORY_LABELS: Record<LifeEventCategory, string> = {
  marriage: "Marriage & partnership",
  child: "Children",
  career: "Career & work",
  relocation: "Relocation",
  loss: "Loss",
  health: "Health",
  education: "Education",
  other: "Other",
};

export const LIFE_EVENT_PRECISIONS = ["day", "month", "year"] as const;

export type LifeEventPrecision = (typeof LIFE_EVENT_PRECISIONS)[number];

export const MAX_LIFE_EVENT_TITLE = 120;
export const MAX_LIFE_EVENT_NOTES = 5_000;
/** Hard cap per profile: nothing downstream of the prompt builders
 *  truncates, so the store refuses further events rather than letting the
 *  Life Story prompt grow without bound. */
export const MAX_LIFE_EVENTS_PER_PROFILE = 200;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * True when a "YYYY-MM-DD" string is the canonical stored form for the
 * precision: any real day for "day", day 01 for "month", January 01 for
 * "year". Calendar validity is validation's job (civilDateString).
 */
export function isCanonicalEventDate(
  date: string,
  precision: LifeEventPrecision,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (precision === "year") return date.slice(5) === "01-01";
  if (precision === "month") return date.slice(8) === "01";
  return true;
}

/**
 * Canonical date → what the user actually knows: "March 12, 2014" (day),
 * "March 2014" (month), "2014" (year). Pure string math — no Date, no
 * locale — so it is SSR-safe like components/format.ts formatBirthDate.
 */
export function formatEventDate(
  date: string,
  precision: LifeEventPrecision,
): string {
  const [y, m, d] = date.split("-").map(Number);
  if (precision === "year") return String(y);
  const month = MONTH_NAMES[m - 1] ?? "";
  if (precision === "month") return `${month} ${y}`;
  return `${month} ${d}, ${y}`;
}
