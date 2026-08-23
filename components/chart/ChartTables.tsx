import type {
  AngleAspect,
  AspectType,
  Placement,
  Planet,
  PointPlacement,
} from "@astralsync/astro-core";
import {
  ANGLE_GLYPH_LABELS,
  ANGLE_NAMES,
  ASPECT_NAMES,
  DIGNITY_NAMES,
  PLANET_NAMES,
  POINT_NAMES,
  SIGN_NAMES,
  SOLAR_CONDITION_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import type { ChartDignities } from "@/lib/dignityDisplay";
import { motionKey, type AspectMotion } from "@/lib/aspectMotion";
import { PLANET_GLYPH_CHARS, POINT_GLYPH_CHARS } from "./glyphs";
import UncertaintyBadge from "./UncertaintyBadge";
import type { TwoRingRow } from "@/lib/wheelTableRows";
import styles from "./chart.module.css";

/**
 * The wheels' accessible table twins: the same placements and aspects the
 * SVG draws, as real tables — the reading surface for screen readers and
 * anyone who prefers text (ChartWheel's Wheel | Table switch). Pure render,
 * TransitTables-style; the host owns headings and view switching.
 */

/** "Domicile · Combust" cell text, or null when the row has nothing. */
export function dignityCellText(
  d: { dignity: keyof typeof DIGNITY_NAMES | null; solar: keyof typeof SOLAR_CONDITION_NAMES | null } | undefined,
): string | null {
  if (!d) return null;
  const parts = [
    d.dignity && DIGNITY_NAMES[d.dignity],
    d.solar && SOLAR_CONDITION_NAMES[d.solar],
  ].filter((x): x is string => Boolean(x));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function PlacementsTable({
  placements,
  points = [],
  showHouses,
  positionHeader = "Position",
  houseHeader = "House",
  moonUncertain = false,
  moonReason,
  dignities,
}: {
  placements: Placement[];
  points?: PointPlacement[];
  showHouses: boolean;
  positionHeader?: string;
  houseHeader?: string;
  moonUncertain?: boolean;
  moonReason?: string;
  /** Read-time essential dignity + solar condition per planet; when present
   *  the table grows a Dignity column (points and neutral planets show "—"). */
  dignities?: ChartDignities;
}) {
  return (
    <div className="tableWrap">
      <table className={styles.table} aria-label="Placements">
        <thead>
          <tr>
            <th scope="col">Body</th>
            <th scope="col">{positionHeader}</th>
            {showHouses && <th scope="col">{houseHeader}</th>}
            {dignities && <th scope="col">Dignity</th>}
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
              {dignities && <td>{dignityCellText(dignities[p.planet]) ?? "—"}</td>}
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
              {dignities && <td>—</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function positionCell(p: { degreeInSign: number; sign: keyof typeof SIGN_NAMES; retrograde: boolean }) {
  return (
    <>
      {formatDegreeInSign(p.degreeInSign)} {SIGN_NAMES[p.sign]}
      {p.retrograde && (
        <span className={styles.retro} title="Retrograde">
          {" "}
          ℞
        </span>
      )}
    </>
  );
}

/**
 * Table twin of a two-ring wheel (transit/progressed/synastry overlays):
 * one row per planet, both rings' positions side by side. Aspects are
 * deliberately absent — every host already renders its cross-aspect list as
 * the accessible aspect surface. The optional house column shows the
 * right-hand (moving/overlaid) body's house.
 */
export function TwoRingTable({
  rows,
  leftHeader,
  rightHeader,
  showHouses = false,
  houseHeader = "House",
}: {
  rows: TwoRingRow[];
  leftHeader: string;
  rightHeader: string;
  showHouses?: boolean;
  houseHeader?: string;
}) {
  return (
    <div className="tableWrap">
      <table
        className={styles.table}
        aria-label={`${leftHeader} and ${rightHeader} positions`}
      >
        <thead>
          <tr>
            <th scope="col">Planet</th>
            <th scope="col">{leftHeader}</th>
            <th scope="col">{rightHeader}</th>
            {showHouses && <th scope="col">{houseHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.planet}>
              <td>
                <span className={styles.tableGlyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[row.planet] + "︎"}
                </span>
                {PLANET_NAMES[row.planet]}
              </td>
              <td>{positionCell(row.left)}</td>
              <td>{positionCell(row.right)}</td>
              {showHouses && <td>{row.right.house}</td>}
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

function motionCell(motion: AspectMotion, key: string) {
  const applying = motion[key];
  if (applying === undefined) return <td>—</td>;
  return <td>{applying ? "applying" : "separating"}</td>;
}

export function AspectTable({
  aspects,
  angleAspects = [],
  motion,
  aPrefix,
  bPrefix,
}: {
  aspects: AspectRow[];
  /** Read-time aspects to the chart's ASC/MC, appended after the planet
   *  pairs (never part of the stored aspect list). */
  angleAspects?: AngleAspect[];
  /** Applying/separating verdicts keyed by motionKey; when present the
   *  table grows a Motion column (rows without an entry render "—"). */
  motion?: AspectMotion;
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
            <th scope="col">Body</th>
            <th scope="col">Orb</th>
            {motion && <th scope="col">Motion</th>}
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
              {motion && motionCell(motion, motionKey(a.a, a.b, a.type))}
            </tr>
          ))}
          {angleAspects.map((a, i) => (
            <tr key={`${a.planet}-${a.target}-${a.type}-${i}`}>
              <td>
                <span className={styles.tableGlyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[a.planet] + "︎"}
                </span>
                {aPrefix ? `${aPrefix} ` : ""}
                {PLANET_NAMES[a.planet]}
              </td>
              <td>{ASPECT_NAMES[a.type]}</td>
              <td>
                <span className={styles.tableGlyph} aria-hidden="true">
                  {ANGLE_GLYPH_LABELS[a.target]}
                </span>
                {bPrefix ? `${bPrefix} ` : ""}
                {ANGLE_NAMES[a.target]}
              </td>
              <td>{a.orb.toFixed(1)}°</td>
              {motion && motionCell(motion, motionKey(a.planet, a.target, a.type))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
