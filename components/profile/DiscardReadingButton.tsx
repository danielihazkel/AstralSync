"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { announceUndo, restoreFromTrash } from "@/components/undo/undoBus";
import styles from "@/components/profiles/DeleteProfileButton.module.css";

/**
 * Discard a stored AI reading with inline confirmation. Readings are
 * generated once per snapshot; discarding is the only way to replace a bad
 * generation — the generate button reappears after the refresh. The text
 * goes to the Trash, so a discard is undoable until a new reading fills
 * the slot.
 */
export default function DiscardReadingButton({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscard() {
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, { method: "DELETE" }).catch(() => null);
    // 404 ⇒ discarded concurrently — refresh shows reality either way.
    if (!res || (!res.ok && res.status !== 404)) {
      setBusy(false);
      setError("Discard failed — is the server running?");
      return;
    }
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as {
        archiveId?: number;
      } | null;
      if (typeof body?.archiveId === "number") {
        const archiveId = body.archiveId;
        announceUndo({
          message: "Reading moved to the Trash.",
          restore: () => restoreFromTrash("reading", archiveId),
        });
      }
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        className={styles.trigger}
        onClick={() => setConfirming(true)}
        aria-label="Discard this AI reading"
      >
        Discard
      </button>
    );
  }

  return (
    <span className={styles.confirmRow}>
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : (
        <span className={styles.prompt}>
          Discard this reading? It moves to the Trash and a new one can be
          generated.
        </span>
      )}
      <button className={styles.confirm} onClick={handleDiscard} disabled={busy}>
        {busy ? "Discarding…" : "Discard"}
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
