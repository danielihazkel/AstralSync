import * as Astronomy from "astronomy-engine";
import { norm360 } from "./angles";
import { signOf } from "./chart";
import { astronomyEngineProvider } from "./ephemeris/astronomyEngine";
import type { EphemerisProvider } from "./ephemeris/interface";
import type { Sign } from "./types";

export type EclipseKind = "solar" | "lunar";
export type EclipseType = "total" | "partial" | "annular" | "penumbral";

export interface EclipseEvent {
  kind: EclipseKind;
  type: EclipseType;
  /** ISO instant of the eclipse peak. */
  peakUtc: string;
  /** The eclipse degree: the Sun's (solar) or Moon's (lunar) tropical
   *  longitude at peak, via the same pipeline as natal placements so
   *  overlays against natal cusps are consistent. */
  longitude: number;
  sign: Sign;
  /** Degrees into the sign, [0, 30). */
  degreeInSign: number;
  /** Fraction of the eclipsed disc covered at peak, [0, 1]; null when the
   *  engine leaves it undefined (partial solar eclipses). */
  obscuration: number | null;
}

function toType(kind: Astronomy.EclipseKind): EclipseType {
  // The enum's string values already match our lowercase union.
  return kind as string as EclipseType;
}

function eventAt(
  kind: EclipseKind,
  type: EclipseType,
  peak: Date,
  obscuration: number | undefined,
  provider: EphemerisProvider,
): EclipseEvent {
  const longitude = provider.eclipticLongitude(
    kind === "solar" ? "sun" : "moon",
    peak,
  );
  return {
    kind,
    type,
    peakUtc: peak.toISOString(),
    longitude,
    sign: signOf(longitude),
    degreeInSign: norm360(longitude) % 30,
    obscuration: obscuration ?? null,
  };
}

/** All solar and lunar eclipses peaking within `horizonDays` after `from`,
 *  sorted by peak instant. Ephemeral — never persisted. */
export function upcomingEclipses(
  from: Date,
  horizonDays: number,
  provider: EphemerisProvider = astronomyEngineProvider,
): EclipseEvent[] {
  const limit = from.getTime() + horizonDays * 86_400_000;
  const events: EclipseEvent[] = [];

  let lunar = Astronomy.SearchLunarEclipse(from);
  while (lunar.peak.date.getTime() <= limit) {
    events.push(
      eventAt("lunar", toType(lunar.kind), lunar.peak.date, lunar.obscuration, provider),
    );
    lunar = Astronomy.NextLunarEclipse(lunar.peak);
  }

  let solar = Astronomy.SearchGlobalSolarEclipse(from);
  while (solar.peak.date.getTime() <= limit) {
    events.push(
      eventAt("solar", toType(solar.kind), solar.peak.date, solar.obscuration, provider),
    );
    solar = Astronomy.NextGlobalSolarEclipse(solar.peak);
  }

  return events.sort((a, b) => a.peakUtc.localeCompare(b.peakUtc));
}
