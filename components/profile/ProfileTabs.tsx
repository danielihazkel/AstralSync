"use client";

import { useSearchParams } from "next/navigation";
import type { ResolvedReading } from "@/lib/content";
import type { ResolvedHebrewReading } from "@/lib/hebrewReading";
import type {
  AstroView,
  HebrewView,
  NumeroView,
  ProfileData,
  WheelChart,
} from "@/lib/view-types";
import ChartWheel from "@/components/chart/ChartWheel";
import MazalPanel from "@/components/mazal/MazalPanel";
import NumerologyPanel, {
  type NumeroProse,
} from "@/components/numerology/NumerologyPanel";
import TransitsPanel from "@/components/transits/TransitsPanel";
import DetailsPanel, { type SnapshotVersionInfo } from "./DetailsPanel";
import ReadingPanel from "./ReadingPanel";
import { TABS, paramFromTab, tabFromParam, type Tab } from "./tabParam";
import styles from "./profile.module.css";

export default function ProfileTabs({
  profile,
  astro,
  numero,
  numeroProse,
  chart,
  versions,
  isLatest,
  reading,
  hebrew,
  hebrewReading,
  llmEnabled,
}: {
  profile: ProfileData;
  astro: AstroView;
  numero: NumeroView;
  numeroProse: NumeroProse;
  chart: WheelChart;
  versions: SnapshotVersionInfo[];
  isLatest: boolean;
  reading: ResolvedReading;
  hebrew: HebrewView | null;
  hebrewReading: ResolvedHebrewReading | null;
  llmEnabled: boolean;
}) {
  // Tab state lives in ?tab= so views are bookmarkable and survive reloads.
  // history.replaceState is the App Router's shallow-update path: no server
  // refetch, and useSearchParams re-renders this component. replaceState
  // (not push) keeps tab flips out of the back stack; copying the current
  // params preserves ?version=.
  const searchParams = useSearchParams();
  const tab: Tab = tabFromParam(searchParams.get("tab"));
  function setTab(t: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", paramFromTab(t));
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  return (
    <div>
      <div role="tablist" aria-label="Profile views" className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? styles.tabActive : styles.tab}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Chart" && (
        <div role="tabpanel" aria-label="Chart">
          <ChartWheel
            chart={chart}
            downloadName={`${profile.displayName} chart`}
          />
        </div>
      )}
      {tab === "Reading" && (
        <div role="tabpanel" aria-label="Reading">
          <ReadingPanel
            reading={reading}
            llmReading={astro.llmReading}
            profileId={profile.id}
            version={astro.version}
            isSolarChart={chart.isSolarChart}
            llmEnabled={llmEnabled}
          />
        </div>
      )}
      {tab === "Numerology" && (
        <div role="tabpanel" aria-label="Numerology">
          <NumerologyPanel
            numero={numero}
            prose={numeroProse}
            profileId={profile.id}
          />
        </div>
      )}
      {tab === "Mazal" && (
        <div role="tabpanel" aria-label="Mazal">
          <MazalPanel
            hebrew={hebrew}
            reading={hebrewReading}
            profileId={profile.id}
            version={astro.version}
            llmEnabled={llmEnabled}
          />
        </div>
      )}
      {tab === "Transits" && (
        <div role="tabpanel" aria-label="Transits">
          <TransitsPanel
            profileId={profile.id}
            chart={chart}
            isLatest={isLatest}
          />
        </div>
      )}
      {tab === "Details" && (
        <div role="tabpanel" aria-label="Details">
          <DetailsPanel
            profile={profile}
            astro={astro}
            chart={chart}
            versions={versions}
            isLatest={isLatest}
          />
        </div>
      )}
    </div>
  );
}
