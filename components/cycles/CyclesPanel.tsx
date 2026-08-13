"use client";

import { useCallback, useEffect, useState } from "react";
import type { CyclesData } from "@/lib/cycles";
import type { WheelChart } from "@/lib/view-types";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import ChartWheel from "@/components/chart/ChartWheel";
import TransitWheel from "@/components/transits/TransitWheel";
import styles from "@/components/transits/transits.module.css";

type State =
  | { kind: "loading" }
  | { kind: "data"; data: CyclesData }
  | { kind: "offline" }
  | { kind: "error" };

/**
 * The Cycles tab: secondary progressions and the current solar return —
 * ephemeral like transits, recomputed against the latest natal snapshot on
 * every fetch and never stored. Same connectivity contract as TransitsPanel:
 * needs a connection, retries when it returns.
 */
export default function CyclesPanel({
  profileId,
  chart,
  isLatest,
}: {
  profileId: number;
  chart: WheelChart;
  isLatest: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }
    setState({ kind: "loading" });
    let res: Response;
    try {
      res = await fetch(`/api/cycles/${profileId}`);
    } catch {
      // sw.js never intercepts /api/*, so a network failure rejects cleanly.
      setState({ kind: "offline" });
      return;
    }
    if (!res.ok) {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "data", data: await res.json() });
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-retry once connectivity returns.
  useEffect(() => {
    const onOnline = () => {
      setState((s) => {
        if (s.kind === "offline") void load();
        return s;
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  if (state.kind === "loading") {
    return <p className={styles.muted}>Computing progressions and solar return…</p>;
  }
  if (state.kind === "offline") {
    return (
      <div className={styles.notice} role="status">
        <p>
          Cycles need a live connection — progressions and the solar return
          are computed fresh for the current moment and never stored. Your
          saved charts and readings still work offline.
        </p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className={styles.notice} role="status">
        <p>Could not compute cycles right now.</p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  const { data } = state;
  const showHouses = !data.natal.isSolarChart;
  const moonReason =
    chart.uncertainties.find((u) => u.field === "moon_sign")?.reason ??
    "The natal Moon sign is uncertain.";
  const { progressions, solarReturn } = data;

  return (
    <div className={styles.panel}>
      <div className={styles.asOfRow}>
        <span className={styles.muted}>
          As of {new Date(data.computedAt).toLocaleString()}
        </span>
        <button onClick={() => void load()}>Refresh</button>
      </div>

      {!isLatest && (
        <p className={styles.notice}>
          Cycles are computed against the current chart version, not the
          historical version you are viewing.
        </p>
      )}

      <section aria-label="Secondary progressions">
        <h3 className={styles.sectionTitle}>
          Secondary progressions — age {progressions.ageYears.toFixed(1)}
        </h3>
        <p className={styles.muted}>
          The day-for-a-year chart: your natal sky advanced one ephemeris day
          per year of life (progressed date{" "}
          {new Date(progressions.progressedUtc).toLocaleDateString()}). Slow
          inner shifts — the progressed Moon changes sign roughly every 2½
          years.
        </p>

        <TransitWheel
          chart={chart}
          transits={progressions}
          bodyLabel="Progressed"
        />

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Planet</th>
              <th scope="col">Progressed position</th>
              {showHouses && <th scope="col">Natal house</th>}
            </tr>
          </thead>
          <tbody>
            {progressions.placements.map((p) => (
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
                  {p.planet === "moon" && data.natal.moonUncertain && (
                    <UncertaintyBadge reason={moonReason} />
                  )}
                </td>
                {showHouses && <td>{p.house}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        <h4 className={styles.sectionTitle}>Progressed aspects to the natal chart</h4>
        {progressions.crossAspects.length === 0 ? (
          <p className={styles.muted}>
            No progressed planet is within orb of a natal placement right now
            (cycles use tight orbs: 3° for the luminaries, 2° otherwise).
          </p>
        ) : (
          <ul className={styles.aspectList}>
            {progressions.crossAspects.map((c, i) => (
              <li key={`${c.a}-${c.b}-${c.type}-${i}`}>
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[c.a] + "︎"}
                </span>
                Progressed {PLANET_NAMES[c.a]}{" "}
                {ASPECT_NAMES[c.type].toLowerCase()} natal{" "}
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[c.b] + "︎"}
                </span>
                {PLANET_NAMES[c.b]}
                <span className={styles.orb}> orb {c.orb.toFixed(1)}°</span>
                {c.b === "moon" && data.natal.moonUncertain && (
                  <UncertaintyBadge reason={moonReason} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Solar return">
        <h3 className={styles.sectionTitle}>
          Solar return {solarReturn.year}
        </h3>
        <p className={styles.muted}>
          The chart for the year: cast for the exact moment the Sun returned
          to its natal position (
          {new Date(solarReturn.returnUtc).toLocaleString()}), at the birth
          location.
          {data.natal.isSolarChart &&
            " The birth time is unknown, so the natal Sun is a noon estimate — the return moment (and this chart's houses) shift with it."}
        </p>
        <ChartWheel
          chart={solarReturn.chart}
          downloadName={`solar return ${solarReturn.year}`}
        />
      </section>
    </div>
  );
}
