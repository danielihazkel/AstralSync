"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  backupDue,
  daysSinceBackup,
  loadBackupState,
  saveBackupState,
  withCountingStarted,
  type BackupState,
} from "@/lib/backupReminder";
import { exportAllToFile } from "./exportAll";
import styles from "./settings.module.css";

/**
 * The home page's backup nudge: when this browser's last whole export is
 * older than the chosen interval (Settings → Your data), offer one — a
 * click away, since a page cannot save a file on its own. Quiet on the
 * server render and until localStorage has been read.
 */
export default function BackupReminder() {
  const [state, setState] = useState<BackupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const now = new Date();
    const loaded = loadBackupState();
    const started = withCountingStarted(loaded, now);
    if (started !== loaded) saveBackupState(started);
    setState(started);
  }, []);

  if (state === null || !backupDue(state, new Date())) return null;
  const days = daysSinceBackup(state, new Date());

  async function backUp() {
    setBusy(true);
    setFailed(false);
    try {
      await exportAllToFile(true);
      setState(loadBackupState());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function snooze() {
    const next = {
      ...state!,
      snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(),
    };
    saveBackupState(next);
    setState(next);
  }

  return (
    <aside className={styles.backupReminder} aria-label="Backup reminder">
      <p>
        {state.lastBackupAt
          ? `Your last backup from this browser was ${days} days ago.`
          : "Your charts, notes and readings have not been backed up from this browser yet."}{" "}
        One file holds everything.
        {failed && " The export failed — is the server running?"}
      </p>
      <span className={styles.backupActions}>
        <button className={styles.reset} onClick={() => void backUp()} disabled={busy}>
          {busy ? "Exporting…" : "Back up now"}
        </button>
        <button className={styles.reset} onClick={snooze}>
          Tomorrow
        </button>
        <Link href="/settings#data">Settings</Link>
      </span>
    </aside>
  );
}
