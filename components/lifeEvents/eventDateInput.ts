/** Pure date-input helpers for the Life Events tab (tested in
 *  eventDateInput.test.ts). The stored form is always a canonical
 *  "YYYY-MM-DD" — day 01 for month precision, January 01 for year
 *  precision (lib/lifeEventMeta.ts). */

import type { LifeEventPrecision } from "@/lib/lifeEventMeta";

/** Same comfort zone as the Journal date picker (journalDate.ts). */
export const MIN_EVENT_DATE = "1700-01-01";
export const MAX_EVENT_DATE = "2199-12-31";
export const MIN_EVENT_YEAR = 1700;
export const MAX_EVENT_YEAR = 2199;

/** The three native inputs' values: `<input type="date">` ("YYYY-MM-DD"),
 *  `<input type="month">` ("YYYY-MM"), `<input type="number">` (year). */
export interface EventDateInputs {
  day: string;
  month: string;
  year: string;
}

/**
 * Input values → the canonical stored date for the active precision, or
 * null while the relevant input is empty/malformed/out of range.
 */
export function dateFromInputs(
  precision: LifeEventPrecision,
  inputs: EventDateInputs,
): string | null {
  if (precision === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputs.day)) return null;
    return inputs.day >= MIN_EVENT_DATE && inputs.day <= MAX_EVENT_DATE
      ? inputs.day
      : null;
  }
  if (precision === "month") {
    if (!/^\d{4}-\d{2}$/.test(inputs.month)) return null;
    const date = `${inputs.month}-01`;
    return date >= MIN_EVENT_DATE && date <= MAX_EVENT_DATE ? date : null;
  }
  if (!/^\d{4}$/.test(inputs.year)) return null;
  const y = Number(inputs.year);
  return y >= MIN_EVENT_YEAR && y <= MAX_EVENT_YEAR ? `${inputs.year}-01-01` : null;
}

/** Canonical stored date → the three inputs' values (for the edit form). */
export function inputsFromEvent(
  eventDate: string,
  precision: LifeEventPrecision,
): EventDateInputs {
  return {
    day: precision === "day" ? eventDate : "",
    month: precision === "month" ? eventDate.slice(0, 7) : "",
    year: eventDate.slice(0, 4),
  };
}
