import { type Aspect } from "@astralsync/astro-core";
import type { DavisonView } from "@/lib/synastry";
import { natalAspectKey } from "@/lib/content";
import { timezoneFor } from "@/lib/tz";
import { ASPECT_NAMES, PLANET_NAMES } from "@/components/format";
import ChartWheel from "@/components/chart/LazyChartWheel";
import Markdown from "@/components/Markdown";
import type { AspectProse } from "./CrossAspectList";
import styles from "./synastry.module.css";

function coord(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`;
}

/** The midpoint moment in its own local civil time — the zone resolves
 *  offline from the midpoint coordinates, falling back to UTC when the
 *  point lands where no zone is defined (open ocean). */
function midpointMoment(midpoint: DavisonView["midpoint"]): string {
  let zone = "UTC";
  try {
    zone = timezoneFor(midpoint.latitude, midpoint.longitude);
  } catch {
    // Keep UTC.
  }
  const formatted = new Date(midpoint.utc).toLocaleString("en-GB", {
    timeZone: zone,
    dateStyle: "long",
    timeStyle: "short",
  });
  return `${formatted} (${zone.replace(/_/g, " ")})`;
}

/**
 * The Davison section of the synastry page: a real chart cast for the
 * midpoint of the two birth moments at the midpoint of the two birthplaces.
 * Where the composite averages positions (and so has no houses or moment),
 * the Davison is an actual sky — houses, angles and retrogrades included —
 * read like a natal chart of the relationship. Server component.
 */
export default function DavisonPanel({
  davison,
  aName,
  bName,
  prose,
}: {
  davison: DavisonView;
  aName: string;
  bName: string;
  prose: Record<string, AspectProse>;
}) {
  const { chart, midpoint } = davison;
  const sorted: Aspect[] = [...chart.aspects].sort((x, y) => x.orb - y.orb);

  return (
    <section aria-label="Davison chart">
      <h2 className={styles.sectionTitle}>Davison chart</h2>
      <p className={styles.muted}>
        The real sky halfway between {aName} and {bName}: cast for{" "}
        {midpointMoment(midpoint)} at {coord(midpoint.latitude, "N", "S")},{" "}
        {coord(midpoint.longitude, "E", "W")} — the midpoint of the two births
        in time and place. Unlike the composite&rsquo;s averaged positions,
        this moment actually occurred, so the chart has real
        {chart.houses ? " houses, angles" : " placements"} and retrogrades.
        {davison.eitherSolar &&
          " One birth time is unknown, so the midpoint inherits a noon estimate and the chart is solar (no houses)."}
        {davison.moonUncertain &&
          " The Davison Moon inherits a natal Moon-sign uncertainty."}
      </p>

      <ChartWheel chart={chart} downloadName={`${aName} × ${bName} davison`} />

      {sorted.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>Davison aspects</h3>
          <ul className={styles.aspectList}>
            {sorted.map((a) => {
              const entry = prose[natalAspectKey(a.a, a.b, a.type)];
              return (
                <li key={`${a.a}-${a.b}-${a.type}`}>
                  {PLANET_NAMES[a.a]} {ASPECT_NAMES[a.type].toLowerCase()}{" "}
                  {PLANET_NAMES[a.b]}
                  <span className={styles.orb}> orb {a.orb.toFixed(1)}°</span>
                  {entry && (
                    <div className={styles.prose}>
                      <p className={styles.muted}>
                        Natal archetype for this pair — read it as the
                        relationship&rsquo;s own dynamic:
                      </p>
                      <Markdown md={entry.bodyMd} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
