import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntry, loadContentIndex, natalAspectKey } from "@/lib/content";
import { llmClientFromEnv } from "@/lib/llm";
import { listProfiles } from "@/lib/snapshots";
import {
  getSynastryReading,
  getSynastryView,
  normalizePair,
  synastryAspectKey,
} from "@/lib/synastry";
import { synastryQuerySchema } from "@/lib/validation";
import PairPicker from "@/components/synastry/PairPicker";
import PrintButton from "@/components/print/PrintButton";
import { PLANET_NAMES, SIGN_NAMES, formatDegreeInSign } from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import BiWheel from "@/components/synastry/LazyBiWheel";
import CompositePanel from "@/components/synastry/CompositePanel";
import CrossAspectList, {
  type AspectProse,
} from "@/components/synastry/CrossAspectList";
import SynastryReadingPanel from "@/components/synastry/SynastryReadingPanel";
import type { SynastrySide } from "@/lib/synastry";
import styles from "@/components/synastry/synastry.module.css";

// Snapshot data lives in the local DB; render per-request. Synastry is an
// ephemeral read — recomputed from the two stored charts on every view,
// never persisted, so the URL is shareable and always current.
export const dynamic = "force-dynamic";

function moonReason(side: SynastrySide): string | null {
  if (!side.moonUncertain) return null;
  return (
    side.chart.uncertainties.find((u) => u.field === "moon_sign")?.reason ??
    "The natal Moon sign is uncertain."
  );
}

function OverlayTable({
  owner,
  host,
}: {
  owner: SynastrySide;
  host: SynastrySide;
}) {
  return (
    <div>
      <h3 className={styles.sectionTitle}>
        {owner.displayName}&rsquo;s planets in {host.displayName}&rsquo;s houses
      </h3>
      <div className="tableWrap">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Planet</th>
            <th scope="col">Position</th>
            <th scope="col">House</th>
          </tr>
        </thead>
        <tbody>
          {owner.overlayPlacements.map((p) => (
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
              </td>
              <td>
                {formatDegreeInSign(p.degreeInSign)} {SIGN_NAMES[p.sign]}
              </td>
              <td>{p.house}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default async function SynastryPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const params = await searchParams;
  // Reached without a pair (e.g. the header link): offer the picker instead
  // of a 404. Present-but-invalid ids still 404 below.
  if (params.a === undefined && params.b === undefined) {
    const profiles = await listProfiles();
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>Synastry</h1>
        </header>
        <p className={styles.muted}>
          Compare two charts side by side: cross aspects at natal orbs and
          mutual house overlays, always recomputed from the stored snapshots.
        </p>
        {profiles.length >= 2 ? (
          <PairPicker
            profiles={profiles.map((p) => ({
              id: p.id,
              displayName: p.displayName,
            }))}
          />
        ) : (
          <p className={styles.muted}>
            Synastry needs two profiles —{" "}
            <Link href="/onboarding">create another chart</Link> to compare.
          </p>
        )}
        <p className={styles.muted}>
          <Link href="/">← All profiles</Link>
        </p>
      </main>
    );
  }
  const query = synastryQuerySchema.safeParse(params);
  if (!query.success) notFound();
  const view = await getSynastryView(query.data.a, query.data.b);
  if (!view) notFound();
  const { a, b, aspects, composite } = view;

  // The pair's stored AI reading (order-insensitive slot) + staleness.
  const storedReading = await getSynastryReading(query.data.a, query.data.b);
  const [pairA] = normalizePair(query.data.a, query.data.b);
  const currentA = a.profileId === pairA ? a.version : b.version;
  const currentB = a.profileId === pairA ? b.version : a.version;
  const readingStale =
    storedReading !== null &&
    (storedReading.aVersion !== currentA || storedReading.bVersion !== currentB);
  const llmEnabled = llmClientFromEnv() !== null;

  // Optional pair prose from the content library (3d Tier 6) — absent keys
  // simply render nothing, same degradation as the reading resolvers.
  const index = loadContentIndex();
  const prose: Record<string, AspectProse> = {};
  for (const c of aspects) {
    const key = synastryAspectKey(c.a, c.b, c.type);
    const entry = getEntry(index, key);
    if (entry) prose[key] = { title: entry.title, bodyMd: entry.bodyMd };
  }
  // Composite aspects reuse natal pair prose as archetypal context, the
  // same degradation path the forecast route uses.
  const compositeProse: Record<string, AspectProse> = {};
  for (const c of composite.chart.aspects) {
    const key = natalAspectKey(c.a, c.b, c.type);
    const entry = getEntry(index, key);
    if (entry) compositeProse[key] = { title: entry.title, bodyMd: entry.bodyMd };
  }

  const eitherSolar = a.isSolarChart || b.isSolarChart;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1>
            {a.displayName} × {b.displayName}
          </h1>
          <PrintButton className={styles.printButton} />
        </div>
        {[a, b].map((side) => (
          <p key={side.profileId} className={styles.subline}>
            <Link href={`/profiles/${side.profileId}`}>
              {side.displayName}
            </Link>
            <span>chart version {side.version}</span>
            {side.isSolarChart && (
              <span className={styles.tag}>Solar chart</span>
            )}
            {moonReason(side) && (
              <UncertaintyBadge reason={moonReason(side)!} />
            )}
          </p>
        ))}
      </header>

      {eitherSolar && (
        <p className={styles.notice} role="note">
          {a.isSolarChart && b.isSolarChart
            ? "Both birth times are unknown, so both charts are solar."
            : `${(a.isSolarChart ? a : b).displayName}'s birth time is unknown, so their chart is solar.`}{" "}
          Sign-to-sign aspects are unaffected, but house overlays into a solar
          chart are omitted — a solar chart has no houses.
        </p>
      )}

      <BiWheel a={a} b={b} aspects={aspects} />

      <section aria-label="Cross aspects">
        <h2 className={styles.sectionTitle}>Cross aspects</h2>
        <CrossAspectList
          aName={a.displayName}
          bName={b.displayName}
          aspects={aspects}
          aMoonReason={moonReason(a)}
          bMoonReason={moonReason(b)}
          prose={prose}
        />
      </section>

      <section aria-label="House overlays" className={styles.overlayTables}>
        {!b.isSolarChart && <OverlayTable owner={a} host={b} />}
        {!a.isSolarChart && <OverlayTable owner={b} host={a} />}
      </section>

      <CompositePanel
        composite={composite}
        aName={a.displayName}
        bName={b.displayName}
        prose={compositeProse}
      />

      <SynastryReadingPanel
        a={query.data.a}
        b={query.data.b}
        reading={storedReading}
        stale={readingStale}
        llmEnabled={llmEnabled}
      />

      <p className={styles.muted}>
        <Link href="/">← All profiles</Link>
      </p>
    </main>
  );
}
