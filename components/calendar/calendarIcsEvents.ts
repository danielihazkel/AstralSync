import type { ElectionalDay } from "@/lib/electional";
import type { IcsEvent } from "@/lib/ics";
import { icsUtcStamp } from "@/lib/ics";
import type { MoonMonth } from "@/lib/skyCalendar";
import {
  CLASSICAL_PLANET_LABELS,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";

/**
 * Pure MoonMonth/ElectionalDay → IcsEvent mappers. They live in components/
 * (not lib/) because they lean on the UI's label maps; summaries mirror the
 * phrasing the calendar views render, so an imported calendar reads like the
 * app.
 */

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

export function moonMonthIcsEvents(month: MoonMonth): IcsEvent[] {
  const events: IcsEvent[] = [];
  // VoC windows and eclipses are listed on every local day they touch —
  // dedupe before emitting one event per window/peak.
  const vocSeen = new Set<string>();
  const eclipseSeen = new Set<string>();

  for (const day of month.days) {
    if (day.quarter) {
      events.push({
        uid: `quarter-${icsUtcStamp(day.quarter.utc)}`,
        summary: day.quarter.name,
        start: day.quarter.utc,
      });
    }
    for (const i of day.ingresses) {
      events.push({
        uid: `moon-ingress-${icsUtcStamp(i.utc)}`,
        summary: `Moon enters ${SIGN_NAMES[i.sign]}`,
        start: i.utc,
      });
    }
    for (const w of day.voc) {
      if (vocSeen.has(w.untilUtc)) continue;
      vocSeen.add(w.untilUtc);
      events.push({
        uid: `voc-${icsUtcStamp(w.untilUtc)}`,
        summary: `Moon void of course (then ${SIGN_NAMES[w.nextSign]})`,
        description:
          "The Moon perfects no further major aspect before leaving its sign.",
        start: w.fromUtc,
        end: w.untilUtc,
      });
    }
    for (const e of day.eclipses) {
      if (eclipseSeen.has(e.peakUtc)) continue;
      eclipseSeen.add(e.peakUtc);
      events.push({
        uid: `eclipse-${icsUtcStamp(e.peakUtc)}`,
        summary: `${cap(e.type)} ${e.kind} eclipse at ${formatDegreeInSign(e.degreeInSign)} ${SIGN_NAMES[e.sign]}`,
        start: e.peakUtc,
      });
    }
  }
  return events;
}

/**
 * One event per good or mixed window; "avoid" windows stay out of the
 * calendar — the export is for scheduling, not for warnings.
 */
export function electionalDayIcsEvents(
  day: ElectionalDay,
  intentLabel: string | null,
): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const w of day.windows) {
    if (w.verdict === "avoid") continue;
    const hour =
      w.hourRuler === null
        ? ""
        : ` — ${CLASSICAL_PLANET_LABELS[w.hourRuler]} hour`;
    const summary = `${intentLabel ? `${intentLabel}: ` : ""}${cap(w.verdict)} window${hour}`;
    const factorLines = w.factors.map(
      (f) =>
        `${f.label}${f.score !== 0 ? ` (${f.score > 0 ? "+" : ""}${f.score})` : ""}`,
    );
    events.push({
      uid: `electional-${intentLabel ? intentLabel.toLowerCase().split(/[^a-z]+/)[0] : "any"}-${icsUtcStamp(w.startUtc)}`,
      summary,
      description: [...factorLines, `Score ${w.score}`].join("\n"),
      start: w.startUtc,
      end: w.endUtc,
    });
  }
  return events;
}
