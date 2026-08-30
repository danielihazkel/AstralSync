"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HouseSystem } from "@astralsync/astro-core";
import type { ProfileData } from "@/lib/view-types";
import { HOUSE_SYSTEM_NAMES } from "@/components/format";
import { profileToInput } from "./profileToInput";
import styles from "./profile.module.css";

const SYSTEMS: HouseSystem[] = [
  "placidus",
  "whole_sign",
  "equal",
  "porphyry",
  "koch",
  "regiomontanus",
  "campanus",
  "alcabitius",
];

/**
 * Changing the house system recomputes once and writes a new snapshot
 * version (write-once rule) — the old version stays readable in the history.
 */
export default function HouseSystemSelector({
  profile,
  requestedSystem,
  actualSystem,
  fallbackApplied,
}: {
  profile: ProfileData;
  requestedSystem: HouseSystem;
  actualSystem: HouseSystem;
  fallbackApplied: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: HouseSystem) {
    if (next === requestedSystem) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/profiles/${profile.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileToInput(profile, next)),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      router.refresh();
      return;
    }
    if (res?.status === 409) {
      setError(
        "This profile was changed elsewhere at the same time — reload and try again.",
      );
    } else {
      setError("Could not switch the house system.");
    }
  }

  return (
    <div className={styles.houseSystem}>
      <label className={styles.houseSystemLabel}>
        House system
        <select
          value={requestedSystem}
          onChange={(e) => change(e.target.value as HouseSystem)}
          disabled={busy}
        >
          {SYSTEMS.map((s) => (
            <option key={s} value={s}>
              {HOUSE_SYSTEM_NAMES[s]}
            </option>
          ))}
        </select>
      </label>
      {busy && <span className={styles.hint}>Recomputing…</span>}
      {fallbackApplied && (
        <span className={styles.hint}>
          {HOUSE_SYSTEM_NAMES[requestedSystem]} is undefined at this latitude —{" "}
          {HOUSE_SYSTEM_NAMES[actualSystem]} was used.
        </span>
      )}
      <span className={styles.hint}>
        Switching creates a new chart version; earlier versions stay in the
        history below.
      </span>
      {error && <span className={styles.selectorError}>{error}</span>}
    </div>
  );
}
