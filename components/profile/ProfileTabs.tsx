"use client";

import { useState } from "react";
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
import NumerologyPanel from "@/components/numerology/NumerologyPanel";
import TransitsPanel from "@/components/transits/TransitsPanel";
import DetailsPanel, { type SnapshotVersionInfo } from "./DetailsPanel";
import ReadingPanel from "./ReadingPanel";
import styles from "./profile.module.css";

const TABS = [
  "Chart",
  "Reading",
  "Numerology",
  "Mazal",
  "Transits",
  "Details",
] as const;
type Tab = (typeof TABS)[number];

export default function ProfileTabs({
  profile,
  astro,
  numero,
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
  chart: WheelChart;
  versions: SnapshotVersionInfo[];
  isLatest: boolean;
  reading: ResolvedReading;
  hebrew: HebrewView | null;
  hebrewReading: ResolvedHebrewReading | null;
  llmEnabled: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Chart");

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
          <ChartWheel chart={chart} />
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
          <NumerologyPanel numero={numero} profileId={profile.id} />
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
