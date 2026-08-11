import { isMaster, reduceSteps } from "./reduce";
import type { LifePathResult } from "./types";

export interface BirthDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

/**
 * Life Path Number (PRD §3.3).
 *
 * Method (the standard "three cycles" reduction): month, day, and year are
 * each reduced independently — preserving master numbers 11/22/33 — then the
 * three reduced values are summed and reduced again, also preserving masters.
 * Example: 1975-04-07 → month 4, day 7, year 1975→22 (kept) → 33 (master).
 */
export function lifePath(date: BirthDate): LifePathResult {
  const components = (
    [
      ["month", date.month],
      ["day", date.day],
      ["year", date.year],
    ] as const
  ).map(([part, raw]) => {
    const steps = reduceSteps(raw);
    return { part, raw, steps, reduced: steps[steps.length - 1] };
  });

  const total = components.reduce((sum, c) => sum + c.reduced, 0);
  const steps = reduceSteps(total);
  const value = steps[steps.length - 1];

  return {
    value,
    isMaster: isMaster(value),
    derivation: { components: [...components], total, steps },
  };
}
