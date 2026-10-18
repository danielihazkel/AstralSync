import {
  hebrewDateOf,
  nextHebrewAnniversary,
  type AnniversaryKind,
} from "@astralsync/hebrew-core";
import type { IcsEvent } from "./ics";
import type { LifeEventCategory, LifeEventPrecision } from "./lifeEventMeta";

/**
 * Hebrew anniversaries of life events — the Jewish calendar meeting the
 * Life events tab. A day-dated event has a Hebrew date, and the date comes
 * round every Hebrew year: a wedding's Hebrew anniversary, a child's Hebrew
 * birthday, and for a loss the yahrzeit, kept by the mourning rules.
 *
 * Pure and client-safe, but it pulls in @hebcal/core: callers load it by
 * dynamic import (the lib/jewishMonth pattern) so hebcal stays out of the
 * pages' first bundle.
 *
 * Month- and year-dated events have no Hebrew day and are skipped. No time
 * of day is recorded, so an event is dated by its daytime Hebrew date — one
 * that happened after sunset belongs to the next Hebrew day, and the UI
 * says so.
 */

export interface AnniversaryEvent {
  id: number;
  title: string;
  eventDate: string;
  precision: LifeEventPrecision;
  category: LifeEventCategory;
}

export interface EventHebrewInfo {
  kind: AnniversaryKind;
  /** The event's own Hebrew date in letters. */
  hebrewDate: string;
  /** The next anniversary on or after the reference day; null only if
   *  hebcal finds none (not expected). */
  next: { date: string; hebrew: string; years: number } | null;
}

function civil(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function iso(c: { year: number; month: number; day: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
}

function nextDay(date: string): string {
  const { year, month, day } = civil(date);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** A loss is remembered by its yahrzeit; everything else by the plain
 *  Hebrew anniversary (the birthday rules). */
export function anniversaryKind(category: LifeEventCategory): AnniversaryKind {
  return category === "loss" ? "yahrzeit" : "anniversary";
}

/** The Hebrew date and next anniversary of a day-dated event, seen from
 *  `today` ("YYYY-MM-DD"); null for month- and year-dated events. */
export function eventHebrewInfo(
  event: AnniversaryEvent,
  today: string,
): EventHebrewInfo | null {
  if (event.precision !== "day") return null;
  const kind = anniversaryKind(event.category);
  const next = nextHebrewAnniversary(civil(event.eventDate), civil(today), kind);
  return {
    kind,
    hebrewDate: hebrewDateOf(civil(event.eventDate)),
    next: next && { date: iso(next.civil), hebrew: next.hebrew, years: next.years },
  };
}

/** The events whose Hebrew anniversary falls on `day` — the civil date
 *  the current Hebrew day belongs to (after sunset, tomorrow's). */
export function anniversariesOn<T extends AnniversaryEvent>(
  events: T[],
  day: string,
): Array<T & { info: EventHebrewInfo }> {
  const out: Array<T & { info: EventHebrewInfo }> = [];
  for (const e of events) {
    const info = eventHebrewInfo(e, day);
    if (info?.next?.date === day) out.push({ ...e, info });
  }
  return out;
}

/** "Yahrzeit — Grandpa (12th)" / "Hebrew anniversary — Wedding (5th)". */
export function anniversaryLabel(
  title: string,
  kind: AnniversaryKind,
  years: number,
): string {
  const n = years % 100;
  const suffix =
    n >= 11 && n <= 13
      ? "th"
      : years % 10 === 1
        ? "st"
        : years % 10 === 2
          ? "nd"
          : years % 10 === 3
            ? "rd"
            : "th";
  const head = kind === "yahrzeit" ? "Yahrzeit" : "Hebrew anniversary";
  return `${head} — ${title} (${years}${suffix})`;
}

/**
 * The next `years` Hebrew anniversaries of every day-dated event as
 * all-day calendar events. A Hebrew date drifts against the civil
 * calendar, so no RRULE can express it — each year is its own event. The
 * description notes that the day begins at the previous sunset.
 */
export function anniversaryIcsEvents(
  events: AnniversaryEvent[],
  today: string,
  years = 10,
): IcsEvent[] {
  const out: IcsEvent[] = [];
  for (const e of events) {
    if (e.precision !== "day") continue;
    const kind = anniversaryKind(e.category);
    let from = today;
    for (let i = 0; i < years; i++) {
      const next = nextHebrewAnniversary(civil(e.eventDate), civil(from), kind);
      if (!next) break;
      const date = iso(next.civil);
      out.push({
        uid: `hebrew-anniversary-${e.id}-${next.years}`,
        summary: anniversaryLabel(e.title, kind, next.years),
        description: `${next.hebrew} — begins at sunset the evening before.`,
        date,
      });
      from = nextDay(date);
    }
  }
  return out;
}
