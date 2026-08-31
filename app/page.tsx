import { listProfiles } from "@/lib/snapshots";
import { capTodayProfiles } from "@/lib/todayCap";
import EmptyState from "@/components/EmptyState";
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
  // Scan guardrail: the Today strip computes for the primary + most
  // recently viewed charts; the rest stay in the list below, unscanned.
  const todayScan = capTodayProfiles(
    profiles.filter((p) => p.placements !== null),
  );

  return (
    <main>
      <h1>Profiles</h1>
      <p className={styles.tagline}>
        Natal charts and numerology — computed once, stored forever, fully
        offline.
      </p>

      <TodayDashboard
        profiles={todayScan.shown.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          placements: p.placements!,
        }))}
        primaryId={primaryId}
        hiddenCount={todayScan.hiddenCount}
      />

      {profiles.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            glyph="✶"
            title="No charts yet"
            hint="Birth data goes in once — the chart, numerology and Mazal snapshots are computed at creation and stored locally forever."
            action={{ href: "/onboarding", label: "Create your first chart" }}
          />
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
