import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AngleAspect, CrossAspect } from "@astralsync/astro-core";
import Markdown from "@/components/Markdown";
import { natalAngleAspectKey, natalAspectKey } from "@/lib/contentKeys";
import { getCyclesView, type CyclesEntryProse } from "@/lib/cycles";
import { resolveCyclesProse } from "@/lib/cyclesProse";
import { getProfileName, getProfileView } from "@/lib/snapshots";
import { toWheelChart } from "@/lib/view-types";
import {
  ANGLE_NAMES,
  ASPECT_NAMES,
  PLANET_NAMES,
  POINT_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import PrintButton from "@/components/print/PrintButton";
import YearAheadTransits from "@/components/print/YearAheadTransits";
import styles from "../print.module.css";

// Cycles are computed fresh for the current moment; render per-request.
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
  return name ? { title: `${name} — year ahead` } : {};
}

function date(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function lordName(lord: string): string {
  return (
    (PLANET_NAMES as Record<string, string>)[lord] ??
    (POINT_NAMES as Record<string, string>)[lord] ??
    lord
  );
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? "st"
      : n % 10 === 2 && n !== 12
        ? "nd"
        : n % 10 === 3 && n !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

/** A section's library prose, or nothing when unauthored. */
function PrintProse({ entry }: { entry?: CyclesEntryProse }) {
  if (!entry) return null;
  return (
    <div className={styles.readingBody}>
      <Markdown md={entry.bodyMd} />
    </div>
  );
}

/** Contact rows ("Progressed Mars square natal Saturn 0.4°"), each with the
 *  natal pair's archetype when `withProse` — the Cycles tab's folded
 *  readings, printed open. */
function ContactList({
  label,
  rows,
  angleRows = [],
  contacts,
  withProse,
}: {
  label: string;
  rows: CrossAspect[];
  angleRows?: AngleAspect[];
  contacts: Record<string, CyclesEntryProse>;
  withProse: boolean;
}) {
  if (rows.length === 0 && angleRows.length === 0) {
    return <p className={styles.muted}>No contact within orb right now.</p>;
  }
  const items = [
    ...rows.map((c) => ({
      key: `${c.a}-${c.b}-${c.type}`,
      text: `${label} ${PLANET_NAMES[c.a]} ${ASPECT_NAMES[c.type].toLowerCase()} natal ${PLANET_NAMES[c.b]}`,
      orb: c.orb,
      prose: c.a === c.b ? undefined : contacts[natalAspectKey(c.a, c.b, c.type)],
    })),
    ...angleRows.map((c) => ({
      key: `${c.planet}-${c.target}-${c.type}`,
      text: `${label} ${PLANET_NAMES[c.planet]} ${ASPECT_NAMES[c.type].toLowerCase()} natal ${ANGLE_NAMES[c.target]}`,
      orb: c.orb,
      prose: contacts[natalAngleAspectKey(c.planet, c.target, c.type)],
    })),
  ];
  return (
    <ul className={styles.aspectList}>
      {items.map((i) => (
        <li key={i.key} className={withProse && i.prose ? styles.readingSection : undefined}>
          {i.text} <span className={styles.orb}>{i.orb.toFixed(1)}°</span>
          {withProse && <PrintProse entry={i.prose} />}
        </li>
      ))}
    </ul>
  );
}

/**
 * The year-ahead ("cycles") report: profection, firdaria, the progressed
 * chart and its contacts, tertiary progressions, solar arc, zodiacal
 * releasing, and the solar, lunar and slow-planet returns, each with the
 * same library prose as the Cycles tab — plus the client-computed exact
 * transit list for the next twelve months. Composes the same lib calls as
 * the Cycles tab (no data duplication); the browser's "Save as PDF" is the
 * export engine.
 */
export default async function CyclesReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = parsePositiveInt((await params).id);
  if (id === null) notFound();
  const view = await getProfileView(id);
  if (!view) notFound();
  const cycles = await getCyclesView(id);
  if (!cycles) notFound();

  const chart = toWheelChart(view.astro);
  const { profile } = view;
  const { profection, firdaria, zodiacalReleasing: zr, solarReturn: sr } =
    cycles;
  const lunation = cycles.progressions.lunation;
  const srAsc = sr.chart.houses;
  const srMoon = sr.chart.placements.find((p) => p.planet === "moon");
  const prose = resolveCyclesProse(cycles);
  const contacts = prose.contacts ?? {};
  const progressedSun = cycles.progressions.placements.find((p) => p.planet === "sun");
  const progressedAsc = cycles.progressions.chart.houses?.ascendant;
  const lr = cycles.lunarReturn;

  return (
    <main className={styles.report}>
      <div className={styles.actions}>
        <Link href={`/profiles/${profile.id}`}>← Back to the profile</Link>
        <Link href={`/profiles/${profile.id}/print`}>Full chart report</Link>
        <PrintButton className={styles.printButton} />
      </div>

      <header>
        <h1>{profile.displayName} — the year ahead</h1>
        <p className={styles.muted}>
          Cycles report generated {date(cycles.computedAt)} · chart version{" "}
          {cycles.natal.version}
          {cycles.natal.isSolarChart &&
            " · solar chart — techniques needing houses are omitted"}
        </p>
      </header>

      {profection && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Annual profection — {ordinal(profection.profectedHouse)}-house year
          </h2>
          <p>
            At age {profection.age} the year counts to the{" "}
            {ordinal(profection.profectedHouse)} house from the Ascendant:{" "}
            {SIGN_NAMES[profection.profectedSign]}, making{" "}
            {PLANET_NAMES[profection.yearLord]} lord of the year until{" "}
            {date(profection.yearEndUtc)}.
          </p>
          <PrintProse entry={prose.profection} />
        </section>
      )}

      {firdaria && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Firdaria</h2>
          <p>
            Major period of <strong>{lordName(firdaria.major.lord)}</strong> (
            {date(firdaria.major.startUtc)} – {date(firdaria.major.endUtc)})
            {firdaria.sub && (
              <>
                , sub-period of <strong>{lordName(firdaria.sub.lord)}</strong>{" "}
                ({date(firdaria.sub.startUtc)} – {date(firdaria.sub.endUtc)})
              </>
            )}
            .
          </p>
          <PrintProse entry={prose.firdaria} />
          {prose.firdariaSub && firdaria.sub && (
            <>
              <h3 className={styles.readingTitle}>
                The {lordName(firdaria.sub.lord)} sub-period
              </h3>
              <PrintProse entry={prose.firdariaSub} />
            </>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Secondary progressions — age {Math.floor(cycles.progressions.ageYears)}
        </h2>
        <p>
          {progressedSun && (
            <>
              Progressed Sun in <strong>{SIGN_NAMES[progressedSun.sign]}</strong>
              {progressedAsc !== undefined && (
                <>
                  , progressed Ascendant in{" "}
                  <strong>{SIGN_NAMES[chartSign(progressedAsc)]}</strong>
                </>
              )}
              .{" "}
            </>
          )}
          The progressed Sun–Moon cycle stands at the{" "}
          <strong>{lunation.phaseName}</strong> phase. Next progressed New
          Moon: {date(lunation.nextNewMoonUtc)}; next progressed Full Moon:{" "}
          {date(lunation.nextFullMoonUtc)}.
        </p>
        <PrintProse entry={prose.progressedSun} />
        <PrintProse entry={prose.progressedAsc} />
        <h3 className={styles.readingTitle}>Progressed contacts to the natal chart</h3>
        <ContactList
          label="Progressed"
          rows={cycles.progressions.crossAspects}
          contacts={contacts}
          withProse
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Tertiary progressions — lunar month {Math.floor(cycles.tertiary.ageMonths)}
        </h2>
        <ContactList
          label="Tertiary"
          rows={cycles.tertiary.crossAspects}
          contacts={contacts}
          withProse={false}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Solar arc directions — arc {cycles.solarArc.arcDegrees.toFixed(1)}°
        </h2>
        <PrintProse entry={prose.solarArc} />
        <ContactList
          label="Directed"
          rows={cycles.solarArc.crossAspects}
          angleRows={cycles.solarArc.angleAspects}
          contacts={contacts}
          withProse
        />
      </section>

      {zr && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Zodiacal releasing</h2>
          <ul className={styles.aspectList}>
            {(
              [
                ["Fortune", zr.fortune],
                ["Spirit", zr.spirit],
              ] as const
            ).map(
              ([label, rel]) =>
                rel.current && (
                  <li key={label}>
                    From {label} (lot in {SIGN_NAMES[rel.lotSign]}):{" "}
                    {SIGN_NAMES[rel.current.l1.sign]} period (
                    {lordName(rel.current.l1.lord)},{" "}
                    {date(rel.current.l1.startUtc)} –{" "}
                    {date(rel.current.l1.endUtc)})
                    {rel.current.l1.angular === "10th" && " — peak years"}
                    {rel.current.l1.loosedBond && " — after a loosing of the bond"}
                    ; within it, {SIGN_NAMES[rel.current.l2.sign]} until{" "}
                    {date(rel.current.l2.endUtc)}.
                  </li>
                ),
            )}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Solar return {sr.year}</h2>
        <p>
          The Sun returns to its natal degree on{" "}
          {new Date(sr.returnUtc).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          (cast for the birth place; the Cycles tab can relocate it).
          {srAsc && (
            <>
              {" "}
              Return Ascendant {formatDegreeInSign(
                srAsc.ascendant % 30,
              )}{" "}
              {SIGN_NAMES[chartSign(srAsc.ascendant)]}
              {srMoon && (
                <>
                  ; return Moon in {SIGN_NAMES[srMoon.sign]} (house{" "}
                  {srMoon.house ?? "—"})
                </>
              )}
              .
            </>
          )}
        </p>
        <PrintProse entry={prose.solarReturn} />
      </section>

      {lr && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Lunar return</h2>
          <p>
            The Moon last returned to its natal degree on {date(lr.returnUtc)};
            this month&rsquo;s chart holds until {date(lr.nextReturnUtc)}
            {lr.chart.houses && (
              <>
                , with the return Ascendant in{" "}
                {SIGN_NAMES[chartSign(lr.chart.houses.ascendant)]}
              </>
            )}
            .
          </p>
          <PrintProse entry={prose.lunarReturn} />
        </section>
      )}

      {cycles.planetaryReturns.some((r) => r.nextExactUtc || r.lastExactUtc) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Jupiter and Saturn returns</h2>
          <ul className={styles.aspectList}>
            {cycles.planetaryReturns.map((r) => (
              <li key={r.planet}>
                {PLANET_NAMES[r.planet]}:{" "}
                {r.lastExactUtc ? <>last exact {date(r.lastExactUtc)}</> : "no return yet"}
                {r.nextExactUtc && <>; next {date(r.nextExactUtc)}</>}.
              </li>
            ))}
          </ul>
          <PrintProse entry={prose.jupiterReturn} />
          <PrintProse entry={prose.saturnReturn} />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Exact transits — next twelve months
        </h2>
        <YearAheadTransits placements={chart.placements} />
      </section>
    </main>
  );
}

/** Sign of an ecliptic longitude, without importing astro-core client-side. */
function chartSign(longitude: number) {
  const SIGNS = [
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
  ] as const;
  return SIGNS[Math.floor((((longitude % 360) + 360) % 360) / 30)];
}
