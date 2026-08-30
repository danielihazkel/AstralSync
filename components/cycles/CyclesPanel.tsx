"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SIGNS,
  type FirdariaLord,
  type ZrPeriod,
} from "@astralsync/astro-core";
import type {
  CyclesData,
  CyclesEntryProse,
  CyclesProse,
} from "@/lib/cycles";
import {
  loadOrbSettings,
  orbQuery,
  saveOrbSettings,
  type OrbSettings,
} from "@/lib/orbSettings";
import { loadHomeLocation } from "@/lib/homeLocation";
import type { HomeLocation } from "@/lib/today";
import type { WheelChart } from "@/lib/view-types";
import HomeLocationPicker from "@/components/settings/HomeLocationPicker";
import OrbSettingsControl from "@/components/settings/OrbSettingsControl";
import { TransitPositionsTable } from "@/components/transits/TransitTables";
import {
  ANGLE_NAMES,
  ASPECT_NAMES,
  PLANET_NAMES,
  POINT_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import {
  PLANET_GLYPH_CHARS,
  POINT_GLYPH_CHARS,
} from "@/components/chart/glyphs";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import Markdown from "@/components/Markdown";
import { useTabList } from "@/components/useTabList";
import dynamic from "next/dynamic";
import { WheelSkeleton } from "@/components/chart/WheelSkeleton";
import styles from "@/components/transits/transits.module.css";

const ChartWheel = dynamic(() => import("@/components/chart/ChartWheel"), {
  loading: () => <WheelSkeleton />,
});
const TransitWheel = dynamic(
  () => import("@/components/transits/TransitWheel"),
  { loading: () => <WheelSkeleton /> },
);

/** The route decorates the view with per-section content-library prose. */
type CyclesPayload = CyclesData & { prose?: CyclesProse };

type State =
  | { kind: "loading" }
  | { kind: "data"; data: CyclesPayload }
  | { kind: "offline" }
  | { kind: "error" };

const PROGRESSION_VIEWS = ["biwheel", "wheel"] as const;
const SR_VIEWS = ["birth", "home"] as const;
const LR_VIEWS = ["birth", "home"] as const;
const ZR_VIEWS = ["fortune", "spirit"] as const;

/** "Mar 2020 – Mar 2030" (yearly) or "3 Mar – 30 Apr 2026" (monthly). */
function zrRange(p: ZrPeriod, monthly: boolean): string {
  const opts = monthly
    ? ({ year: "numeric", month: "short", day: "numeric" } as const)
    : ({ year: "numeric", month: "short" } as const);
  return `${new Date(p.startUtc).toLocaleDateString([], opts)} – ${new Date(
    p.endUtc,
  ).toLocaleDateString([], opts)}`;
}

function ZrPeriodList({
  periods,
  currentStart,
  monthly,
}: {
  periods: ZrPeriod[];
  currentStart: string;
  monthly: boolean;
}) {
  return (
    <ul className={styles.aspectList}>
      {periods.map((p) => (
        <li key={p.startUtc}>
          {SIGN_NAMES[p.sign]}{" "}
          <span className={styles.orb}>
            ({PLANET_NAMES[p.lord]}) {zrRange(p, monthly)}
          </span>
          {p.angular === "10th" && <strong> · peak</strong>}
          {p.angular !== null && p.angular !== "10th" && (
            <span className={styles.orb}> · {p.angular} from the lot</span>
          )}
          {p.loosedBond && <em> · loosing of the bond</em>}
          {p.startUtc === currentStart && <strong> · now</strong>}
        </li>
      ))}
    </ul>
  );
}

/** "15°32′ Scorpio" for an ecliptic longitude (progressed ASC/MC line). */
function anglePosition(longitude: number): string {
  const norm = ((longitude % 360) + 360) % 360;
  return `${formatDegreeInSign(norm % 30)} ${SIGN_NAMES[SIGNS[Math.floor(norm / 30)]]}`;
}

/** Library prose under a section's explainer — nothing when unauthored. */
function Prose({ entry }: { entry?: CyclesEntryProse }) {
  if (!entry) return null;
  return (
    <div className={styles.prose}>
      <Markdown md={entry.bodyMd} />
    </div>
  );
}

function lordName(lord: FirdariaLord): string {
  return lord === "north_node" || lord === "south_node"
    ? POINT_NAMES[lord]
    : PLANET_NAMES[lord];
}

function lordGlyph(lord: FirdariaLord): string {
  return lord === "north_node" || lord === "south_node"
    ? POINT_GLYPH_CHARS[lord]
    : PLANET_GLYPH_CHARS[lord] + "︎";
}

/** "Mar 2020 – Mar 2030" for a firdaria period. */
function firdariaRange(p: { startUtc: string; endUtc: string }): string {
  const opts = { year: "numeric", month: "short" } as const;
  return `${new Date(p.startUtc).toLocaleDateString([], opts)} – ${new Date(
    p.endUtc,
  ).toLocaleDateString([], opts)}`;
}

function ordinal(house: number): string {
  const suffix =
    house === 1 ? "st" : house === 2 ? "nd" : house === 3 ? "rd" : "th";
  return `${house}${suffix}`;
}

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
  // Null until localStorage is read post-mount — the first fetch waits so a
  // custom setting doesn't trigger a default-orbs fetch first.
  const [orbs, setOrbs] = useState<OrbSettings | null>(null);
  const [progView, setProgView] =
    useState<(typeof PROGRESSION_VIEWS)[number]>("biwheel");
  const progTabs = useTabList({
    count: PROGRESSION_VIEWS.length,
    selected: PROGRESSION_VIEWS.indexOf(progView),
    onSelect: (i) => setProgView(PROGRESSION_VIEWS[i]),
    idBase: "progressions-view",
  });
  // Solar return relocation: Birth | Home casting location. The home
  // location is the per-browser setting the almanac uses; Home with no
  // saved location renders the picker inline instead of fetching.
  const [srView, setSrView] = useState<(typeof SR_VIEWS)[number]>("birth");
  const [homeLoc, setHomeLoc] = useState<HomeLocation | null>(null);
  const srTabs = useTabList({
    count: SR_VIEWS.length,
    selected: SR_VIEWS.indexOf(srView),
    onSelect: (i) => setSrView(SR_VIEWS[i]),
    idBase: "solar-return-view",
  });
  // Zodiacal releasing lot: Fortune (events) | Spirit (actions).
  const [zrView, setZrView] = useState<(typeof ZR_VIEWS)[number]>("fortune");
  const zrTabs = useTabList({
    count: ZR_VIEWS.length,
    selected: ZR_VIEWS.indexOf(zrView),
    onSelect: (i) => setZrView(ZR_VIEWS[i]),
    idBase: "zr-view",
  });
  // Lunar return relocation — same Birth | Home pattern as the solar return.
  const [lrView, setLrView] = useState<(typeof LR_VIEWS)[number]>("birth");
  const lrTabs = useTabList({
    count: LR_VIEWS.length,
    selected: LR_VIEWS.indexOf(lrView),
    onSelect: (i) => setLrView(LR_VIEWS[i]),
    idBase: "lunar-return-view",
  });

  useEffect(() => {
    setOrbs(loadOrbSettings());
    setHomeLoc(loadHomeLocation());
  }, []);

  const load = useCallback(async () => {
    if (orbs === null) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }
    setState({ kind: "loading" });
    // Relocate a return when its Home view is active and a home location
    // exists — a whole-payload refetch, same cost model as an orb change
    // (only the relocated chart differs server-side).
    const orbPart = orbQuery(orbs);
    const srPart =
      srView === "home" && homeLoc
        ? `${orbPart ? "&" : "?"}srLat=${homeLoc.lat}&srLng=${homeLoc.lng}`
        : "";
    const lrPart =
      lrView === "home" && homeLoc
        ? `${orbPart || srPart ? "&" : "?"}lrLat=${homeLoc.lat}&lrLng=${homeLoc.lng}`
        : "";
    let res: Response;
    try {
      res = await fetch(`/api/cycles/${profileId}${orbPart}${srPart}${lrPart}`);
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
  }, [profileId, orbs, srView, lrView, homeLoc]);

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
  const {
    progressions,
    solarArc,
    solarReturn,
    lunarReturn,
    planetaryReturns,
    profection,
  } = data;

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

      {profection && (
        <section aria-label="Annual profection">
          <h3 className={styles.sectionTitle}>
            Annual profection — {ordinal(profection.profectedHouse)}-house year
          </h3>
          <p className={styles.muted}>
            At age {profection.age} the year counts to the{" "}
            {ordinal(profection.profectedHouse)} house from your Ascendant:{" "}
            {SIGN_NAMES[profection.profectedSign]}, making{" "}
            {PLANET_NAMES[profection.yearLord]} lord of the year until your
            next birthday (
            {new Date(profection.yearEndUtc).toLocaleDateString()}). Watch how{" "}
            {PLANET_NAMES[profection.yearLord]} fares in the solar return
            below — traditional practice reads the two together.
          </p>
          <Prose entry={data.prose?.profection} />
        </section>
      )}

      {data.firdaria && (
        <section aria-label="Firdaria">
          <h3 className={styles.sectionTitle}>
            Firdaria — {lordName(data.firdaria.major.lord)} period
            {data.firdaria.sub &&
              ` · ${lordName(data.firdaria.sub.lord)} sub-period`}
          </h3>
          <p className={styles.muted}>
            The Persian time-lord wheel: a fixed 75-year sequence of planetary
            periods, its order set once by sect (yours is a{" "}
            {data.firdaria.isDay ? "day" : "night"} chart
            {data.firdaria.secondCycle && ", second time around the wheel"}).{" "}
            {lordName(data.firdaria.major.lord)} rules{" "}
            {firdariaRange(data.firdaria.major)}
            {data.firdaria.sub ? (
              <>
                ; within it the {lordName(data.firdaria.sub.lord)} sub-period
                colors {firdariaRange(data.firdaria.sub)}.
              </>
            ) : (
              ". The node periods run undivided — no sub-lords."
            )}
          </p>
          <ul className={styles.aspectList}>
            {data.firdaria.cycle.map((p) => (
              <li key={p.lord}>
                <span className={styles.glyph} aria-hidden="true">
                  {lordGlyph(p.lord)}
                </span>
                {lordName(p.lord)}{" "}
                <span className={styles.orb}>{firdariaRange(p)}</span>
                {p.lord === data.firdaria!.major.lord && <strong> · now</strong>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.zodiacalReleasing &&
        (() => {
          const zr = data.zodiacalReleasing[zrView];
          return (
            <section aria-label="Zodiacal releasing">
              <h3 className={styles.sectionTitle}>
                Zodiacal releasing —{" "}
                {zr.current
                  ? `${SIGN_NAMES[zr.current.l1.sign]} period`
                  : "before birth"}
              </h3>
              <div
                className={styles.viewSwitch}
                role="tablist"
                aria-label="Releasing lot"
              >
                <button {...zrTabs.getTabProps(0)}>From Fortune</button>
                <button {...zrTabs.getTabProps(1)}>From Spirit</button>
              </div>
              <div
                {...zrTabs.getPanelProps(ZR_VIEWS.indexOf(zrView))}
                className={styles.tabPanel}
              >
                <p className={styles.muted}>
                  The Hellenistic time-lord procedure released from the Lot
                  of {zrView === "fortune" ? "Fortune (circumstances, the body, what befalls you)" : "Spirit (action, career, what you set in motion)"}
                  , in {SIGN_NAMES[zr.lotSign]}. Each sign rules a period of
                  its planetary years (360-day years, 30-day months — other
                  software may differ by days); periods in signs angular to
                  the lot are active, the 10th sign the peak.
                </p>
                {zr.current && (
                  <>
                    <p className={styles.muted}>
                      <strong>
                        {SIGN_NAMES[zr.current.l1.sign]} general period
                      </strong>{" "}
                      ({PLANET_NAMES[zr.current.l1.lord]} as lord),{" "}
                      {zrRange(zr.current.l1, false)} · within it the{" "}
                      <strong>{SIGN_NAMES[zr.current.l2.sign]}</strong>{" "}
                      sub-period, {zrRange(zr.current.l2, true)}
                      {zr.current.l2.angular === "10th" &&
                        " — a peak period"}
                      {zr.current.l2.loosedBond &&
                        " — begun by a loosing of the bond"}
                      .
                    </p>
                    <details>
                      <summary className={styles.muted}>
                        General periods since birth ({zr.l1.length})
                      </summary>
                      <ZrPeriodList
                        periods={zr.l1}
                        currentStart={zr.current.l1.startUtc}
                        monthly={false}
                      />
                    </details>
                    <details>
                      <summary className={styles.muted}>
                        Sub-periods of the current general period (
                        {zr.l2.length})
                      </summary>
                      <ZrPeriodList
                        periods={zr.l2}
                        currentStart={zr.current.l2.startUtc}
                        monthly
                      />
                    </details>
                  </>
                )}
              </div>
            </section>
          );
        })()}

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

        <div
          className={styles.viewSwitch}
          role="tablist"
          aria-label="Progressions view"
        >
          <button {...progTabs.getTabProps(0)}>Vs. natal</button>
          <button {...progTabs.getTabProps(1)}>Progressed wheel</button>
        </div>
        {progView === "biwheel" ? (
          <div {...progTabs.getPanelProps(0)} className={styles.tabPanel}>
            <TransitWheel
              chart={chart}
              transits={progressions}
              bodyLabel="Progressed"
              downloadName="progressed bi-wheel"
            />
          </div>
        ) : (
          <div {...progTabs.getPanelProps(1)} className={styles.tabPanel}>
            <p className={styles.muted}>
              The progressed chart in its own right
              {progressions.chart.houses
                ? `: progressed Ascendant ${anglePosition(progressions.chart.houses.ascendant)}, Midheaven ${anglePosition(progressions.chart.houses.mc)}. Houses are cast for the progressed moment at the birth place.`
                : ". Without a birth time it is a solar chart — no progressed houses or Ascendant."}
            </p>
            <ChartWheel
              chart={progressions.chart}
              downloadName="progressed chart"
            />
          </div>
        )}

        <TransitPositionsTable
          placements={progressions.placements}
          showHouses={showHouses}
          positionHeader="Progressed position"
          moonUncertain={data.natal.moonUncertain}
          moonReason={moonReason}
        />

        <h4 className={styles.sectionTitle}>Progressed lunation phase</h4>
        <p className={styles.muted}>
          <strong>{progressions.lunation.phaseName}</strong> (
          {Math.round(progressions.lunation.phaseDeg)}° of the progressed
          Sun–Moon cycle, {progressions.lunation.waxing ? "waxing" : "waning"}
          ). This ~29½-year cycle began at the progressed New Moon of{" "}
          {new Date(progressions.lunation.lastNewMoonUtc).toLocaleDateString(
            [],
            { year: "numeric", month: "short" },
          )}
          ; the next progressed{" "}
          {progressions.lunation.waxing ? "Full" : "New"} Moon falls around{" "}
          {new Date(
            progressions.lunation.waxing
              ? progressions.lunation.nextFullMoonUtc
              : progressions.lunation.nextNewMoonUtc,
          ).toLocaleDateString([], { year: "numeric", month: "short" })}
          {progressions.lunation.waxing
            ? `, the next New Moon around ${new Date(progressions.lunation.nextNewMoonUtc).toLocaleDateString([], { year: "numeric", month: "short" })}`
            : ""}
          . New Moon phases seed a chapter, Full Moons bring it to light,
          the waning half digests it.
          {data.natal.moonUncertain &&
            " The natal Moon is uncertain (birth time), so these dates are approximate."}
        </p>

        <Prose entry={data.prose?.progressedSun} />
        <Prose entry={data.prose?.progressedAsc} />

        <h4 className={styles.sectionTitle}>Progressed aspects to the natal chart</h4>
        {orbs && <OrbSettingsControl value={orbs} onChange={changeOrbs} />}
        {progressions.crossAspects.length === 0 ? (
          <p className={styles.muted}>
            No progressed planet is within orb of a natal placement right now
            (current orbs: {orbs?.luminary ?? 3}° for the luminaries,{" "}
            {orbs?.default ?? 2}° otherwise).
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

      <section aria-label="Tertiary progressions">
        <h3 className={styles.sectionTitle}>
          Tertiary progressions — lunar month {Math.floor(data.tertiary.ageMonths)}
        </h3>
        <p className={styles.muted}>
          A day for each lunar month of life (progressed date{" "}
          {new Date(data.tertiary.progressedUtc).toLocaleDateString()}): the
          tertiary Moon covers about a degree a day, so this layer times the
          weeks and months where the secondary progressions time the years.
        </p>
        <TransitPositionsTable
          placements={data.tertiary.placements}
          showHouses={showHouses}
          positionHeader="Tertiary position"
          moonUncertain={data.natal.moonUncertain}
          moonReason={moonReason}
        />
        {data.tertiary.crossAspects.length === 0 ? (
          <p className={styles.muted}>
            No tertiary planet is within orb of a natal placement right now
            (current orbs: {orbs?.luminary ?? 3}° for the luminaries,{" "}
            {orbs?.default ?? 2}° otherwise).
          </p>
        ) : (
          <ul className={styles.aspectList}>
            {data.tertiary.crossAspects.map((c, i) => (
              <li key={`${c.a}-${c.b}-${c.type}-${i}`}>
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[c.a] + "︎"}
                </span>
                Tertiary {PLANET_NAMES[c.a]}{" "}
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

      <section aria-label="Solar arc directions">
        <h3 className={styles.sectionTitle}>
          Solar arc directions — arc {solarArc.arcDegrees.toFixed(1)}°
        </h3>
        <p className={styles.muted}>
          Every natal point pushed forward by the progressed Sun&rsquo;s
          motion, about a degree per year of life. A symbolic timing overlay
          rather than a chart of its own — contacts to the natal chart are
          listed at a fixed 1° orb (the directions convention; orb settings
          don&rsquo;t apply here).
        </p>
        <Prose entry={data.prose?.solarArc} />

        <TransitPositionsTable
          placements={solarArc.placements}
          showHouses={showHouses}
          positionHeader="Directed position"
          moonUncertain={data.natal.moonUncertain}
          moonReason={moonReason}
        />

        {solarArc.crossAspects.length === 0 &&
        solarArc.angleAspects.length === 0 ? (
          <p className={styles.muted}>
            No directed point is within 1° of a natal placement
            {showHouses ? " or angle" : ""} right now — the next contact
            arrives as the arc advances.
          </p>
        ) : (
          <ul className={styles.aspectList}>
            {solarArc.crossAspects.map((c, i) => (
              <li key={`${c.a}-${c.b}-${c.type}-${i}`}>
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[c.a] + "︎"}
                </span>
                Directed {PLANET_NAMES[c.a]}{" "}
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
            {solarArc.angleAspects.map((c, i) => (
              <li key={`${c.planet}-${c.target}-${c.type}-${i}`}>
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[c.planet] + "︎"}
                </span>
                Directed {PLANET_NAMES[c.planet]}{" "}
                {ASPECT_NAMES[c.type].toLowerCase()} natal{" "}
                {ANGLE_NAMES[c.target]}
                <span className={styles.orb}> orb {c.orb.toFixed(1)}°</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lunarReturn && (
        <section aria-label="Lunar return">
          <h3 className={styles.sectionTitle}>Lunar return</h3>
          <div
            className={styles.viewSwitch}
            role="tablist"
            aria-label="Lunar return location"
          >
            <button {...lrTabs.getTabProps(0)}>Birth location</button>
            <button {...lrTabs.getTabProps(1)}>Home location</button>
          </div>
          <div
            {...lrTabs.getPanelProps(LR_VIEWS.indexOf(lrView))}
            className={styles.tabPanel}
          >
            <p className={styles.muted}>
              The chart for the month: cast for the moment the Moon last
              returned to its natal position (
              {new Date(lunarReturn.returnUtc).toLocaleString()}),{" "}
              {lunarReturn.relocated && homeLoc
                ? `relocated to ${homeLoc.label} — same moment, different horizon: the planets hold their degrees while the houses and Ascendant shift.`
                : "at the birth location."}{" "}
              Returns recur every ~27.3 days — this chart colors the lunar
              month until{" "}
              {new Date(lunarReturn.nextReturnUtc).toLocaleDateString()}.
              {(data.natal.isSolarChart || data.natal.moonUncertain) &&
                " The natal Moon position is uncertain (birth time), so the return moment is approximate."}
            </p>
            {lrView === "home" && !homeLoc ? (
              <>
                <p className={styles.muted}>
                  No home location set — pick the city you live in to cast
                  the return there. It is remembered in this browser (the
                  same setting the calendar uses), never stored server-side.
                </p>
                <HomeLocationPicker
                  onPick={(loc) => setHomeLoc(loc)}
                  onCancel={() => setLrView("birth")}
                />
              </>
            ) : (
              <>
                <Prose entry={data.prose?.lunarReturn} />
                <ChartWheel
                  chart={lunarReturn.chart}
                  downloadName={`lunar return${lunarReturn.relocated ? " relocated" : ""}`}
                />
              </>
            )}
          </div>
        </section>
      )}

      <section aria-label="Solar return">
        <h3 className={styles.sectionTitle}>
          Solar return {solarReturn.year}
        </h3>
        <div
          className={styles.viewSwitch}
          role="tablist"
          aria-label="Solar return location"
        >
          <button {...srTabs.getTabProps(0)}>Birth location</button>
          <button {...srTabs.getTabProps(1)}>Home location</button>
        </div>
        <div
          {...srTabs.getPanelProps(SR_VIEWS.indexOf(srView))}
          className={styles.tabPanel}
        >
          <p className={styles.muted}>
            The chart for the year: cast for the exact moment the Sun
            returned to its natal position (
            {new Date(solarReturn.returnUtc).toLocaleString()}),{" "}
            {solarReturn.relocated && homeLoc
              ? `relocated to ${homeLoc.label} — same moment, different horizon: the planets hold their degrees while the houses and Ascendant shift.`
              : "at the birth location."}
            {data.natal.isSolarChart &&
              " The birth time is unknown, so the natal Sun is a noon estimate — the return moment (and this chart's houses) shift with it."}
          </p>
          {srView === "home" && !homeLoc ? (
            <>
              <p className={styles.muted}>
                No home location set — pick the city you live in to cast the
                return there. It is remembered in this browser (the same
                setting the calendar uses), never stored server-side.
              </p>
              <HomeLocationPicker
                onPick={(loc) => setHomeLoc(loc)}
                onCancel={() => setSrView("birth")}
              />
            </>
          ) : (
            <>
              <Prose entry={data.prose?.solarReturn} />
              <ChartWheel
                chart={solarReturn.chart}
                downloadName={`solar return ${solarReturn.year}${solarReturn.relocated ? " relocated" : ""}`}
              />
            </>
          )}
        </div>
      </section>

      {planetaryReturns.map((r) => (
        <section
          key={r.planet}
          aria-label={`${PLANET_NAMES[r.planet]} return`}
        >
          <h3 className={styles.sectionTitle}>
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[r.planet] + "︎"}
            </span>
            {PLANET_NAMES[r.planet]} return
          </h3>
          <p className={styles.muted}>
            {PLANET_NAMES[r.planet]} circles the zodiac about every{" "}
            {r.cycleYears.toFixed(1)} years.{" "}
            {r.lastExactUtc ? (
              <>
                Last exact return{" "}
                {new Date(r.lastExactUtc).toLocaleDateString()}
                {r.nextExactUtc &&
                  ` · next around ${new Date(r.nextExactUtc).toLocaleDateString()}`}
                .
              </>
            ) : r.nextExactUtc ? (
              <>
                Your first {PLANET_NAMES[r.planet]} return arrives around{" "}
                {new Date(r.nextExactUtc).toLocaleDateString()}.
              </>
            ) : null}
            {r.crossings.length > 1 &&
              ` A retrograde loop makes ${r.crossings.length} exact passes over the natal degree in this window — the theme repeats.`}
          </p>
          <Prose
            entry={
              r.planet === "jupiter"
                ? data.prose?.jupiterReturn
                : data.prose?.saturnReturn
            }
          />
          {r.chart && (
            <>
              <p className={styles.muted}>
                The chart below is cast for the last exact return, at the
                birth location — it colors the whole{" "}
                {r.planet === "jupiter" ? "~12-year" : "~29-year"} cycle it
                opened.
              </p>
              <ChartWheel
                chart={r.chart}
                downloadName={`${r.planet} return`}
              />
            </>
          )}
        </section>
      ))}
    </div>
  );
}
