import { lifePath, type BirthDate } from "./lifePath";
import { isMaster, reduce, reduceSteps } from "./reduce";

/**
 * Numerology's time cycles: the personal year, month and day, and the four
 * pinnacles with their challenges. Every reduction follows lifePath's
 * "three cycles" method: each part is reduced on its own, preserving master
 * numbers 11/22/33, and the sum is reduced again, also preserving them.
 * The one exception is the challenges — differences of single digits, so
 * they run 0–8 and never carry a master number.
 */

export interface CycleNumber {
  value: number;
  isMaster: boolean;
  /** Reduction steps from the raw sum to the value, e.g. [20, 2]. */
  steps: number[];
}

function cycle(sum: number): CycleNumber {
  const steps = reduceSteps(sum);
  const value = steps[steps.length - 1];
  return { value, isMaster: isMaster(value), steps };
}

/** A master number's root digit (11 → 2, 22 → 4, 33 → 6); others unchanged. */
export function rootDigit(n: number): number {
  let x = n;
  while (x > 9) x = String(x).split("").reduce((s, d) => s + Number(d), 0);
  return x;
}

/** The calendar year's own number — the year everyone shares. */
export function universalYear(year: number): CycleNumber {
  return cycle(reduce(year));
}

/**
 * The personal year for calendar `year`: reduced birth month + reduced birth
 * day + reduced calendar year. Runs January 1 – December 31 (the common
 * convention; some schools turn it at the birthday instead).
 */
export function personalYear(
  birth: Pick<BirthDate, "month" | "day">,
  year: number,
): CycleNumber {
  return cycle(reduce(birth.month) + reduce(birth.day) + reduce(year));
}

/** Personal year + the reduced calendar month. */
export function personalMonth(
  birth: Pick<BirthDate, "month" | "day">,
  year: number,
  month: number,
): CycleNumber {
  return cycle(personalYear(birth, year).value + reduce(month));
}

/** Personal month + the reduced calendar day. */
export function personalDay(
  birth: Pick<BirthDate, "month" | "day">,
  year: number,
  month: number,
  day: number,
): CycleNumber {
  return cycle(personalMonth(birth, year, month).value + reduce(day));
}

export interface Pinnacle {
  /** 1–4, in life order. */
  index: 1 | 2 | 3 | 4;
  number: CycleNumber;
  /** The challenge paired with this pinnacle, 0–8. */
  challenge: number;
  /** Age at which the period begins (inclusive). */
  fromAge: number;
  /** Age at which it ends (exclusive); null for the fourth, which runs on. */
  toAge: number | null;
}

/** Length of the second and third pinnacles. */
export const PINNACLE_YEARS = 9;

/**
 * The four pinnacles and challenges. With M, D, Y the reduced birth month,
 * day and year (masters kept):
 *
 *   pinnacles  P1 = M+D   P2 = D+Y   P3 = P1+P2   P4 = M+Y
 *   challenges C1 = |m−d| C2 = |d−y| C3 = |C1−C2| C4 = |m−y|
 *
 * where m, d, y are the root digits (a challenge is a difference of single
 * digits). The first pinnacle ends at age 36 minus the Life Path's root
 * digit; the second and third last nine years each; the fourth runs on.
 */
export function pinnacles(birth: BirthDate): Pinnacle[] {
  const M = reduce(birth.month);
  const D = reduce(birth.day);
  const Y = reduce(birth.year);
  const p1 = cycle(M + D);
  const p2 = cycle(D + Y);
  const p3 = cycle(p1.value + p2.value);
  const p4 = cycle(M + Y);

  const [m, d, y] = [M, D, Y].map(rootDigit);
  const c1 = Math.abs(m - d);
  const c2 = Math.abs(d - y);
  const c3 = Math.abs(c1 - c2);
  const c4 = Math.abs(m - y);

  const firstEnd = 36 - rootDigit(lifePath(birth).value);
  const secondEnd = firstEnd + PINNACLE_YEARS;
  const thirdEnd = secondEnd + PINNACLE_YEARS;
  return [
    { index: 1, number: p1, challenge: c1, fromAge: 0, toAge: firstEnd },
    { index: 2, number: p2, challenge: c2, fromAge: firstEnd, toAge: secondEnd },
    { index: 3, number: p3, challenge: c3, fromAge: secondEnd, toAge: thirdEnd },
    { index: 4, number: p4, challenge: c4, fromAge: thirdEnd, toAge: null },
  ];
}

/** Completed years of age at a civil date (birthday-aware). */
export function ageOn(
  birth: BirthDate,
  on: { year: number; month: number; day: number },
): number {
  const hadBirthday =
    on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  return on.year - birth.year - (hadBirthday ? 0 : 1);
}

/** The pinnacle in force at `age`. */
export function pinnacleAt(list: Pinnacle[], age: number): Pinnacle {
  return (
    list.find((p) => age >= p.fromAge && (p.toAge === null || age < p.toAge)) ??
    list[0]
  );
}
