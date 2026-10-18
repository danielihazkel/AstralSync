import {
  hebrewDayLabel,
  isChanukahLights,
  jewishEvents,
  type JewishCalendarOptions,
  type JewishEvent,
} from "@astralsync/hebrew-core";
import {
  browserTimeZone,
  loadHolidaySchedule,
  resolveIsraelSchedule,
} from "./holidaySchedule";
import { loadHomeLocation } from "./homeLocation";

/**
 * The Jewish calendar laid over a civil month for the calendar pages:
 * each day's Hebrew date label and its events. Client-side, loaded by
 * dynamic import like lib/skyCalendar — @hebcal/core stays out of the
 * pages' first bundle.
 */

export interface JewishDay {
  date: string;
  /** Day of the Hebrew month in letters, "ז׳". */
  hebrewDay: string;
  monthName: string;
  isFirstOfMonth: boolean;
  events: JewishEvent[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Every day of civil month `month1` (1–12) of `year`, keyed "YYYY-MM-DD". */
export function jewishMonth(
  year: number,
  month1: number,
  opts: JewishCalendarOptions,
): Record<string, JewishDay> {
  const last = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const events = jewishEvents(
    { year, month: month1, day: 1 },
    { year, month: month1, day: last },
    opts,
  );
  const days: Record<string, JewishDay> = {};
  for (let day = 1; day <= last; day++) {
    const date = `${year}-${pad(month1)}-${pad(day)}`;
    const label = hebrewDayLabel({ year, month: month1, day });
    days[date] = {
      date,
      hebrewDay: label.day,
      monthName: label.monthName,
      isFirstOfMonth: label.isFirstOfMonth,
      events: events.filter((e) => e.date === date),
    };
  }
  return days;
}

/**
 * The Jewish events for the Today strip at `now`, keyed to the same day as
 * its Hebrew date. Before sunset: today's observances and the times still
 * ahead (a passed candle-lighting drops off). After sunset the next Hebrew
 * day has begun, so the strip shows tomorrow's observances — on Erev Yom
 * Kippur evening, Yom Kippur — plus tonight's times still ahead (havdalah,
 * a fast's end). The omer count and the molad stay off the strip.
 */
export function jewishEventsNow(
  now: Date,
  day: { civilDate: string; afterSunset: boolean },
  opts: JewishCalendarOptions,
): JewishEvent[] {
  const [y, m, d] = day.civilDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrow = {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
  };
  const ahead = (e: JewishEvent) =>
    e.time !== null && Date.parse(e.time) >= now.getTime();
  return jewishEvents({ year: y, month: m, day: d }, tomorrow, opts).filter(
    (e) => {
      if (e.kind === "omer" || e.kind === "molad") return false;
      // Chanukah lights are lit all evening: tonight's stay on the strip
      // past their time and past sunset, and tomorrow's wait for tomorrow.
      if (isChanukahLights(e)) return e.date === day.civilDate;
      if (e.date === day.civilDate) {
        return day.afterSunset ? ahead(e) : e.time === null || ahead(e);
      }
      return day.afterSunset && e.time === null;
    },
  );
}

/** The browser's current options: the chosen schedule and, for times, the
 *  home location (never a birth city). */
export function currentJewishOptions(): JewishCalendarOptions {
  const home = loadHomeLocation();
  return {
    il: resolveIsraelSchedule(
      loadHolidaySchedule(),
      home?.tzIana ?? null,
      browserTimeZone(),
    ),
    location: home
      ? { lat: home.lat, lng: home.lng, tzIana: home.tzIana, label: home.label }
      : null,
  };
}

const HEADLINE_RANK: Partial<Record<JewishEvent["kind"], number>> = {
  holiday: 1,
  fast: 2,
  rosh_chodesh: 3,
  special_shabbat: 4,
  modern: 5,
  parasha: 6,
};

/**
 * The one event a small calendar cell names: a Yom Tov first, then other
 * holidays, untimed fasts, Rosh Chodesh, special Shabbatot, modern days and
 * the parasha. Times, the molad and the omer never headline — they belong
 * to the day's detail.
 */
export function headlineEvent(events: JewishEvent[]): JewishEvent | null {
  const candidates = events.filter(
    (e) => HEADLINE_RANK[e.kind] !== undefined && e.time === null,
  );
  candidates.sort(
    (a, b) =>
      Number(b.major) - Number(a.major) ||
      HEADLINE_RANK[a.kind]! - HEADLINE_RANK[b.kind]!,
  );
  return candidates[0] ?? null;
}
