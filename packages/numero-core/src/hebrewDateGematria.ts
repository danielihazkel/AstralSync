import { isMaster, reduceSteps } from "./reduce";
import type { HebrewDateGematriaResult } from "./types";

export interface HebrewDateInput {
  /** Day of the Hebrew month, 1–30. */
  day: number;
  /** Hebrew year, e.g. 5760. */
  year: number;
}

/**
 * Life-Path analogue for the Hebrew calendar date: day and year are reduced
 * independently (masters 11/22/33 preserved, same rule as `lifePath`), then
 * summed and reduced again. The month is deliberately excluded — Hebrew
 * months carry their meaning through the mazal, not a number, and a
 * leap-year Adar I/II would make any month ordinal ambiguous.
 */
export function hebrewDateGematria({
  day,
  year,
}: HebrewDateInput): HebrewDateGematriaResult {
  const components = (
    [
      ["day", day],
      ["year", year],
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
