import Link from "next/link";
import type { Sign } from "@astralsync/astro-core";
import { listProfiles } from "@/lib/snapshots";
import {
  SIGN_NAMES,
  TIME_CERTAINTY_LABELS,
  formatBirthDate,
} from "@/components/format";
import DeleteProfileButton from "@/components/profiles/DeleteProfileButton";
import styles from "./page.module.css";

// Profile data lives in the local DB and changes between requests.
export const dynamic = "force-dynamic";

export default async function Home() {
  const profiles = await listProfiles();

  return (
    <main>
      <h1>Profiles</h1>
      <p className={styles.tagline}>
        Natal charts and numerology — computed once, stored forever, fully
        offline.
      </p>

      {profiles.length === 0 ? (
        <div className={styles.empty}>
          <p>No profiles yet.</p>
          <Link href="/onboarding" className={styles.cta}>
            Create your first chart
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {profiles.map((p) => (
            <li key={p.id} className={styles.card}>
              <Link href={`/profiles/${p.id}`} className={styles.cardLink}>
                <span className={styles.name}>{p.displayName}</span>
                <span className={styles.meta}>
                  {formatBirthDate(p.birthDate)}
                  {p.sunSign ? ` · ${SIGN_NAMES[p.sunSign as Sign]} Sun` : ""}
                </span>
                <span className={styles.tags}>
                  {p.isSolarChart && (
                    <span className={styles.tag}>Solar chart</span>
                  )}
                  {p.timeCertainty === "approx" && (
                    <span className={styles.tag}>
                      {TIME_CERTAINTY_LABELS.approx}
                    </span>
                  )}
                </span>
              </Link>
              <DeleteProfileButton
                profileId={p.id}
                displayName={p.displayName}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
