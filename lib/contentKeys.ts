import { PLANETS, type AspectType, type Planet } from "@astralsync/astro-core";

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
