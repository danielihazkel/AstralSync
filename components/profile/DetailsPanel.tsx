"use client";

import Link from "next/link";
import type { HouseSystem } from "@astralsync/astro-core";
import type { ResolvedReading } from "@/lib/content";
import type { AstroView, ProfileData, WheelChart } from "@/lib/view-types";
import {
  TIME_CERTAINTY_LABELS,
  formatBirthDate,
  formatOffset,
} from "@/components/format";
import DeleteProfileButton from "@/components/profiles/DeleteProfileButton";
import HouseSystemSelector from "./HouseSystemSelector";
import PrimaryProfileButton from "./PrimaryProfileButton";
import VersionHistory from "./VersionHistory";
import styles from "./profile.module.css";

export interface SnapshotVersionInfo {
  version: number;
  createdAt: Date | string;
  houseSystem: string;
  isSolarChart: boolean;
  /** What changed versus the previous version; null for v1 / legacy rows. */
  note?: string | null;
}

export default function DetailsPanel({
  profile,
  astro,
  chart,
  versions,
  isLatest,
  reading,
}: {
  profile: ProfileData;
  astro: AstroView;
  chart: WheelChart;
  versions: SnapshotVersionInfo[];
  isLatest: boolean;
  reading: ResolvedReading;
}) {
  // Library sections only — the composed synthesis has no entry key.
  const authoredSections = reading.sections.filter((s) => s.key !== null).length;
  const attemptedSections = authoredSections + reading.missingKeys.length;
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
          {profile.hebrewBirthName && (
            <>
              <dt>Hebrew name</dt>
              <dd lang="he" dir="rtl">
                {profile.hebrewBirthName}
              </dd>
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
        <h3 className={styles.sectionTitle}>Reading coverage</h3>
        <p>
          {authoredSections} of {attemptedSections} interpretation sections
          this chart references are authored.
        </p>
        {reading.missingKeys.length > 0 ? (
          <details>
            <summary>
              Show the {reading.missingKeys.length} unauthored{" "}
              {reading.missingKeys.length === 1 ? "key" : "keys"}
            </summary>
            <ul className={styles.missingKeyList}>
              {reading.missingKeys.map((k) => (
                <li key={k}>
                  <code>{k}</code>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className={styles.hint}>
            Every section this chart references is authored — the Reading tab
            shows the full set.
          </p>
        )}
      </section>

      <section className={styles.detailsSection}>
        <h3 className={styles.sectionTitle}>Your data</h3>
        <p className={styles.actionRow}>
          <PrimaryProfileButton
            profileId={profile.id}
            isPrimary={profile.isPrimary}
          />
          <span className={styles.hint}>
            {profile.isPrimary
              ? "— this is your chart: it leads the Today strip and is preselected in synastry and the day picker"
              : "— mark this as your own chart to lead the Today strip and be preselected elsewhere"}
          </span>
        </p>
        <p className={styles.actionRow}>
          <a href={`/api/profiles/${profile.id}/export`} download>
            Export everything (JSON)
          </a>
          <span className={styles.hint}>
            — every snapshot version, nothing held back
          </span>
        </p>
        <p className={styles.actionRow}>
          <a href={`/profiles/${profile.id}/print`}>Printable report</a>
          <span className={styles.hint}>
            — chart, placements, reading and numerology on one page; use your
            browser&rsquo;s print dialog to save it as a PDF
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
