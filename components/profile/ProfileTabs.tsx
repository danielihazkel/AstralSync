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
import type {
  AngleAspect,
  AntisciaContact,
  Aspect,
  ChartPattern,
  DeclinationAspect,
  PlanetDeclination,
} from "@astralsync/astro-core";
import type { AspectMotion } from "@/lib/aspectMotion";
import dynamic from "next/dynamic";
import type { ChartPoints } from "@/components/chart/ChartWheel";
import { WheelSkeleton } from "@/components/chart/WheelSkeleton";
import ChartPatterns from "@/components/chart/ChartPatterns";

// The SVG wheel is the tab's heaviest component — split it out so the other
// eight tabs don't pay for it.
const ChartWheel = dynamic(() => import("@/components/chart/ChartWheel"), {
  loading: () => <WheelSkeleton />,
});
import ForecastPanel from "@/components/forecast/ForecastPanel";
import MazalPanel from "@/components/mazal/MazalPanel";
import NumerologyPanel, {
  type NumeroProse,
} from "@/components/numerology/NumerologyPanel";
import CyclesPanel from "@/components/cycles/CyclesPanel";
import JournalPanel from "@/components/journal/JournalPanel";
import TransitsPanel from "@/components/transits/TransitsPanel";
import DetailsPanel, { type SnapshotVersionInfo } from "./DetailsPanel";
import ReadingPanel from "./ReadingPanel";
import { TABS, paramFromTab, tabFromParam, type Tab } from "./tabParam";
import { useTabList } from "@/components/useTabList";
import styles from "./profile.module.css";

export default function ProfileTabs({
  profile,
  astro,
  numero,
  numeroProse,
  chart,
  points = null,
  patterns = [],
  minorAspects = null,
  angleAspects = null,
  declinations = null,
  antisciaContacts = null,
  aspectMotion,
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
  points?: ChartPoints | null;
  patterns?: ChartPattern[];
  minorAspects?: Aspect[] | null;
  angleAspects?: AngleAspect[] | null;
  declinations?: {
    rows: PlanetDeclination[];
    aspects: DeclinationAspect[];
  } | null;
  antisciaContacts?: AntisciaContact[] | null;
  aspectMotion?: AspectMotion;
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

  const { getTabProps, getPanelProps } = useTabList({
    count: TABS.length,
    selected: TABS.indexOf(tab),
    onSelect: (i) => setTab(TABS[i]),
    idBase: "profile-tabs",
  });
  const panelProps = getPanelProps(TABS.indexOf(tab));

  return (
    <div>
      <div role="tablist" aria-label="Profile views" className={styles.tabs}>
        {TABS.map((t, i) => (
          <button
            key={t}
            {...getTabProps(i)}
            className={tab === t ? styles.tabActive : styles.tab}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Chart" && (
        <div {...panelProps}>
          <ChartWheel
            chart={chart}
            points={points}
            minorAspects={minorAspects}
            angleAspects={angleAspects}
            declinations={declinations}
            antisciaContacts={antisciaContacts}
            aspectMotion={aspectMotion}
            downloadName={`${profile.displayName} chart`}
          />
          <ChartPatterns patterns={patterns} />
        </div>
      )}
      {tab === "Reading" && (
        <div {...panelProps}>
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
        <div {...panelProps}>
          <NumerologyPanel
            numero={numero}
            prose={numeroProse}
            profileId={profile.id}
          />
        </div>
      )}
      {tab === "Mazal" && (
        <div {...panelProps}>
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
        <div {...panelProps}>
          <TransitsPanel
            profileId={profile.id}
            chart={chart}
            isLatest={isLatest}
            llmEnabled={llmEnabled}
          />
        </div>
      )}
      {tab === "Cycles" && (
        <div {...panelProps}>
          <CyclesPanel
            profileId={profile.id}
            chart={chart}
            isLatest={isLatest}
          />
        </div>
      )}
      {tab === "Forecast" && (
        <div {...panelProps}>
          <ForecastPanel
            profileId={profile.id}
            llmEnabled={llmEnabled}
            hebrewAvailable={hebrew !== null}
          />
        </div>
      )}
      {tab === "Journal" && (
        <div {...panelProps}>
          <JournalPanel
            profileId={profile.id}
            chart={chart}
            isLatest={isLatest}
          />
        </div>
      )}
      {tab === "Details" && (
        <div {...panelProps}>
          <DetailsPanel
            profile={profile}
            astro={astro}
            chart={chart}
            versions={versions}
            isLatest={isLatest}
            reading={reading}
          />
        </div>
      )}
    </div>
  );
}
