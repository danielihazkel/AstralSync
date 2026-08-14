import { type Aspect } from "@astralsync/astro-core";
import type { CompositeView } from "@/lib/synastry";
import { natalAspectKey } from "@/lib/content";
import { ASPECT_NAMES, PLANET_NAMES, SIGN_NAMES, formatDegreeInSign } from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import ChartWheel from "@/components/chart/LazyChartWheel";
import Markdown from "@/components/Markdown";
import type { AspectProse } from "./CrossAspectList";
import styles from "./synastry.module.css";

/**
 * The midpoint composite section of the synastry page: the relationship's
 * own chart (each planet at the pair's shorter-arc midpoint), rendered on
 * the standard wheel, plus its internal aspects with optional natal-archetype
 * prose. Server component — the wheel handles its own interactivity.
 */
export default function CompositePanel({
  composite,
  aName,
  bName,
  prose,
}: {
  composite: CompositeView;
  aName: string;
  bName: string;
  prose: Record<string, AspectProse>;
}) {
  const { chart } = composite;
  const sorted: Aspect[] = [...chart.aspects].sort((x, y) => x.orb - y.orb);

  return (
    <section aria-label="Composite chart">
      <h2 className={styles.sectionTitle}>Composite chart</h2>
      <p className={styles.muted}>
        The relationship&rsquo;s own chart: each planet sits at the midpoint
        of {aName}&rsquo;s and {bName}&rsquo;s positions. Composites have no
        houses or birth moment — read the signs and aspects.
        {composite.eitherSolar &&
          " One birth time is unknown, so midpoints use noon-estimate positions."}
        {composite.moonUncertain &&
          " The composite Moon inherits a natal Moon-sign uncertainty."}
      </p>

      <ChartWheel chart={chart} downloadName={`${aName} × ${bName} composite`} />

      <h3 className={styles.sectionTitle}>Composite placements</h3>
      <div className="tableWrap">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Planet</th>
            <th scope="col">Midpoint position</th>
          </tr>
        </thead>
        <tbody>
          {chart.placements.map((p) => (
            <tr key={p.planet}>
              <td>
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[p.planet] + "︎"}
                </span>
                {PLANET_NAMES[p.planet]}
              </td>
              <td>
                {formatDegreeInSign(p.degreeInSign)} {SIGN_NAMES[p.sign]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {sorted.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>Composite aspects</h3>
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
