import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveReading } from "@/lib/content";
import { llmClientFromEnv } from "@/lib/llm";
import { getProfileView, listSnapshotVersions } from "@/lib/snapshots";
import { toWheelChart } from "@/lib/view-types";
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

  const [view, versions] = await Promise.all([
    getProfileView(id, version),
    listSnapshotVersions(id),
  ]);
  if (!view) notFound();

  const chart = toWheelChart(view.astro);
  const latestVersion = versions[0]?.version ?? view.astro.version;
  const isLatest = view.astro.version === latestVersion;
  const { profile } = view;
  const reading = resolveReading(
    chart,
    {
      lifePath: view.numero.lifePath,
      isMaster: view.numero.isMasterLifePath,
    },
    view.astro.contentVersion,
  );
  const llmEnabled = llmClientFromEnv() !== null;

  return (
    <main>
      <header className={styles.header}>
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
        chart={chart}
        versions={versions}
        isLatest={isLatest}
        reading={reading}
        llmEnabled={llmEnabled}
      />
    </main>
  );
}
