import {
  CandleLightingEvent,
  HavdalahEvent,
  HDate,
  HebrewCalendar,
  Location,
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

/** The instant of a timed event. Duck-typed, not `instanceof TimedEvent`:
 *  hebcal's TimedChanukahEvent extends ChanukahEvent, not TimedEvent. */
function eventTimeOf(e: Event): Date | null {
  const t = (e as { eventTime?: unknown }).eventTime;
  return t instanceof Date && !Number.isNaN(t.getTime()) ? t : null;
}

/** Chanukah's nightly lights, as opposed to Shabbat or Yom Tov
 *  candle-lighting: they belong to the whole evening, not to one minute. */
export function isChanukahLights(e: JewishEvent): boolean {
  return e.kind === "candles" && e.title.startsWith("Chanukah");
}

function kindOf(e: Event): JewishEventKind {
  const f = e.getFlags();
  if (e instanceof CandleLightingEvent || f & flags.CHANUKAH_CANDLES) return "candles";
  if (e instanceof HavdalahEvent) return "havdalah";
  // The only other timed events are a fast's start and end.
  if (eventTimeOf(e) !== null) return "fast";
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
      major: (f & (flags.CHAG | flags.MAJOR_FAST)) !== 0 && eventTimeOf(e) === null,
      time: eventTimeOf(e)?.toISOString() ?? null,
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

export type AnniversaryKind = "anniversary" | "yahrzeit";

export interface HebrewAnniversary {
  /** The civil day it falls on (it begins at the previous sunset). */
  civil: CivilDate;
  /** Its Hebrew date in letters. */
  hebrew: string;
  /** Hebrew years since the event. */
  years: number;
}

/**
 * The next Hebrew anniversary of a civil date, on or after `from` — the
 * event dated by its daytime Hebrew date (no time of day is recorded; an
 * event after sunset belongs to the next Hebrew day). A yahrzeit follows
 * the mourning rules (hebcal's getYahrzeit: a death in Adar of a common
 * year, or on 30 Cheshvan or 30 Kislev, moves by custom); any other
 * anniversary follows the birthday rules. The first anniversary is the
 * next Hebrew year's — nothing within the event's own year counts. Null
 * only if hebcal finds none within two years (not expected).
 */
export function nextHebrewAnniversary(
  event: CivilDate,
  from: CivilDate,
  kind: AnniversaryKind,
): HebrewAnniversary | null {
  const eventHd = hdateFromCivil(event);
  const startYear = Math.max(
    hdateFromCivil(from).getFullYear(),
    eventHd.getFullYear() + 1,
  );
  for (let hyear = startYear; hyear <= startYear + 1; hyear++) {
    const hd =
      kind === "yahrzeit"
        ? HebrewCalendar.getYahrzeit(hyear, eventHd)
        : HebrewCalendar.getBirthdayOrAnniversary(hyear, eventHd);
    if (!hd) continue;
    const civil = civilOf(hd);
    if (iso(civil) >= iso(from)) {
      return { civil, hebrew: hd.renderGematriya(), years: hyear - eventHd.getFullYear() };
    }
  }
  return null;
}

/** A civil date's (daytime) Hebrew date in letters, "ז׳ אדר תשפ״ו". */
export function hebrewDateOf(civil: CivilDate): string {
  return hdateFromCivil(civil).renderGematriya();
}
