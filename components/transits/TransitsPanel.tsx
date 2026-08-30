"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadOrbSettings,
  orbQuery,
  saveOrbSettings,
  type OrbSettings,
} from "@/lib/orbSettings";
import type { TransitData } from "@/lib/transits";
import type { WheelChart } from "@/lib/view-types";
import ForecastCard from "@/components/forecast/ForecastCard";
import OrbSettingsControl from "@/components/settings/OrbSettingsControl";
import {
  TransitAspectList,
  TransitPositionsTable,
  type TransitProse,
} from "./TransitTables";
import dynamic from "next/dynamic";
import { WheelSkeleton } from "@/components/chart/WheelSkeleton";
import TransitCalendarView from "./TransitCalendarView";
import TransitGraph from "./TransitGraph";
import TransitSearchView from "./TransitSearchView";
import { useTabList } from "@/components/useTabList";
import styles from "./transits.module.css";

const VIEWS = ["now", "calendar", "graph", "search"] as const;

const TransitWheel = dynamic(() => import("./TransitWheel"), {
  loading: () => <WheelSkeleton />,
});

/** The route's payload: the transit view plus optional per-aspect prose
 *  (authored transit entries, natal archetypes as fallback), keyed by the
 *  directional transit key. */
type TransitPayload = TransitData & { prose?: TransitProse };

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
  const [view, setView] = useState<(typeof VIEWS)[number]>("now");
  // Null until localStorage is read post-mount — the first fetch waits so a
  // custom setting doesn't trigger a default-orbs fetch first.
  const [orbs, setOrbs] = useState<OrbSettings | null>(null);

  useEffect(() => {
    setOrbs(loadOrbSettings());
  }, []);

  const load = useCallback(async () => {
    if (orbs === null) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }
    setState({ kind: "loading" });
    let res: Response;
    try {
      res = await fetch(`/api/transits/${profileId}${orbQuery(orbs)}`);
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
  }, [profileId, orbs]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeOrbs(next: OrbSettings) {
    saveOrbSettings(next);
    setOrbs(next); // load re-runs via the dependency
  }

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

  // "Now | Calendar" switch, always visible above whichever view renders.
  const { getTabProps, getPanelProps } = useTabList({
    count: VIEWS.length,
    selected: VIEWS.indexOf(view),
    onSelect: (i) => setView(VIEWS[i]),
    idBase: "transits-view",
  });
  const panelProps = getPanelProps(VIEWS.indexOf(view));
  const viewSwitch = (
    <div
      className={styles.viewSwitch}
      role="tablist"
      aria-label="Transits view"
    >
      <button {...getTabProps(0)}>Now</button>
      <button {...getTabProps(1)}>Calendar</button>
      <button {...getTabProps(2)}>Graph</button>
      <button {...getTabProps(3)}>Search</button>
    </div>
  );

  if (view === "calendar") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <div {...panelProps} className={styles.tabPanel}>
          <TransitCalendarView profileId={profileId} />
        </div>
      </div>
    );
  }

  if (view === "graph") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <div {...panelProps} className={styles.tabPanel}>
          <TransitGraph profileId={profileId} />
        </div>
      </div>
    );
  }

  if (view === "search") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <div {...panelProps} className={styles.tabPanel}>
          <TransitSearchView profileId={profileId} chart={chart} />
        </div>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <div {...panelProps} className={styles.tabPanel}>
          <p className={styles.muted}>Computing today’s transits…</p>
        </div>
      </div>
    );
  }
  if (state.kind === "offline") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <div {...panelProps} className={styles.tabPanel}>
          <div className={styles.notice} role="status">
            <p>
              Transits need a live connection — they are computed fresh for the
              current moment and never stored. Your saved charts and readings
              still work offline.
            </p>
            <button onClick={() => void load()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <div {...panelProps} className={styles.tabPanel}>
          <div className={styles.notice} role="status">
            <p>Could not compute transits right now.</p>
            <button onClick={() => void load()}>Retry</button>
          </div>
        </div>
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
      {viewSwitch}
      <div {...panelProps} className={styles.tabPanel}>
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
        <TransitPositionsTable
          placements={data.placements}
          showHouses={showHouses}
        />
        {!showHouses && (
          <p className={styles.muted}>
            Natal house placements are not shown — the birth time is unknown,
            so this profile has a solar chart without houses.
          </p>
        )}
      </section>

      <section aria-label="Transit aspects">
        <h3 className={styles.sectionTitle}>Aspects to the natal chart</h3>
        {orbs && <OrbSettingsControl value={orbs} onChange={changeOrbs} />}
        <TransitAspectList
          aspects={data.crossAspects}
          angleAspects={data.angleAspects}
          prose={data.prose}
          moonUncertain={data.natal.moonUncertain}
          moonReason={moonReason}
          emptyText={`No transiting planet is within orb of a natal placement right now (current orbs: ${orbs?.luminary ?? 3}° for the luminaries, ${orbs?.default ?? 2}° otherwise).`}
        />
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
    </div>
  );
}
