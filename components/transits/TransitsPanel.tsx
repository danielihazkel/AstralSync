"use client";

import { useCallback, useEffect, useState } from "react";
import type { TransitData } from "@/lib/transits";
import type { WheelChart } from "@/lib/view-types";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import ForecastCard from "@/components/forecast/ForecastCard";
import Markdown from "@/components/Markdown";
import TransitWheel from "./TransitWheel";
import styles from "./transits.module.css";

/** The route's payload: the transit view plus optional per-aspect prose
 *  (authored transit entries, natal archetypes as fallback), keyed by the
 *  directional transit key. Mirrors lib/content.ts transitAspectKey — that
 *  module is server-only (reads content/ from disk), so the key is built
 *  inline here. */
type TransitPayload = TransitData & {
  prose?: Record<string, { title: string; bodyMd: string }>;
};

function proseKey(c: { a: string; b: string; type: string }): string {
  return `transit_aspect/${c.a}/${c.b}/${c.type}`;
}

type State =
  | { kind: "loading" }
  | { kind: "data"; data: TransitPayload }
  | { kind: "offline" }
  | { kind: "error" };

/**
 * The Transits tab: live positions vs. the natal chart, recomputed on every
 * fetch and never stored (PRD §9 — the one ongoing computation). Requires a
 * connection; everything else in the app reads stored snapshots and works
 * offline.
 */
export default function TransitsPanel({
  profileId,
  chart,
  isLatest,
  llmEnabled,
}: {
  profileId: number;
  chart: WheelChart;
  isLatest: boolean;
  llmEnabled: boolean;
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
      res = await fetch(`/api/transits/${profileId}`);
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
    return <p className={styles.muted}>Computing today’s transits…</p>;
  }
  if (state.kind === "offline") {
    return (
      <div className={styles.notice} role="status">
        <p>
          Transits need a live connection — they are computed fresh for the
          current moment and never stored. Your saved charts and readings
          still work offline.
        </p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className={styles.notice} role="status">
        <p>Could not compute transits right now.</p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  const { data } = state;
  const showHouses = !data.natal.isSolarChart;
  const moonReason =
    chart.uncertainties.find((u) => u.field === "moon_sign")?.reason ??
    "The natal Moon sign is uncertain.";

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
          Transits are computed against the current chart version, not the
          historical version you are viewing.
        </p>
      )}

      <TransitWheel chart={chart} transits={data} />

      <section aria-label="Transiting positions">
        <h3 className={styles.sectionTitle}>Positions now</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Planet</th>
              <th scope="col">Position</th>
              {showHouses && <th scope="col">Natal house</th>}
            </tr>
          </thead>
          <tbody>
            {data.placements.map((p) => (
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
        {!showHouses && (
          <p className={styles.muted}>
            Natal house placements are not shown — the birth time is unknown,
            so this profile has a solar chart without houses.
          </p>
        )}
      </section>

      <section aria-label="Transit aspects">
        <h3 className={styles.sectionTitle}>Aspects to the natal chart</h3>
        {data.crossAspects.length === 0 ? (
          <p className={styles.muted}>
            No transiting planet is within orb of a natal placement right now
            (transits use tight orbs: 3° for the luminaries, 2° otherwise).
          </p>
        ) : (
          <ul className={styles.aspectList}>
            {data.crossAspects.map((c, i) => {
              const entry = data.prose?.[proseKey(c)];
              return (
                <li key={`${c.a}-${c.b}-${c.type}-${i}`}>
                  <span className={styles.glyph} aria-hidden="true">
                    {PLANET_GLYPH_CHARS[c.a] + "︎"}
                  </span>
                  Transiting {PLANET_NAMES[c.a]}{" "}
                  {ASPECT_NAMES[c.type].toLowerCase()} natal{" "}
                  <span className={styles.glyph} aria-hidden="true">
                    {PLANET_GLYPH_CHARS[c.b] + "︎"}
                  </span>
                  {PLANET_NAMES[c.b]}
                  <span className={styles.orb}> orb {c.orb.toFixed(1)}°</span>
                  {c.b === "moon" && data.natal.moonUncertain && (
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
        )}
      </section>

      {/* The same row as Forecast → Day → Western: one cached daily reading. */}
      <ForecastCard
        profileId={profileId}
        mode="western"
        kind="day"
        llmEnabled={llmEnabled}
        heading="AI reading of today’s transits"
      />
    </div>
  );
}
