import type {
  AspectType,
  Placement,
  Planet,
  PointPlacement,
} from "@astralsync/astro-core";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  POINT_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { PLANET_GLYPH_CHARS, POINT_GLYPH_CHARS } from "./glyphs";
import UncertaintyBadge from "./UncertaintyBadge";
import styles from "./chart.module.css";

/**
 * The wheels' accessible table twins: the same placements and aspects the
 * SVG draws, as real tables — the reading surface for screen readers and
 * anyone who prefers text (ChartWheel's Wheel | Table switch). Pure render,
 * TransitTables-style; the host owns headings and view switching.
 */

export function PlacementsTable({
  placements,
  points = [],
  showHouses,
  positionHeader = "Position",
  houseHeader = "House",
  moonUncertain = false,
  moonReason,
}: {
  placements: Placement[];
  points?: PointPlacement[];
  showHouses: boolean;
  positionHeader?: string;
  houseHeader?: string;
  moonUncertain?: boolean;
  moonReason?: string;
}) {
  return (
    <div className="tableWrap">
      <table className={styles.table} aria-label="Placements">
        <thead>
          <tr>
            <th scope="col">Body</th>
            <th scope="col">{positionHeader}</th>
            {showHouses && <th scope="col">{houseHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => (
            <tr key={p.planet}>
              <td>
                <span className={styles.tableGlyph} aria-hidden="true">
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
                {p.planet === "moon" && moonUncertain && moonReason && (
                  <UncertaintyBadge reason={moonReason} />
                )}
              </td>
              {showHouses && <td>{p.house}</td>}
            </tr>
          ))}
          {points.map((p) => (
            <tr key={p.point}>
              <td>
                <span className={styles.tableGlyph} aria-hidden="true">
                  {POINT_GLYPH_CHARS[p.point] + "︎"}
                </span>
                {POINT_NAMES[p.point]}
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
    </div>
  );
}

/** Structural slice shared by Aspect and CrossAspect. */
export interface AspectRow {
  a: Planet;
  b: Planet;
  type: AspectType;
  orb: number;
}

export function AspectTable({
  aspects,
  aPrefix,
  bPrefix,
}: {
  aspects: AspectRow[];
  /** Optional qualifiers for the two sides, e.g. "Progressed" / "natal". */
  aPrefix?: string;
  bPrefix?: string;
}) {
  return (
    <div className="tableWrap">
      <table className={styles.table} aria-label="Aspects">
        <thead>
          <tr>
            <th scope="col">Planet</th>
            <th scope="col">Aspect</th>
            <th scope="col">Planet</th>
            <th scope="col">Orb</th>
          </tr>
        </thead>
        <tbody>
          {aspects.map((a, i) => (
            <tr key={`${a.a}-${a.b}-${a.type}-${i}`}>
              <td>
                <span className={styles.tableGlyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[a.a] + "︎"}
                </span>
                {aPrefix ? `${aPrefix} ` : ""}
                {PLANET_NAMES[a.a]}
              </td>
              <td>{ASPECT_NAMES[a.type]}</td>
              <td>
                <span className={styles.tableGlyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[a.b] + "︎"}
                </span>
                {bPrefix ? `${bPrefix} ` : ""}
                {PLANET_NAMES[a.b]}
              </td>
              <td>{a.orb.toFixed(1)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
