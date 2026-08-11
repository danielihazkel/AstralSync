"use client";

import Link from "next/link";
import type { HouseSystem } from "@astralsync/astro-core";
import type { AstroView, ProfileData, WheelChart } from "@/lib/view-types";
import {
  TIME_CERTAINTY_LABELS,
  formatBirthDate,
  formatOffset,
} from "@/components/format";
import DeleteProfileButton from "@/components/profiles/DeleteProfileButton";
import HouseSystemSelector from "./HouseSystemSelector";
import VersionHistory from "./VersionHistory";
import styles from "./profile.module.css";

export interface SnapshotVersionInfo {
  version: number;
  createdAt: Date | string;
  houseSystem: string;
  isSolarChart: boolean;
}

export default function DetailsPanel({
  profile,
  astro,
  chart,
  versions,
  isLatest,
}: {
  profile: ProfileData;
  astro: AstroView;
  chart: WheelChart;
  versions: SnapshotVersionInfo[];
  isLatest: boolean;
}) {
  return (
    <div className={styles.details}>
      <section className={styles.detailsSection}>
        <h3 className={styles.sectionTitle}>Birth data</h3>
        <dl className={styles.factList}>
          <dt>Date</dt>
          <dd>{formatBirthDate(profile.birthDate)}</dd>
          <dt>Time</dt>
          <dd>
            {profile.birthTime ?? "unknown"} (
            {TIME_CERTAINTY_LABELS[profile.timeCertainty].toLowerCase()})
          </dd>
          <dt>Place</dt>
          <dd>
            {profile.birthCity
              ? [
                  profile.birthCity.name,
                  profile.birthCity.admin1,
                  profile.birthCity.countryCode,
                ]
                  .filter(Boolean)
                  .join(", ")
              : "coordinates only"}{" "}
            ({profile.birthLat.toFixed(4)}°, {profile.birthLng.toFixed(4)}°)
          </dd>
          <dt>Time zone</dt>
          <dd>
            {profile.tzIana} · {formatOffset(profile.utcOffsetMinutes)}
            {profile.offsetOverridden && " (manually overridden)"}
          </dd>
          {profile.fullBirthName && (
            <>
              <dt>Birth name</dt>
              <dd>{profile.fullBirthName}</dd>
            </>
          )}
          <dt>Computed by</dt>
          <dd>
            {astro.engine} v{astro.engineVersion}
          </dd>
        </dl>
        <p className={styles.actionRow}>
          <Link href={`/profiles/${profile.id}/edit`}>Edit birth data</Link>
          <span className={styles.hint}>
            — compute-relevant changes create a new chart version
          </span>
        </p>
      </section>

      {isLatest && chart.houses && (
        <section className={styles.detailsSection}>
          <HouseSystemSelector
            profile={profile}
            requestedSystem={astro.houseSystem as HouseSystem}
            actualSystem={chart.houses.system}
            fallbackApplied={chart.houses.fallbackApplied}
          />
        </section>
      )}

      <section className={styles.detailsSection}>
        <VersionHistory
          profileId={profile.id}
          versions={versions}
          currentVersion={astro.version}
        />
      </section>

      <section className={styles.detailsSection}>
        <h3 className={styles.sectionTitle}>Your data</h3>
        <p className={styles.actionRow}>
          <a href={`/api/profiles/${profile.id}/export`} download>
            Export everything (JSON)
          </a>
          <span className={styles.hint}>
            — every snapshot version, nothing held back
          </span>
        </p>
        <div className={styles.deleteRow}>
          <DeleteProfileButton
            profileId={profile.id}
            displayName={profile.displayName}
            redirectTo="/"
          />
        </div>
      </section>
    </div>
  );
}
