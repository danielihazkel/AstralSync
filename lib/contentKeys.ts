import {
  PLANETS,
  type AngleBody,
  type AspectType,
  type Planet,
} from "@astralsync/astro-core";

/**
 * Canonical content-key builders, split from lib/content.ts so client
 * components can share them — the loader module is server-only (it reads
 * `content/` from disk), and these are pure string builders.
 */

/**
 * Canonical natal-aspect key: pair ordered by `PLANETS` index, matching
 * `detectAspects` output and the synastry key convention.
 */
export function natalAspectKey(a: Planet, b: Planet, type: AspectType): string {
  const [first, second] =
    PLANETS.indexOf(a) <= PLANETS.indexOf(b) ? [a, b] : [b, a];
  return `aspect/${first}/${second}/${type}`;
}

/**
 * Canonical transit-aspect key — DIRECTIONAL, never sorted: transiting
 * Saturn square natal Sun is a different reading from transiting Sun square
 * natal Saturn. Tier 1 authors the slow movers (Jupiter–Pluto) over the
 * luminaries; everything else stays on the natal-archetype fallback.
 */
export function transitAspectKey(
  transiting: Planet,
  natal: Planet,
  type: AspectType,
): string {
  return `transit_aspect/${transiting}/${natal}/${type}`;
}

/** Canonical synastry_aspect content key: the pair is ordered by PLANETS
 *  index, matching the natal aspect-key convention. Keys use slash segments
 *  (keyFromPath turns filename hyphens into slashes), so the entry authored
 *  as `synastry_aspect/sun-mars-square.md` resolves to this key. */
export function synastryAspectKey(
  a: Planet,
  b: Planet,
  type: AspectType,
): string {
  const [first, second] =
    PLANETS.indexOf(a) <= PLANETS.indexOf(b) ? [a, b] : [b, a];
  return `synastry_aspect/${first}/${second}/${type}`;
}

/**
 * Angle-aspect keys are planet-then-angle by construction (detectAngleAspects
 * emits ASC/MC targets only), so no ordering step is needed. The natal
 * `angle_aspect` archetypes double as the fallback prose for the transit and
 * synastry angle surfaces, mirroring the transit_aspect → aspect chain.
 */
export function natalAngleAspectKey(
  planet: Planet,
  target: AngleBody,
  type: AspectType,
): string {
  return `angle_aspect/${planet}/${target}/${type}`;
}

/** Directional: the transiting planet over a natal angle. */
export function transitAngleAspectKey(
  transiting: Planet,
  target: AngleBody,
  type: AspectType,
): string {
  return `transit_angle_aspect/${transiting}/${target}/${type}`;
}

/** Directional: one chart's planet on the OTHER chart's angle. */
export function synastryAngleAspectKey(
  planet: Planet,
  target: AngleBody,
  type: AspectType,
): string {
  return `synastry_angle_aspect/${planet}/${target}/${type}`;
}
