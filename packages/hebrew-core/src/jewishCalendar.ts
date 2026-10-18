import {
  CandleLightingEvent,
  HavdalahEvent,
  HDate,
  HebrewCalendar,
  Location,
  TimedEvent,
  flags,
  gematriya,
  type Event,
} from "@hebcal/core";
import { hdateFromCivil } from "./calendar";
import type { CivilDate } from "./types";

/**
 * The Jewish calendar layer: holidays, Rosh Chodesh, fasts, the weekly
 * parasha, special Shabbatot, the molad and the omer — and, given a place,
 * candle-lighting, havdalah and fast times. A thin, typed view over
 * HebrewCalendar.calendar so the app never touches hebcal's event classes.
 *
 * Every event lands on the civil day whose daytime it belongs to (hebcal's
 * convention: Erev Shabbat candle-lighting is listed on Friday). The schedule
 * — Israel or the Diaspora — is the caller's choice, because it changes the
 * holidays themselves (one day of Yom Tov or two) and the parasha.
 */

export type JewishEventKind =
  | "holiday"
  | "rosh_chodesh"
  | "fast"
  | "parasha"
  | "special_shabbat"
  | "modern"
  | "omer"
  | "molad"
  | "candles"
  | "havdalah";

export interface JewishEvent {
  /** Civil "YYYY-MM-DD" the event belongs to. */
  date: string;
  kind: JewishEventKind;
  title: string;
  titleHe: string;
  /** A Yom Tov (work forbidden) or a major fast. */
  major: boolean;
  /** ISO instant for candle-lighting, havdalah and fast start/end. */
  time: string | null;
}

export interface JewishCalendarOptions {
  /** Israeli holiday and parasha schedule (else the Diaspora's). */
  il: boolean;
  /** For candle-lighting, havdalah and fast times; omitted, none are given. */
  location?: { lat: number; lng: number; tzIana: string; label?: string } | null;
  omer?: boolean;
  molad?: boolean;
}

function civilOf(hd: HDate): CivilDate {
  const g = hd.greg();
  return { year: g.getFullYear(), month: g.getMonth() + 1, day: g.getDate() };
}

function iso(d: CivilDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

function kindOf(e: Event): JewishEventKind {
  const f = e.getFlags();
  if (e instanceof CandleLightingEvent || f & flags.CHANUKAH_CANDLES) return "candles";
  if (e instanceof HavdalahEvent) return "havdalah";
  // The only other timed events are a fast's start and end.
  if (e instanceof TimedEvent) return "fast";
  // Before the fast check: Yom Kippur is both, and reads as the holiday.
  if (f & flags.CHAG) return "holiday";
  if (f & (flags.MAJOR_FAST | flags.MINOR_FAST)) return "fast";
  if (f & flags.ROSH_CHODESH) return "rosh_chodesh";
  if (f & flags.PARSHA_HASHAVUA) return "parasha";
  if (f & flags.SPECIAL_SHABBAT) return "special_shabbat";
  if (f & flags.MODERN_HOLIDAY) return "modern";
  if (f & flags.OMER_COUNT) return "omer";
  if (f & flags.MOLAD) return "molad";
  return "holiday";
}

/** Every Jewish-calendar event from `from` through `to`, inclusive. */
export function jewishEvents(
  from: CivilDate,
  to: CivilDate,
  opts: JewishCalendarOptions,
): JewishEvent[] {
  const loc = opts.location
    ? new Location(
        opts.location.lat,
        opts.location.lng,
        opts.il,
        opts.location.tzIana,
        opts.location.label,
      )
    : undefined;
  const events = HebrewCalendar.calendar({
    // HDate bounds, not Dates: a Date would be read in the runtime's zone.
    start: hdateFromCivil(from),
    end: hdateFromCivil(to),
    il: opts.il,
    sedrot: true,
    candlelighting: loc !== undefined,
    location: loc,
    omer: opts.omer ?? false,
    molad: opts.molad ?? false,
  });
  return events.map((e) => {
    const f = e.getFlags();
    return {
      date: iso(civilOf(e.getDate())),
      kind: kindOf(e),
      title: e.render("en"),
      titleHe: e.render("he"),
      major: (f & (flags.CHAG | flags.MAJOR_FAST)) !== 0 && !(e instanceof TimedEvent),
      time: e instanceof TimedEvent ? e.eventTime.toISOString() : null,
    };
  });
}

/** Short Hebrew day label for a calendar cell: "ז׳", and the month name. */
export function hebrewDayLabel(civil: CivilDate): {
  day: string;
  monthName: string;
  isFirstOfMonth: boolean;
} {
  const hd = hdateFromCivil(civil);
  return {
    day: gematriya(hd.getDate()),
    monthName: hd.getMonthName(),
    isFirstOfMonth: hd.getDate() === 1,
  };
}

/**
 * The next Hebrew birthday on or after `from`: the Hebrew date of birth
 * (sunset-adjusted, as the Mazal snapshot stores it) observed in the
 * Hebrew year that holds it. hebcal's rules settle the hard cases — a
 * 30 Cheshvan or 30 Kislev birth in a short year, Adar in a leap year.
 */
export function nextHebrewBirthday(
  birth: { year: number; month: number; day: number },
  from: CivilDate,
): { civil: CivilDate; hebrew: string; age: number } {
  const birthHd = new HDate(birth.day, birth.month, birth.year);
  const startYear = hdateFromCivil(from).getFullYear();
  for (let hyear = startYear; hyear <= startYear + 1; hyear++) {
    const hd = HebrewCalendar.getBirthdayOrAnniversary(hyear, birthHd);
    if (!hd) continue;
    const civil = civilOf(hd);
    if (iso(civil) >= iso(from)) {
      return { civil, hebrew: hd.renderGematriya(), age: hyear - birth.year };
    }
  }
  // Unreachable: within two Hebrew years a birthday always falls on or
  // after any date. Kept total for the type checker.
  throw new Error("no Hebrew birthday within two years");
}
