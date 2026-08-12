"use client";

import type { CrossAspect, Planet } from "@astralsync/astro-core";
import type { SynastrySide } from "@/lib/synastry";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import styles from "@/components/chart/chart.module.css";

export type SynastrySelection =
  | { kind: "planet"; side: "a" | "b"; planet: Planet }
  | { kind: "aspect"; index: number }
  | null;

function ordinalHouse(house: number): string {
  const suffix =
    house === 1 ? "st" : house === 2 ? "nd" : house === 3 ? "rd" : "th";
  return `${house}${suffix}`;
}

/** Detail card for the hovered/pinned bi-wheel selection — the synastry
 *  counterpart of PlacementDetail, side-aware and overlay-aware. */
export default function SynastryDetail({
  a,
  b,
  aspects,
  selection,
  pinned,
}: {
  a: SynastrySide;
  b: SynastrySide;
  aspects: CrossAspect[];
  selection: SynastrySelection;
  pinned: SynastrySelection;
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
    const side = selection.side === "a" ? a : b;
    const other = selection.side === "a" ? b : a;
    const p = side.chart.placements.find(
      (pl) => pl.planet === selection.planet,
    )!;
    const overlayHouse =
      side.overlayPlacements.find((pl) => pl.planet === selection.planet)
        ?.house ?? null;
    const moonUncertainty =
      p.planet === "moon"
        ? side.chart.uncertainties.find((u) => u.field === "moon_sign")
        : undefined;
    const involved = aspects.filter((c) =>
      selection.side === "a" ? c.a === p.planet : c.b === p.planet,
    );
    return (
      <aside className={styles.detail} aria-live="polite">
        <h3 className={styles.detailTitle}>
          {side.displayName}&rsquo;s {PLANET_NAMES[p.planet]}
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
              <dt>Own house</dt>
              <dd>{p.house}</dd>
            </>
          )}
          {overlayHouse !== null && (
            <>
              <dt>Overlay</dt>
              <dd>
                In {other.displayName}&rsquo;s {ordinalHouse(overlayHouse)} house
              </dd>
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
                  {ASPECT_NAMES[c.type]} {other.displayName}&rsquo;s{" "}
                  {PLANET_NAMES[selection.side === "a" ? c.b : c.a]}{" "}
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
        {a.displayName}&rsquo;s {PLANET_NAMES[c.a]}{" "}
        {ASPECT_NAMES[c.type].toLowerCase()} {b.displayName}&rsquo;s{" "}
        {PLANET_NAMES[c.b]}
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
