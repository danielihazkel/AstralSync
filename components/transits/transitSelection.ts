import type { CrossAspect, Planet } from "@astralsync/astro-core";

/**
 * Selection logic for the interactive transit wheel — the transit
 * counterpart of the bi-wheel's hover/pin model, extracted pure so the
 * dimming rules are unit-testable. Cross-aspect convention (lib/transits):
 * `a` is the moving body on the outer ring, `b` the natal planet inside.
 */
export type TransitSelection =
  | { kind: "planet"; ring: "natal" | "outer"; planet: Planet }
  | { kind: "aspect"; index: number }
  | null;

export function isPlanetActive(
  selection: TransitSelection,
  aspects: CrossAspect[],
  ring: "natal" | "outer",
  planet: Planet,
): boolean {
  if (!selection) return true;
  if (selection.kind === "planet") {
    return selection.ring === ring && selection.planet === planet;
  }
  const c = aspects[selection.index];
  if (!c) return true;
  return ring === "outer" ? c.a === planet : c.b === planet;
}

export function isAspectActive(
  selection: TransitSelection,
  aspects: CrossAspect[],
  index: number,
): boolean {
  if (!selection) return true;
  if (selection.kind === "aspect") return selection.index === index;
  const c = aspects[index];
  return selection.ring === "outer"
    ? c.a === selection.planet
    : c.b === selection.planet;
}

/** Whether two non-null selections refer to the same target (pin toggling). */
export function sameSelection(
  a: Exclude<TransitSelection, null>,
  b: Exclude<TransitSelection, null>,
): boolean {
  if (a.kind === "planet" && b.kind === "planet") {
    return a.ring === b.ring && a.planet === b.planet;
  }
  return a.kind === "aspect" && b.kind === "aspect" && a.index === b.index;
}
