"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/settings/settings.module.css";

/**
 * Toggle the "primary" flag — the one chart that leads the Today strip and
 * is preselected wherever a chart is picked (synastry, electional). Setting
 * it clears any other primary; a plain flag change, never a recompute.
 */
export default function PrimaryProfileButton({
  profileId,
  isPrimary,
}: {
  profileId: number;
  isPrimary: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/profiles/${profileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimary: !isPrimary }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Could not update — is the server running?");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button className={styles.reset} onClick={() => void toggle()} disabled={busy}>
        {busy
          ? "Saving…"
          : isPrimary
            ? "Unset as my chart"
            : "Set as my chart"}
      </button>
      {error && <span className={styles.note}> {error}</span>}
    </>
  );
}
