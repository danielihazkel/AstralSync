"use client";

import type { Planet } from "@astralsync/astro-core";
import type { WheelChart } from "@/lib/view-types";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import UncertaintyBadge from "./UncertaintyBadge";
import styles from "./chart.module.css";

export type Selection =
  | { kind: "planet"; planet: Planet }
  | { kind: "aspect"; index: number }
  | null;

/** Detail card for the hovered/pinned wheel selection. */
export default function PlacementDetail({
  chart,
  selection,
  pinned,
}: {
  chart: WheelChart;
  selection: Selection;
  pinned: Selection;
}) {
  if (!selection) {
    return (
      <aside className={styles.detail} aria-live="polite">
        <p className={styles.detailHint}>
          Hover or tap a planet or aspect line to inspect it.
        </p>
      </aside>
    );
  }

  if (selection.kind === "planet") {
    const p = chart.placements.find((pl) => pl.planet === selection.planet)!;
    const moonUncertainty =
      p.planet === "moon"
        ? chart.uncertainties.find((u) => u.field === "moon_sign")
        : undefined;
    const aspects = chart.aspects.filter(
      (a) => a.a === p.planet || a.b === p.planet,
    );
    return (
      <aside className={styles.detail} aria-live="polite">
        <h3 className={styles.detailTitle}>
          {PLANET_NAMES[p.planet]}
          {p.retrograde && <span className={styles.retroTag}> ℞ retrograde</span>}
        </h3>
        <dl className={styles.detailList}>
          <dt>Position</dt>
          <dd>
            {formatDegreeInSign(p.degreeInSign)} {SIGN_NAMES[p.sign]}
            {moonUncertainty && (
              <UncertaintyBadge reason={moonUncertainty.reason} />
            )}
          </dd>
          {p.house !== null && (
            <>
              <dt>House</dt>
              <dd>{p.house}</dd>
            </>
          )}
          <dt>Longitude</dt>
          <dd>{p.longitude.toFixed(2)}°</dd>
        </dl>
        {aspects.length > 0 && (
          <>
            <h4 className={styles.detailSub}>Aspects</h4>
            <ul className={styles.detailAspects}>
              {aspects.map((a) => (
                <li key={`${a.a}-${a.b}-${a.type}`}>
                  {ASPECT_NAMES[a.type]}{" "}
                  {PLANET_NAMES[a.a === p.planet ? a.b : a.a]}{" "}
                  <span className={styles.orb}>orb {a.orb.toFixed(1)}°</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {!pinned && (
          <p className={styles.detailHint}>Click to pin this selection.</p>
        )}
      </aside>
    );
  }

  const a = chart.aspects[selection.index];
  if (!a) return null;
  return (
    <aside className={styles.detail} aria-live="polite">
      <h3 className={styles.detailTitle}>
        {PLANET_NAMES[a.a]} {ASPECT_NAMES[a.type].toLowerCase()}{" "}
        {PLANET_NAMES[a.b]}
      </h3>
      <dl className={styles.detailList}>
        <dt>Exact angle</dt>
        <dd>{a.angle}°</dd>
        <dt>Orb</dt>
        <dd>{a.orb.toFixed(1)}° from exact</dd>
      </dl>
      {!pinned && (
        <p className={styles.detailHint}>Click to pin this selection.</p>
      )}
    </aside>
  );
}
