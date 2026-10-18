"use client";

import { useSearchParams } from "next/navigation";
import type { ChartStatsProse, ResolvedReading } from "@/lib/content";
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
import ChartStats from "@/components/chart/ChartStats";
import type { ChartStats as ChartStatsData } from "@/lib/chartStats";

// The SVG wheel is the tab's heaviest component — split it out so the other
// eight tabs don't pay for it.
const ChartWheel = dynamic(() => import("@/components/chart/ChartWheel"), {
  loading: () => <WheelSkeleton />,
});
import type { HebrewBirthday } from "@/components/mazal/MazalPanel";
import type { NumeroProse } from "@/components/numerology/NumerologyPanel";
import { parseAtParam } from "@/components/atDate";
import type { LifeArcPeriods } from "@/components/lifeEvents/LifeArc";

// Every tab but the Chart one loads on demand: they used to ship in one
// ~160 KB chunk on every profile page, whichever tab was open. A server
// render of a deep-linked tab still includes it (dynamic keeps SSR).
const panelLoading = () => <p className={styles.panelLoading}>Loading…</p>;
const ForecastPanel = dynamic(() => import("@/components/forecast/ForecastPanel"), {
  loading: panelLoading,
});
const MazalPanel = dynamic(() => import("@/components/mazal/MazalPanel"), {
  loading: panelLoading,
});
const NumerologyPanel = dynamic(() => import("@/components/numerology/NumerologyPanel"), {
  loading: panelLoading,
});
const CyclesPanel = dynamic(() => import("@/components/cycles/CyclesPanel"), {
  loading: panelLoading,
});
const JournalPanel = dynamic(() => import("@/components/journal/JournalPanel"), {
  loading: panelLoading,
});
const LifeEventsPanel = dynamic(() => import("@/components/lifeEvents/LifeEventsPanel"), {
  loading: panelLoading,
});
const TransitsPanel = dynamic(() => import("@/components/transits/TransitsPanel"), {
  loading: panelLoading,
});
const ReadingPanel = dynamic(() => import("./ReadingPanel"), { loading: panelLoading });
import DetailsPanel, { type SnapshotVersionInfo } from "./DetailsPanel";
import { TABS, paramFromTab, tabFromParam, type Tab } from "./tabParam";
import { useTabList } from "@/components/useTabList";
import styles from "./profile.module.css";

export default function ProfileTabs({
  profile,
  astro,
  numero,
  numeroProse,
  chart,
  arcPeriods = null,
  points = null,
  patterns = [],
  stats = null,
  statsProse,
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
  hebrewBirthday,
  hebrewBirthdays = [],
  llmEnabled,
}: {
  profile: ProfileData;
  astro: AstroView;
  numero: NumeroView;
  numeroProse: NumeroProse;
  chart: WheelChart;
  /** Life-arc bands (releasing + firdaria); null on a solar chart. */
  arcPeriods?: LifeArcPeriods | null;
  points?: ChartPoints | null;
  patterns?: ChartPattern[];
  stats?: ChartStatsData | null;
  statsProse?: ChartStatsProse;
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
  hebrewBirthday: HebrewBirthday | null;
  /** The next ten Hebrew birthdays, for the Mazal tab's .ics. */
  hebrewBirthdays?: HebrewBirthday[];
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
  // ?at=YYYY-MM-DD pins Transits and Cycles to a day — the deep link other
  // pages use, kept in step with the pickers so the view stays bookmarkable
  // and the pinned day carries across the two tabs.
  const atDate = parseAtParam(searchParams.get("at"));
  function setAtDate(date: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (date === null) params.delete("at");
    else params.set("at", date);
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
          {stats && <ChartStats stats={stats} prose={statsProse} />}
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
            birthDate={profile.birthDate}
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
            hebrewBirthday={hebrewBirthday}
            hebrewBirthdays={hebrewBirthdays}
            displayName={profile.displayName}
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
            initialAtDate={atDate}
            onAtDateChange={setAtDate}
          />
        </div>
      )}
      {tab === "Cycles" && (
        <div {...panelProps}>
          <CyclesPanel
            profileId={profile.id}
            chart={chart}
            isLatest={isLatest}
            initialAtDate={atDate}
            onAtDateChange={setAtDate}
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
      {tab === "Life events" && (
        <div {...panelProps}>
          <LifeEventsPanel
            profileId={profile.id}
            version={astro.version}
            lifeStoryReading={astro.lifeStoryReading}
            llmEnabled={llmEnabled}
            birthUtc={chart.input.utc}
            birthDate={profile.birthDate}
            arcPeriods={arcPeriods}
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
