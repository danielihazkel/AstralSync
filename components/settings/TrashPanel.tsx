"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { TrashData } from "@/lib/trash";
import { formatBirthDate } from "@/components/format";
import { formatEventDate } from "@/lib/lifeEventMeta";
import styles from "./settings.module.css";

type State =
  | { kind: "loading" }
  | { kind: "data"; data: TrashData }
  | { kind: "error" };

const GENERATOR_LABEL: Record<string, string> = {
  llm: "AI reading",
  hebrew_llm: "Mazal AI reading",
  life_story: "Life Story reading",
  template: "reading",
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Settings → Trash: everything the Undo toast could have restored, for as
 * long as the user leaves it here. Restore puts an item back where it was;
 * "Delete forever" and "Empty trash" are the only irreversible deletes in
 * the app.
 */
export default function TrashPanel() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trash");
      if (!res.ok) throw new Error();
      setState({ kind: "data", data: await res.json() });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    action: "restore" | "purge",
    kind: "profile" | "journal" | "reading" | "event",
    id: number,
  ) {
    const key = `${kind}:${id}`;
    setBusyKey(key);
    setNotice(null);
    const res = await fetch("/api/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, kind, id }),
    }).catch(() => null);
    setBusyKey(null);
    if (!res) {
      setNotice("Could not reach the server.");
      return;
    }
    if (res.status === 409) {
      setNotice(
        "A new reading has been generated for that chart version since — discard it first to restore this one.",
      );
      return;
    }
    if (!res.ok && res.status !== 404) {
      setNotice("That didn't work — try again.");
      return;
    }
    await load();
    // Restored profiles and notes reappear on server-rendered pages.
    router.refresh();
  }

  async function empty() {
    setBusyKey("empty");
    setNotice(null);
    const res = await fetch("/api/trash", { method: "DELETE" }).catch(() => null);
    setBusyKey(null);
    setConfirmEmpty(false);
    if (!res?.ok) {
      setNotice("Could not empty the Trash.");
      return;
    }
    await load();
  }

  if (state.kind === "loading") {
    return <p className={styles.note}>Loading the Trash…</p>;
  }
  if (state.kind === "error") {
    return (
      <p className={styles.note}>
        Could not load the Trash.{" "}
        <button className={styles.reset} onClick={() => void load()}>
          Retry
        </button>
      </p>
    );
  }

  const { profiles, journalEntries, lifeEvents, readings } = state.data;
  const total =
    profiles.length + journalEntries.length + lifeEvents.length +
    readings.length;

  if (total === 0) {
    return (
      <p className={styles.note}>
        The Trash is empty. Deleted profiles, notes, life events and
        discarded AI readings wait here until you restore them or delete
        them for good.
      </p>
    );
  }

  const row = (
    key: string,
    kind: "profile" | "journal" | "reading" | "event",
    id: number,
    label: React.ReactNode,
    meta: string,
  ) => (
    <li key={key} className={styles.trashRow}>
      <span className={styles.trashLabel}>
        {label}
        <span className={styles.note}> {meta}</span>
      </span>
      <span className={styles.trashActions}>
        <button
          className={styles.reset}
          onClick={() => void act("restore", kind, id)}
          disabled={busyKey !== null}
        >
          Restore
        </button>
        <button
          className={styles.danger}
          onClick={() => void act("purge", kind, id)}
          disabled={busyKey !== null}
        >
          Delete forever
        </button>
      </span>
    </li>
  );

  return (
    <div>
      {notice && (
        <p className={styles.note} role="status">
          {notice}
        </p>
      )}
      {profiles.length > 0 && (
        <>
          <h3 className={styles.trashGroup}>Profiles</h3>
          <ul className={styles.trashList}>
            {profiles.map((p) =>
              row(
                `p${p.id}`,
                "profile",
                p.id,
                <strong>{p.displayName}</strong>,
                `· born ${formatBirthDate(p.birthDate)} · deleted ${when(p.deletedAt)}`,
              ),
            )}
          </ul>
        </>
      )}
      {journalEntries.length > 0 && (
        <>
          <h3 className={styles.trashGroup}>Journal notes</h3>
          <ul className={styles.trashList}>
            {journalEntries.map((e) =>
              row(
                `j${e.id}`,
                "journal",
                e.id,
                <>
                  <Link href={`/profiles/${e.profileId}?tab=journal`}>
                    {e.displayName}
                  </Link>
                  , {formatBirthDate(e.entryDate)}: <em>{e.excerpt}</em>
                </>,
                `· deleted ${when(e.deletedAt)}`,
              ),
            )}
          </ul>
        </>
      )}
      {lifeEvents.length > 0 && (
        <>
          <h3 className={styles.trashGroup}>Life events</h3>
          <ul className={styles.trashList}>
            {lifeEvents.map((e) =>
              row(
                `e${e.id}`,
                "event",
                e.id,
                <>
                  <Link href={`/profiles/${e.profileId}?tab=life-events`}>
                    {e.displayName}
                  </Link>
                  , {formatEventDate(e.eventDate, e.precision)}:{" "}
                  <em>{e.title}</em>
                </>,
                `· deleted ${when(e.deletedAt)}`,
              ),
            )}
          </ul>
        </>
      )}
      {readings.length > 0 && (
        <>
          <h3 className={styles.trashGroup}>Discarded AI readings</h3>
          <ul className={styles.trashList}>
            {readings.map((r) =>
              row(
                `r${r.id}`,
                "reading",
                r.id,
                <>
                  <Link href={`/profiles/${r.profileId}?version=${r.version}`}>
                    {r.displayName}
                  </Link>{" "}
                  v{r.version} {GENERATOR_LABEL[r.generator] ?? r.generator}:{" "}
                  <em>{r.excerpt}</em>
                </>,
                `· discarded ${when(r.discardedAt)}`,
              ),
            )}
          </ul>
        </>
      )}
      <p className={styles.note}>
        {confirmEmpty ? (
          <>
            Delete all {total} items forever?{" "}
            <button
              className={styles.danger}
              onClick={() => void empty()}
              disabled={busyKey !== null}
            >
              {busyKey === "empty" ? "Emptying…" : "Empty trash"}
            </button>{" "}
            <button className={styles.reset} onClick={() => setConfirmEmpty(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className={styles.reset} onClick={() => setConfirmEmpty(true)}>
            Empty trash
          </button>
        )}
      </p>
    </div>
  );
}
