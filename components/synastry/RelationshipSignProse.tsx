import type { Placement } from "@astralsync/astro-core";
import { PLANET_NAMES, SIGN_NAMES } from "@/components/format";
import Markdown from "@/components/Markdown";
import type { AspectProse } from "./CrossAspectList";
import styles from "./synastry.module.css";

/** The relationship planets whose sign placements carry authored prose. */
export const RELATIONSHIP_SIGN_PLANETS = [
  "sun",
  "moon",
  "venus",
  "mars",
] as const;

/** Canonical composite_in_sign content key — shared by the composite and
 *  Davison panels (both are the bond's own chart). */
export function compositeInSignKey(planet: string, sign: string): string {
  return `composite_in_sign/${planet}/${sign}`;
}

/**
 * Sign prose for a relationship chart's core planets (Sun, Moon, Venus,
 * Mars). The heading is rebuilt per context ("Composite Sun in Aries" /
 * "Davison Sun in Aries") so one authored entry serves both panels;
 * unauthored keys render nothing, the standard degradation.
 */
export default function RelationshipSignProse({
  label,
  placements,
  prose,
}: {
  /** "Composite" or "Davison" — the heading's register. */
  label: string;
  placements: Placement[];
  prose: Record<string, AspectProse>;
}) {
  const rows = RELATIONSHIP_SIGN_PLANETS.map((planet) => {
    const p = placements.find((pl) => pl.planet === planet);
    const entry = p ? prose[compositeInSignKey(planet, p.sign)] : undefined;
    return p && entry ? { p, entry } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return null;

  return (
    <div>
      {rows.map(({ p, entry }) => (
        <div key={p.planet} className={styles.prose}>
          <p className={styles.muted}>
            {label} {PLANET_NAMES[p.planet]} in {SIGN_NAMES[p.sign]}
          </p>
          <Markdown md={entry.bodyMd} />
        </div>
      ))}
    </div>
  );
}
