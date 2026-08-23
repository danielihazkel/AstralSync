import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  declinationsAt,
  detectAngleAspects,
  detectDeclinationAspects,
  detectPatterns,
  overlayHouses,
  partOfFortunePlacement,
  partOfSpiritPlacement,
  pointsAt,
} from "@astralsync/astro-core";
import { loadContentIndex, resolveReading } from "@/lib/content";
import { chartDignities, hasAnyDignity } from "@/lib/dignityDisplay";
import { getProfileName, getProfileView } from "@/lib/snapshots";
import { toNumeroReadingInput, toWheelChart } from "@/lib/view-types";
import {
  ANGLE_NAMES,
  ASPECT_NAMES,
  DECLINATION_ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  TIME_CERTAINTY_LABELS,
  formatBirthDate,
  formatDegreeInSign,
} from "@/components/format";
import { dignityCellText } from "@/components/chart/ChartTables";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import BigThree from "@/components/profile/BigThree";
import ChartWheel from "@/components/chart/ChartWheel";
import ChartPatterns from "@/components/chart/ChartPatterns";
import Markdown from "@/components/Markdown";
import PrintButton from "@/components/print/PrintButton";
import styles from "./print.module.css";

// Snapshot data lives in the local DB; render per-request.
export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const id = parsePositiveInt((await params).id);
  if (id === null) return {};
  const name = await getProfileName(id);
  return name ? { title: `${name} — report` } : {};
}

/**
 * One long printable report — the tabbed profile page only mounts its active
 * panel, so printing it can never capture the whole chart. This route
 * composes the stored pieces (same lib calls as the profile page, no data
 * duplication) and leans on the global print palette; the browser's "Save
 * as PDF" is the export engine.
 */
export default async function PrintReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = parsePositiveInt((await params).id);
  if (id === null) notFound();
  const view = await getProfileView(id);
  if (!view) notFound();

  const chart = toWheelChart(view.astro);
  const birthUtc = new Date(chart.input.utc);
  // Read-time like the profile page — never part of the stored aspect list.
  const angleAspects = chart.houses
    ? detectAngleAspects(chart.placements, chart.houses)
    : [];
  const cusps = chart.houses?.cusps ?? null;
  const points = {
    mean: overlayHouses(pointsAt(birthUtc, "mean"), cusps),
    true: overlayHouses(pointsAt(birthUtc, "true"), cusps),
  };
  if (chart.houses && cusps) {
    const sunLon = chart.placements.find((p) => p.planet === "sun")!.longitude;
    const moonLon = chart.placements.find((p) => p.planet === "moon")!.longitude;
    const lots = overlayHouses(
      [
        partOfFortunePlacement(chart.houses.ascendant, sunLon, moonLon, cusps),
        partOfSpiritPlacement(chart.houses.ascendant, sunLon, moonLon, cusps),
      ],
      cusps,
    );
    points.mean.push(...lots);
    points.true.push(...lots);
  }
  const { profile } = view;
  const numeroInput = toNumeroReadingInput(view.numero);
  const reading = resolveReading(
    chart,
    numeroInput,
    view.astro.contentVersion,
    loadContentIndex(),
  );
  const showHouses = !chart.isSolarChart;
  const dignities = chartDignities(chart.placements);
  const showDignities = hasAnyDignity(dignities);
  // Read-time declinations: OOB tags on placements, parallels in the list.
  const declinationRows = declinationsAt(birthUtc);
  const outOfBounds = new Set(
    declinationRows.filter((d) => d.outOfBounds).map((d) => d.planet),
  );
  const declinationAspects = detectDeclinationAspects(declinationRows);

  return (
    <main className={styles.report}>
      <div className={styles.actions}>
        <Link href={`/profiles/${profile.id}`}>← Back to the profile</Link>
        <PrintButton className={styles.printButton} />
      </div>

      <header>
        <h1>{profile.displayName}</h1>
        <p className={styles.birthLine}>
          {formatBirthDate(profile.birthDate)}
          {profile.birthTime ? ` at ${profile.birthTime}` : " — time unknown"} (
          {TIME_CERTAINTY_LABELS[profile.timeCertainty].toLowerCase()})
          {profile.birthCity &&
            ` · ${[profile.birthCity.name, profile.birthCity.admin1, profile.birthCity.countryCode].filter(Boolean).join(", ")}`}
        </p>
      </header>

      <BigThree chart={chart} />

      <section className={styles.section} aria-label="Chart wheel">
        <ChartWheel
          chart={chart}
          points={points}
          downloadName={`${profile.displayName} chart`}
          // The report has its own placements/aspect tables below — a
          // table-preferring reader would otherwise get them twice.
          viewOverride="wheel"
        />
        <ChartPatterns patterns={detectPatterns(chart.placements)} />
      </section>

      <section className={styles.section} aria-label="Placements">
        <h2 className={styles.sectionTitle}>Placements</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Planet</th>
              <th scope="col">Position</th>
              {showHouses && <th scope="col">House</th>}
              {showDignities && <th scope="col">Dignity</th>}
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
                  {p.retrograde && (
                    <span className={styles.retro} title="Retrograde">
                      {" "}
                      ℞
                    </span>
                  )}
                  {outOfBounds.has(p.planet) && (
                    <span
                      className={styles.retro}
                      title="Out of bounds — beyond the Sun's maximum declination"
                    >
                      {" "}
                      OOB
                    </span>
                  )}
                </td>
                <td>
                  {formatDegreeInSign(p.degreeInSign)} {SIGN_NAMES[p.sign]}
                </td>
                {showHouses && <td>{p.house}</td>}
                {showDignities && (
                  <td>{dignityCellText(dignities[p.planet]) ?? "—"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(chart.aspects.length > 0 ||
        angleAspects.length > 0 ||
        declinationAspects.length > 0) && (
        <section className={styles.section} aria-label="Aspects">
          <h2 className={styles.sectionTitle}>Aspects</h2>
          <ul className={styles.aspectList}>
            {[...chart.aspects]
              .sort((x, y) => x.orb - y.orb)
              .map((a) => (
                <li key={`${a.a}-${a.b}-${a.type}`}>
                  {PLANET_NAMES[a.a]} {ASPECT_NAMES[a.type].toLowerCase()}{" "}
                  {PLANET_NAMES[a.b]}
                  <span className={styles.orb}> orb {a.orb.toFixed(1)}°</span>
                </li>
              ))}
            {angleAspects.map((a) => (
              <li key={`${a.planet}-${a.target}-${a.type}`}>
                {PLANET_NAMES[a.planet]} {ASPECT_NAMES[a.type].toLowerCase()}{" "}
                {ANGLE_NAMES[a.target]}
                <span className={styles.orb}> orb {a.orb.toFixed(1)}°</span>
              </li>
            ))}
            {declinationAspects.map((a) => (
              <li key={`dec-${a.a}-${a.b}-${a.type}`}>
                {PLANET_NAMES[a.a]}{" "}
                {DECLINATION_ASPECT_NAMES[a.type].toLowerCase()}{" "}
                {PLANET_NAMES[a.b]}
                <span className={styles.orb}> orb {a.orb.toFixed(1)}°</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-label="Reading">
        <h2 className={styles.sectionTitle}>Reading</h2>
        {/* Print is server-only, so it pins true nodes — the mean-tagged
            twin exists only for the browser-pref display path. */}
        {reading.sections.filter((s) => s.nodeVariant !== "mean").map((s) => (
          <div key={s.key ?? s.title} className={styles.readingSection}>
            <h3 className={styles.readingTitle}>{s.title}</h3>
            <p className={styles.readingSource}>{s.source}</p>
            <div className={styles.readingBody}>
              <Markdown md={s.bodyMd} />
            </div>
          </div>
        ))}
        {view.astro.llmReading && (
          <div className={styles.readingSection}>
            <h3 className={styles.readingTitle}>AI synthesis</h3>
            <p className={styles.readingSource}>
              Generated {new Date(view.astro.llmReading.createdAt).toLocaleDateString()}
              {view.astro.llmReading.modelName &&
                ` · ${view.astro.llmReading.modelName}`}
            </p>
            <div className={styles.readingBody}>
              <Markdown md={view.astro.llmReading.bodyMd} />
            </div>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="Numerology">
        <h2 className={styles.sectionTitle}>Numerology</h2>
        <p className={styles.numberRow}>
          <span>
            <strong>{numeroInput.lifePath}</strong> Life Path
            {numeroInput.isMaster && " (master)"}
          </span>
          {numeroInput.destiny && (
            <span>
              <strong>{numeroInput.destiny.value}</strong> Destiny
              {numeroInput.destiny.isMaster && " (master)"}
            </span>
          )}
          {numeroInput.soulUrge && (
            <span>
              <strong>{numeroInput.soulUrge.value}</strong> Soul Urge
              {numeroInput.soulUrge.isMaster && " (master)"}
            </span>
          )}
        </p>
      </section>
    </main>
  );
}
