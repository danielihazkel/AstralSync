import { TRADITIONAL_RULERS } from "./profections";
import type { Planet, Sign } from "./types";
import { SIGNS } from "./types";

/**
 * Zodiacal releasing (Valens) — the Hellenistic time-lord procedure from a
 * lot (Fortune or Spirit): starting at birth in the lot's sign, each sign
 * rules a general (L1) period of its planetary years, walking the zodiac in
 * order; each L1 period subdivides (L2) into the same sequence with the
 * years read as 30-day months. When a subdivision would return to the sign
 * it started from, it "looses the bond" and leaps to the opposite sign
 * instead (once per period). Convention: 360-day years and 30-day months —
 * the usual modern reading of Valens; other software may differ by days.
 *
 * Peaks: periods in signs angular to the lot (1st, 4th, 7th, 10th sign from
 * it) are active; the 10th is the conventional peak.
 */

/** Planetary years per sign (the lesser years of its ruler; Cancer 25,
 *  Leo 19 for the luminaries). */
export const ZR_SIGN_YEARS: Record<Sign, number> = {
  aries: 15,
  taurus: 8,
  gemini: 20,
  cancer: 25,
  leo: 19,
  virgo: 20,
  libra: 8,
  scorpio: 15,
  sagittarius: 12,
  capricorn: 27,
  aquarius: 30,
  pisces: 12,
};

const DAY_MS = 86_400_000;
const ZR_YEAR_MS = 360 * DAY_MS;
const ZR_MONTH_MS = 30 * DAY_MS;

export interface ZrPeriod {
  sign: Sign;
  lord: Planet;
  startUtc: string;
  endUtc: string;
  /** This period began with a loosing of the bond (the leap to the
   *  opposite sign). */
  loosedBond: boolean;
  /** "1st" | "4th" | "7th" | "10th" when the sign is angular from the lot;
   *  null otherwise. The 10th-sign periods are the conventional peaks. */
  angular: "1st" | "4th" | "7th" | "10th" | null;
}

export interface ZodiacalReleasing {
  lotSign: Sign;
  /** General periods from birth through the current one (inclusive). */
  l1: ZrPeriod[];
  /** Subdivisions of the current L1 period. */
  l2: ZrPeriod[];
  current: { l1: ZrPeriod; l2: ZrPeriod } | null;
}

function opposite(sign: Sign): Sign {
  return SIGNS[(SIGNS.indexOf(sign) + 6) % 12];
}

function nextSign(sign: Sign): Sign {
  return SIGNS[(SIGNS.indexOf(sign) + 1) % 12];
}

function angularFrom(lotSign: Sign, sign: Sign): ZrPeriod["angular"] {
  const d = (SIGNS.indexOf(sign) - SIGNS.indexOf(lotSign) + 12) % 12;
  return d === 0 ? "1st" : d === 3 ? "4th" : d === 6 ? "7th" : d === 9 ? "10th" : null;
}

/**
 * Walk one level's sequence from `startSign` at `startMs`, each sign
 * lasting years × unitMs, leaping to the opposite sign (once) when the
 * sequence returns to its start; periods are cut to `endMs`.
 */
function walk(
  lotSign: Sign,
  startSign: Sign,
  startMs: number,
  endMs: number,
  unitMs: number,
): ZrPeriod[] {
  const out: ZrPeriod[] = [];
  let sign = startSign;
  let t = startMs;
  let loosed = false;
  let justLoosed = false;
  while (t < endMs) {
    const lengthMs = ZR_SIGN_YEARS[sign] * unitMs;
    out.push({
      sign,
      lord: TRADITIONAL_RULERS[sign],
      startUtc: new Date(t).toISOString(),
      endUtc: new Date(Math.min(t + lengthMs, endMs)).toISOString(),
      loosedBond: justLoosed,
      angular: angularFrom(lotSign, sign),
    });
    justLoosed = false;
    t += lengthMs;
    let next = nextSign(sign);
    if (next === startSign && !loosed) {
      next = opposite(startSign);
      loosed = true;
      justLoosed = true;
    }
    sign = next;
  }
  return out;
}

/**
 * The releasing from a lot at `at`. Null current before birth. L1 periods
 * are generated from birth through the period containing `at`; L2 spans
 * exactly the current L1.
 */
export function zodiacalReleasing(
  lotSign: Sign,
  birthUtc: Date,
  at: Date,
): ZodiacalReleasing {
  const atMs = at.getTime();
  if (atMs < birthUtc.getTime()) {
    return { lotSign, l1: [], l2: [], current: null };
  }
  // Generate L1 until the period containing `at` (uncut ends — pass a far
  // horizon and trim).
  const horizon = atMs + 40 * ZR_YEAR_MS;
  const all = walk(lotSign, lotSign, birthUtc.getTime(), horizon, ZR_YEAR_MS);
  const idx = all.findIndex(
    (p) => Date.parse(p.startUtc) <= atMs && atMs < Date.parse(p.endUtc),
  );
  const l1 = all.slice(0, idx + 1);
  const currentL1 = all[idx];
  const l2 = walk(
    lotSign,
    currentL1.sign,
    Date.parse(currentL1.startUtc),
    Date.parse(currentL1.endUtc),
    ZR_MONTH_MS,
  );
  const currentL2 = l2.find(
    (p) => Date.parse(p.startUtc) <= atMs && atMs < Date.parse(p.endUtc),
  )!;
  return { lotSign, l1, l2, current: { l1: currentL1, l2: currentL2 } };
}
