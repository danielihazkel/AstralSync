import type { CyclesData } from "@/lib/cycles";
import type { IcsEvent } from "@/lib/ics";
import { PLANET_NAMES, POINT_NAMES } from "@/components/format";

const lordName = (lord: string): string =>
  (PLANET_NAMES as Record<string, string>)[lord] ??
  (POINT_NAMES as Record<string, string>)[lord] ??
  lord;

/**
 * The Cycles tab's dated turning points as calendar events: the solar and
 * lunar returns, every exact Jupiter and Saturn return pass in view, and
 * where the current profection year and firdaria periods end. Returns are
 * instants; period ends are all-day events on their civil (UTC) date. UIDs
 * carry the profile and the instant, so a re-export updates in place.
 */
export function cyclesIcsEvents(data: CyclesData, profileId: number): IcsEvent[] {
  const out: IcsEvent[] = [];
  const day = (iso: string) => iso.slice(0, 10);
  out.push({
    uid: `p${profileId}-solar-return-${data.solarReturn.returnUtc}`,
    summary: `Solar return ${data.solarReturn.year}`,
    start: data.solarReturn.returnUtc,
  });
  if (data.lunarReturn) {
    for (const utc of [data.lunarReturn.returnUtc, data.lunarReturn.nextReturnUtc]) {
      out.push({ uid: `p${profileId}-lunar-return-${utc}`, summary: "Lunar return", start: utc });
    }
  }
  for (const r of data.planetaryReturns) {
    const passes = new Set([...r.crossings, ...(r.nextExactUtc ? [r.nextExactUtc] : [])]);
    const sorted = [...passes].sort();
    sorted.forEach((utc, i) => {
      out.push({
        uid: `p${profileId}-${r.planet}-return-${utc}`,
        summary: `${PLANET_NAMES[r.planet]} return${sorted.length > 1 ? ` (pass ${i + 1} of ${sorted.length})` : ""}`,
        start: utc,
      });
    });
  }
  if (data.profection) {
    out.push({
      uid: `p${profileId}-profection-end-${day(data.profection.yearEndUtc)}`,
      summary: `Profection year ends (${lordName(data.profection.yearLord)} year)`,
      date: day(data.profection.yearEndUtc),
    });
  }
  if (data.firdaria) {
    out.push({
      uid: `p${profileId}-firdaria-major-end-${day(data.firdaria.major.endUtc)}`,
      summary: `${lordName(data.firdaria.major.lord)} firdaria ends`,
      date: day(data.firdaria.major.endUtc),
    });
    if (data.firdaria.sub) {
      out.push({
        uid: `p${profileId}-firdaria-sub-end-${day(data.firdaria.sub.endUtc)}`,
        summary: `${lordName(data.firdaria.sub.lord)} firdaria sub-period ends`,
        date: day(data.firdaria.sub.endUtc),
      });
    }
  }
  return out;
}
