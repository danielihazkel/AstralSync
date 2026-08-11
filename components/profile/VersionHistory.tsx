import Link from "next/link";
import type { HouseSystem } from "@astralsync/astro-core";
import { HOUSE_SYSTEM_NAMES } from "@/components/format";
import type { SnapshotVersionInfo } from "./DetailsPanel";
import styles from "./profile.module.css";

/** Minimal version switcher: every snapshot version stays readable forever
 *  (write-once rule) via `?version=N`. */
export default function VersionHistory({
  profileId,
  versions,
  currentVersion,
}: {
  profileId: number;
  versions: SnapshotVersionInfo[];
  currentVersion: number;
}) {
  const latest = versions[0]?.version;
  return (
    <div>
      <h3 className={styles.sectionTitle}>Version history</h3>
      <ul className={styles.versionList}>
        {versions.map((v) => (
          <li key={v.version} className={styles.versionRow}>
            {v.version === currentVersion ? (
              <strong>v{v.version}</strong>
            ) : (
              <Link
                href={
                  v.version === latest
                    ? `/profiles/${profileId}`
                    : `/profiles/${profileId}?version=${v.version}`
                }
              >
                v{v.version}
              </Link>
            )}{" "}
            <span className={styles.versionMeta}>
              {new Date(v.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              {" · "}
              {v.isSolarChart
                ? "solar chart"
                : HOUSE_SYSTEM_NAMES[v.houseSystem as HouseSystem]}
              {v.version === latest && " · current"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
