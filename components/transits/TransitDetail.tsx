"use client";

import type { CrossAspect } from "@astralsync/astro-core";
import type { WheelChart } from "@/lib/view-types";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import styles from "@/components/chart/chart.module.css";
import type { RingBodies } from "./TransitWheel";
import type { TransitSelection } from "./transitSelection";

/**
 * Detail card for the hovered/pinned transit-wheel selection — the transit
 * counterpart of SynastryDetail (which is typed to synastry sides). Works
 * for both consumers of the two-ring wheel: live transits and progressions.
 */
export default function TransitDetail({
  chart,
  transits,
  aspects,
  selection,
  pinned,
  bodyLabel,
}: {
  chart: WheelChart;
  transits: RingBodies;
  aspects: CrossAspect[];
  selection: TransitSelection;
  pinned: TransitSelection;
  bodyLabel: string;
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
    const onOuter = selection.ring === "outer";
    const p = (onOuter ? transits.placements : chart.placements).find(
      (pl) => pl.planet === selection.planet,
    )!;
    const moonUncertainty =
      !onOuter && p.planet === "moon"
        ? chart.uncertainties.find((u) => u.field === "moon_sign")
        : undefined;
    const involved = aspects.filter((c) =>
      onOuter ? c.a === p.planet : c.b === p.planet,
    );
    return (
      <aside className={styles.detail} aria-live="polite">
        <h3 className={styles.detailTitle}>
          {onOuter ? bodyLabel : "Natal"} {PLANET_NAMES[p.planet]}
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
              <dt>{onOuter ? "Natal house" : "House"}</dt>
              <dd>{p.house}</dd>
            </>
          )}
          <dt>Longitude</dt>
          <dd>{p.longitude.toFixed(2)}°</dd>
        </dl>
        {involved.length > 0 && (
          <>
            <h4 className={styles.detailSub}>Cross aspects</h4>
            <ul className={styles.detailAspects}>
              {involved.map((c, i) => (
                <li key={`${c.a}-${c.b}-${c.type}-${i}`}>
                  {ASPECT_NAMES[c.type]}{" "}
                  {onOuter
                    ? `natal ${PLANET_NAMES[c.b]}`
                    : `${bodyLabel.toLowerCase()} ${PLANET_NAMES[c.a]}`}{" "}
                  <span className={styles.orb}>orb {c.orb.toFixed(1)}°</span>
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

  const c = aspects[selection.index];
  if (!c) return null;
  return (
    <aside className={styles.detail} aria-live="polite">
      <h3 className={styles.detailTitle}>
        {bodyLabel} {PLANET_NAMES[c.a]} {ASPECT_NAMES[c.type].toLowerCase()}{" "}
        natal {PLANET_NAMES[c.b]}
      </h3>
      <dl className={styles.detailList}>
        <dt>Exact angle</dt>
        <dd>{c.angle}°</dd>
        <dt>Orb</dt>
        <dd>{c.orb.toFixed(1)}° from exact</dd>
      </dl>
      {!pinned && (
        <p className={styles.detailHint}>Click to pin this selection.</p>
      )}
    </aside>
  );
}
