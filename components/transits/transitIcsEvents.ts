import { SIGNS } from "@astralsync/astro-core";
// Type-only import: the module itself is server-only (it imports prisma).
import type { TransitCalendarData } from "@/lib/transitCalendar";
import type { IcsEvent } from "@/lib/ics";
import { icsUtcStamp } from "@/lib/ics";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";

/**
 * TransitCalendarData → IcsEvent mapper for the Transits tab's calendar
 * export. Summaries mirror TransitCalendarView's event lines so the
 * imported calendar reads like the app.
 */
export function transitMonthIcsEvents(data: TransitCalendarData): IcsEvent[] {
  return data.events.map((e): IcsEvent => {
    const stamp = icsUtcStamp(e.utc);
    switch (e.kind) {
      case "aspect": {
        const retro = e.retrograde ? " ℞" : "";
        const pass = e.pass.of > 1 ? ` (pass ${e.pass.n} of ${e.pass.of})` : "";
        return {
          uid: `transit-aspect-${stamp}-${e.a}-${e.type}-${e.b}`,
          summary: `${PLANET_NAMES[e.a]}${retro} ${ASPECT_NAMES[e.type].toLowerCase()} natal ${PLANET_NAMES[e.b]}${pass}`,
          start: e.utc,
        };
      }
      case "ingress":
        return {
          uid: `transit-ingress-${stamp}-${e.planet}`,
          summary: `${PLANET_NAMES[e.planet]}${e.retrograde ? " ℞ re-enters" : " enters"} ${SIGN_NAMES[SIGNS[e.signIndex]]}`,
          start: e.utc,
        };
      case "station":
        return {
          uid: `station-${stamp}-${e.planet}`,
          summary: `${PLANET_NAMES[e.planet]} stations ${e.direction}`,
          start: e.utc,
        };
      case "eclipse": {
        const ec = e.eclipse;
        return {
          // Same uid shape as the Sky Calendar export — the two calendars
          // agree on the event rather than duplicating it.
          uid: `eclipse-${icsUtcStamp(ec.peakUtc)}`,
          summary: `${ec.type[0].toUpperCase() + ec.type.slice(1)} ${ec.kind} eclipse at ${formatDegreeInSign(ec.degreeInSign)} ${SIGN_NAMES[ec.sign]}`,
          start: ec.peakUtc,
        };
      }
    }
  });
}
