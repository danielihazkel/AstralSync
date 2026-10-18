/**
 * A moment (date, time, place) in a URL — ?date=&time=&lat=&lng=&tz=&label=
 * — for the bookmarkable /chart page and the onboarding wizard's prefill.
 * No engine imports, so both pages can load it up front.
 */

export interface MomentPlace {
  label: string;
  lat: number;
  lng: number;
  tzIana: string;
}

import { isValidTimeZone } from "./tzValidate";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar date inside the engine's 1700–2200 comfort zone — not
 *  just the digit pattern, which would let 2024-02-30 roll into March. */
function validDate(date: string | null): string | null {
  const m = date ? DATE_RE.exec(date) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1700 || y > 2200) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? date : null;
}

/** The moment in a URL (?date=&time=&lat=&lng=&tz=&label=) — bookmarkable,
 *  and the same shape the onboarding wizard takes as a prefill. */
export function momentQuery(m: { date: string; time: string; place: MomentPlace }): string {
  return new URLSearchParams({
    date: m.date,
    time: m.time,
    lat: String(m.place.lat),
    lng: String(m.place.lng),
    tz: m.place.tzIana,
    label: m.place.label,
  }).toString();
}

/** Parse a moment query; null fields when absent or malformed (the page
 *  then falls back to now at the home location). The date must exist and
 *  stay inside the engine's 1700–2200 comfort zone; the zone must be one
 *  the runtime knows. */
export function momentFromQuery(q: { get(name: string): string | null }): {
  date: string | null;
  time: string | null;
  place: MomentPlace | null;
} {
  const time = q.get("time");
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  const tz = q.get("tz");
  const placeOk =
    q.get("lat") !== null &&
    q.get("lng") !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    tz !== null &&
    tz !== "" &&
    isValidTimeZone(tz);
  return {
    date: validDate(q.get("date")),
    time: time && TIME_RE.test(time) ? time : null,
    place: placeOk
      ? { lat, lng, tzIana: tz!, label: q.get("label") || `${lat.toFixed(2)}, ${lng.toFixed(2)}` }
      : null,
  };
}
