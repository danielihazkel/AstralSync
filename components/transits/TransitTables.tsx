import type { CrossAspect, Placement } from "@astralsync/astro-core";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import Markdown from "@/components/Markdown";
import styles from "./transits.module.css";

/**
 * The transit view's tabular halves, shared by the Transits tab (now) and
 * the Journal tab (an arbitrary pinned date) — the panels own their section
 * headings and date wording; these render the data.
 */

export type TransitProse = Record<string, { title: string; bodyMd: string }>;

/** Directional transit content key. Mirrors lib/content.ts transitAspectKey —
 *  that module is server-only (reads content/ from disk), so the key is
 *  built inline here. */
export function transitProseKey(c: {
  a: string;
  b: string;
  type: string;
}): string {
  return `transit_aspect/${c.a}/${c.b}/${c.type}`;
}

export function TransitPositionsTable({
  placements,
  showHouses,
}: {
  placements: Placement[];
  showHouses: boolean;
}) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Planet</th>
          <th scope="col">Position</th>
          {showHouses && <th scope="col">Natal house</th>}
        </tr>
      </thead>
      <tbody>
        {placements.map((p) => (
          <tr key={p.planet}>
            <td>
              <span className={styles.glyph} aria-hidden="true">
                {PLANET_GLYPH_CHARS[p.planet] + "︎"}
              </span>
              {PLANET_NAMES[p.planet]}
              {p.retrograde && (
                <span className={styles.retro} title="Retrograde">
                  {" "}
                  ℞
                </span>
              )}
            </td>
            <td>
              {formatDegreeInSign(p.degreeInSign)} {SIGN_NAMES[p.sign]}
            </td>
            {showHouses && <td>{p.house}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TransitAspectList({
  aspects,
  prose,
  moonUncertain,
  moonReason,
  emptyText,
}: {
  aspects: CrossAspect[];
  prose: TransitProse | undefined;
  moonUncertain: boolean;
  moonReason: string;
  emptyText: string;
}) {
  if (aspects.length === 0) {
    return <p className={styles.muted}>{emptyText}</p>;
  }
  return (
    <ul className={styles.aspectList}>
      {aspects.map((c, i) => {
        const entry = prose?.[transitProseKey(c)];
        return (
          <li key={`${c.a}-${c.b}-${c.type}-${i}`}>
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[c.a] + "︎"}
            </span>
            Transiting {PLANET_NAMES[c.a]} {ASPECT_NAMES[c.type].toLowerCase()}{" "}
            natal{" "}
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[c.b] + "︎"}
            </span>
            {PLANET_NAMES[c.b]}
            <span className={styles.orb}> orb {c.orb.toFixed(1)}°</span>
            {c.b === "moon" && moonUncertain && (
              <UncertaintyBadge reason={moonReason} />
            )}
            {entry && (
              <div className={styles.prose}>
                <Markdown md={entry.bodyMd} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
