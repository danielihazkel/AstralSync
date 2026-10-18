/**
 * Minimal RFC 5545 (iCalendar) writer for the app's calendar exports. Every
 * instant the engines produce is already an ISO-8601 UTC string, so events
 * are stamped in the UTC form (…Z) and calendar apps localize on display —
 * no VTIMEZONE needed. Instantaneous events (ingresses, quarters, stations,
 * aspect perfections, eclipse peaks) carry only DTSTART: per §3.6.1 an event
 * with a DATE-TIME start and no DTEND/DURATION consumes no time. Calendar
 * days (Jewish holidays, the parasha) are all-day DATE events. UIDs are
 * derived from event data so re-importing an export updates entries instead
 * of duplicating them.
 */

interface IcsEventBase {
  /** Stable id fragment derived from the event's data; "@astralsync" is appended. */
  uid: string;
  summary: string;
  description?: string;
}

/** Either an instant (or span) in UTC, or an all-day event on a civil date
 *  — a holiday belongs to a calendar day, not to an instant, and stamping
 *  it at UTC midnight would land it on the wrong day west of Greenwich. */
export type IcsEvent = IcsEventBase &
  (
    | {
        /** ISO-8601 UTC instant. */
        start: string;
        /** ISO-8601 UTC instant; omitted ⇒ instantaneous (no DTEND emitted). */
        end?: string;
        date?: never;
      }
    | {
        /** Civil "YYYY-MM-DD": an all-day event (DTSTART;VALUE=DATE). */
        date: string;
        start?: never;
        end?: never;
      }
  );

/** "YYYY-MM-DD" → RFC 5545 DATE form "YYYYMMDD". */
export function icsDate(date: string): string {
  return date.replaceAll("-", "");
}

/** The civil day after `date` — an all-day event's exclusive DTEND. */
function nextCivilDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** ISO UTC instant → RFC 5545 UTC form: "2026-08-14T12:30:00.000Z" → "20260814T123000Z". */
export function icsUtcStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** TEXT value escaping (§3.3.11): backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line at 75 octets (§3.1), continuation lines prefixed with
 * a single space. Folds count UTF-8 octets but never split inside a
 * character's byte sequence (the summaries carry ℞, °, →).
 */
export function foldIcsLine(line: string): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let current = "";
  let budget = 75; // continuation lines lose one octet to the leading space
  for (const ch of line) {
    const chBytes = bytes(ch);
    if (bytes(current) + chBytes > budget) {
      out.push(current);
      current = " ";
      budget = 75;
    }
    current += ch;
  }
  out.push(current);
  return out.join("\r\n");
}

export function buildIcs(
  events: IcsEvent[],
  opts: { calName: string; dtStamp?: string },
): string {
  const dtStamp = icsUtcStamp(opts.dtStamp ?? new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AstralSync//AstralSync//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(opts.calName)}`,
  ];
  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(ev.uid)}@astralsync`);
    lines.push(`DTSTAMP:${dtStamp}`);
    if (ev.date !== undefined) {
      // §3.6.1: a DATE start with a DTEND one day later is one whole day.
      lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(nextCivilDay(ev.date))}`);
    } else {
      lines.push(`DTSTART:${icsUtcStamp(ev.start)}`);
      if (ev.end !== undefined) lines.push(`DTEND:${icsUtcStamp(ev.end)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    if (ev.description !== undefined) {
      lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
