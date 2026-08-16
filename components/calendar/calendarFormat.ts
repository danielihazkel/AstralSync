/** Shared local-time formatters for the calendar views (SkyCalendar's
 *  DayDetail and the /calendar/[date] almanac render the same phrasing). */

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayTitle(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
