"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { announceUndo, restoreFromTrash } from "@/components/undo/undoBus";
import styles from "./DeleteProfileButton.module.css";

/**
 * Delete with inline confirmation (PRD §4.6). The profile moves to the
 * Trash — every snapshot version, reading and note goes with it and comes
 * back on Undo (offered by the toast for a while, then from Settings →
 * Trash). Inline confirm instead of window.confirm so the flow stays
 * keyboard-accessible and styleable.
 */
export default function DeleteProfileButton({
  profileId,
  displayName,
  redirectTo,
}: {
  profileId: number;
  displayName: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/profiles/${profileId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) {
      setBusy(false);
      setError("Delete failed — is the server running?");
      return;
    }
    if (res.ok) {
      announceUndo({
        message: `Moved “${displayName}” to the Trash.`,
        restore: () => restoreFromTrash("profile", profileId),
      });
    }
    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        className={styles.trigger}
        onClick={() => setConfirming(true)}
        aria-label={`Delete profile ${displayName}`}
      >
        Delete
      </button>
    );
  }

  return (
    <span className={styles.confirmRow}>
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : (
        <span className={styles.prompt}>
          Move “{displayName}” and all its chart versions to the Trash?
        </span>
      )}
      <button className={styles.confirm} onClick={handleDelete} disabled={busy}>
        {busy ? "Deleting…" : "Delete"}
      </button>
      <button
        className={styles.cancel}
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        disabled={busy}
      >
        Cancel
      </button>
    </span>
  );
}
