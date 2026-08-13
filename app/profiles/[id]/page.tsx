import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DEFAULT_ORBS,
  MINOR_ASPECTS,
  detectAspects,
  detectPatterns,
  overlayHouses,
  partOfFortunePlacement,
  pointsAt,
} from "@astralsync/astro-core";
import { getEntry, loadContentIndex, resolveReading } from "@/lib/content";
import { resolveHebrewReading } from "@/lib/hebrewReading";
import { llmClientFromEnv } from "@/lib/llm";
import {
  ensureHebrewSnapshot,
  getProfileName,
  getProfileView,
  listSnapshotVersions,
} from "@/lib/snapshots";
import {
  toNumeroReadingInput,
  toStoredHebrewGematria,
  toStoredMazal,
  toWheelChart,
} from "@/lib/view-types";
import {
  TIME_CERTAINTY_LABELS,
  TZ_WARNING_COPY,
  formatBirthDate,
  formatOffset,
} from "@/components/format";
import ProfileTabs from "@/components/profile/ProfileTabs";
import BigThree from "@/components/profile/BigThree";
import styles from "./page.module.css";

// Snapshot data lives in the local DB; render per-request.
export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Per-profile browser-tab title (composed via the layout's title template). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const id = parsePositiveInt((await params).id);
  if (id === null) return {};
  const name = await getProfileName(id);
  return name ? { title: name } : {};
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id: rawId } = await params;
  const { version: rawVersion } = await searchParams;
  const id = parsePositiveInt(rawId);
  if (id === null) notFound();
  const version =
    rawVersion === undefined ? undefined : parsePositiveInt(rawVersion);
  if (version === null) notFound();

  // Lazy backfill for pre-feature profiles (latest version only, write-once
  // create, no-op after the first view) — getProfileView stays a pure read.
  await ensureHebrewSnapshot(id);
  const [view, versions] = await Promise.all([
    getProfileView(id, version),
    listSnapshotVersions(id),
  ]);
  if (!view) notFound();

  const chart = toWheelChart(view.astro);
  // Calculated points (nodes, Lilith) are ephemeral: recomputed from the
  // stored instant on every read, never persisted. Both node variants ship
  // so the client toggle needs no round trip.
  const birthUtc = new Date(chart.input.utc);
  const cusps = chart.houses?.cusps ?? null;
  const points = {
    mean: overlayHouses(pointsAt(birthUtc, "mean"), cusps),
    true: overlayHouses(pointsAt(birthUtc, "true"), cusps),
  };
  // Part of Fortune needs an Ascendant, so solar charts skip it. Identical
  // in both node variants — the lot doesn't involve the nodes.
  if (chart.houses && cusps) {
    const sunLon = chart.placements.find((p) => p.planet === "sun")!.longitude;
    const moonLon = chart.placements.find((p) => p.planet === "moon")!.longitude;
    const fortune = overlayHouses(
      [partOfFortunePlacement(chart.houses.ascendant, sunLon, moonLon, cusps)],
      cusps,
    )[0];
    points.mean.push(fortune);
    points.true.push(fortune);
  }
  const latestVersion = versions[0]?.version ?? view.astro.version;
  const isLatest = view.astro.version === latestVersion;
  const { profile } = view;
  const numeroInput = toNumeroReadingInput(view.numero);
  const contentIndex = loadContentIndex();
  const reading = resolveReading(
    chart,
    numeroInput,
    view.astro.contentVersion,
    contentIndex,
  );
  // Name-number prose for the Numerology tab, resolved here because the
  // content loader is server-only (the panel is a client component).
  const prose = (key: string | null) => {
    const entry = key === null ? null : getEntry(contentIndex, key);
    return entry ? { title: entry.title, bodyMd: entry.bodyMd } : null;
  };
  const numeroProse = {
    destiny: prose(
      numeroInput.destiny ? `destiny/${numeroInput.destiny.value}` : null,
    ),
    soulUrge: prose(
      numeroInput.soulUrge ? `soul_urge/${numeroInput.soulUrge.value}` : null,
    ),
  };
  const llmEnabled = llmClientFromEnv() !== null;
  // Null for historical versions computed before the Mazal feature.
  const hebrewReading = view.hebrew
    ? resolveHebrewReading(
        toStoredMazal(view.hebrew),
        toStoredHebrewGematria(view.hebrew),
        view.hebrew.contentVersion,
      )
    : null;

  return (
    <main>
      <header className={styles.header}>
        <p className={styles.muted}>
          <Link href="/">← All profiles</Link>
        </p>
        <h1>{profile.displayName}</h1>
        <p className={styles.birthLine}>
          {formatBirthDate(profile.birthDate)}
          {profile.birthTime
            ? ` at ${profile.birthTime}`
            : " — time unknown"}{" "}
          <span className={styles.muted}>
            ({TIME_CERTAINTY_LABELS[profile.timeCertainty].toLowerCase()})
          </span>
        </p>
        <p className={styles.birthLine}>
          {profile.birthCity
            ? [
                profile.birthCity.name,
                profile.birthCity.admin1,
                profile.birthCity.countryCode,
              ]
                .filter(Boolean)
                .join(", ")
            : `${profile.birthLat.toFixed(2)}°, ${profile.birthLng.toFixed(2)}°`}{" "}
          · {profile.tzIana} · {formatOffset(profile.utcOffsetMinutes)}
          {profile.offsetOverridden && (
            <span className={styles.overrideTag}>offset manually set</span>
          )}
        </p>
      </header>

      {chart.tzWarnings.includes("pre_1970_offset_uncertain") &&
        !profile.offsetOverridden && (
          <p className={styles.warning}>
            {TZ_WARNING_COPY.pre_1970_offset_uncertain}{" "}
            <Link href={`/profiles/${profile.id}/edit`}>Review birth data</Link>
          </p>
        )}

      {!isLatest && (
        <p className={styles.versionBanner}>
          Viewing chart version {view.astro.version} (read-only).{" "}
          <Link href={`/profiles/${profile.id}`}>
            Back to the current version ({latestVersion})
          </Link>
        </p>
      )}

      <BigThree chart={chart} />

      <ProfileTabs
        profile={profile}
        astro={view.astro}
        numero={view.numero}
        numeroProse={numeroProse}
        chart={chart}
        points={points}
        patterns={detectPatterns(chart.placements)}
        // Read-time overlay with fixed tight orbs (2°) — never stored, and
        // deliberately not orb-configurable so SSR output stays stable.
        minorAspects={detectAspects(chart.placements, DEFAULT_ORBS, MINOR_ASPECTS)}
        versions={versions}
        isLatest={isLatest}
        reading={reading}
        hebrew={view.hebrew}
        hebrewReading={hebrewReading}
        llmEnabled={llmEnabled}
      />
    </main>
  );
}
