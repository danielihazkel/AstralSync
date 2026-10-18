import {
  ageOn,
  personalYear,
  pinnacleAt,
  pinnacles,
  type CycleNumber,
  type Pinnacle,
} from "@astralsync/numero-core";
import type { LifeEventPrecision } from "./lifeEventMeta";

/**
 * Numerology timing for a life event — client-safe (numero-core only), so
 * the event-sky expander and the Life Story prompt share one rule.
 *
 * The personal year is exact at every precision: it runs on calendar
 * years, and a month- or year-only date never leaves its year. The
 * pinnacle turns on a birthday, so it is given only when the whole span
 * the date could mean falls inside one pinnacle; otherwise null.
 */
export interface EventNumerology {
  personalYear: CycleNumber;
  pinnacle: Pinnacle | null;
}

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function eventNumerology(
  /** Civil birth date "YYYY-MM-DD". */
  birthDate: string,
  event: { eventDate: string; precision: LifeEventPrecision },
): EventNumerology {
  const birth = parts(birthDate);
  const start = parts(event.eventDate);
  const end =
    event.precision === "day"
      ? start
      : event.precision === "month"
        ? {
            ...start,
            day: new Date(Date.UTC(start.year, start.month, 0)).getUTCDate(),
          }
        : { year: start.year, month: 12, day: 31 };
  const list = pinnacles(birth);
  const from = pinnacleAt(list, ageOn(birth, start));
  const to = pinnacleAt(list, ageOn(birth, end));
  return {
    personalYear: personalYear(birth, start.year),
    pinnacle: from === to ? from : null,
  };
}
