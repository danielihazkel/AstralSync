import Link from "next/link";
import { listProfiles } from "@/lib/snapshots";
import ImportProfileButton from "@/components/profiles/ImportProfileButton";
import ProfileList from "@/components/profiles/ProfileList";
import PairPicker from "@/components/synastry/PairPicker";
import TodayDashboard from "@/components/today/TodayDashboard";
import styles from "./page.module.css";

// Profile data lives in the local DB and changes between requests.
export const dynamic = "force-dynamic";

export default async function Home() {
  // listProfiles() puts the primary profile first, so every consumer below
  // inherits "me first" for free.
  const profiles = await listProfiles();
  const primaryId = profiles.find((p) => p.isPrimary)?.id ?? null;

  return (
    <main>
      <h1>Profiles</h1>
      <p className={styles.tagline}>
        Natal charts and numerology — computed once, stored forever, fully
        offline.
      </p>

      <TodayDashboard
        profiles={profiles
          .filter((p) => p.placements !== null)
          .map((p) => ({
            id: p.id,
            displayName: p.displayName,
            placements: p.placements!,
          }))}
        primaryId={primaryId}
      />

      {profiles.length === 0 ? (
        <div className={styles.empty}>
          <p>No profiles yet.</p>
          <Link href="/onboarding" className={styles.cta}>
            Create your first chart
          </Link>
          <p className={styles.tagline}>
            Have an export file? <ImportProfileButton />
          </p>
        </div>
      ) : (
        <ProfileList
          profiles={profiles.map(({ placements: _placements, ...p }) => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
          }))}
        />
      )}

      {profiles.length >= 2 && (
        <PairPicker
          profiles={profiles.map((p) => ({
            id: p.id,
            displayName: p.displayName,
          }))}
          defaultA={primaryId}
        />
      )}

      {profiles.length > 0 && (
        <p className={styles.tagline} style={{ marginTop: "2rem" }}>
          Restore a profile from an export file: <ImportProfileButton />
        </p>
      )}
    </main>
  );
}
