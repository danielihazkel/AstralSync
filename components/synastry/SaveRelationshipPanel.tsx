"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_RELATIONSHIP_LABEL,
  MAX_RELATIONSHIP_NOTE,
  RELATIONSHIP_KINDS,
  RELATIONSHIP_KIND_LABELS,
  type RelationshipKind,
} from "@/lib/relationshipMeta";
import type { RelationshipView } from "@/lib/relationships";
import styles from "./synastry.module.css";

/**
 * "Save this pair" on the synastry page: label the comparison as a
 * relationship (partner/family/friend/colleague/other) so it shows up on
 * the synastry landing list and filters the group grid. One row per pair —
 * saving again overwrites; removing deletes only the label, never a chart.
 */
export default function SaveRelationshipPanel({
  a,
  b,
  existing,
}: {
  a: number;
  b: number;
  existing: RelationshipView | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RelationshipKind>(existing?.kind ?? "partner");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a, b, kind, label, note }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Could not save — is the server running?");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/relationships/${existing.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Could not remove — is the server running?");
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <p className={styles.relRow}>
        {existing ? (
          <>
            <span className={styles.tag}>
              {RELATIONSHIP_KIND_LABELS[existing.kind]}
            </span>{" "}
            {existing.label && <strong>“{existing.label}” </strong>}
            {existing.note && (
              <span className={styles.muted}>{existing.note} </span>
            )}
            <button
              className={styles.relLink}
              onClick={() => setOpen(true)}
              disabled={busy}
            >
              Edit
            </button>{" "}
            <button
              className={styles.relLink}
              onClick={() => void remove()}
              disabled={busy}
            >
              Remove
            </button>
          </>
        ) : (
          <button className={styles.relLink} onClick={() => setOpen(true)}>
            Save this pair as a relationship…
          </button>
        )}
        {error && <span className={styles.muted}> {error}</span>}
      </p>
    );
  }

  return (
    <div className={styles.relForm} role="group" aria-label="Save relationship">
      <label>
        Kind{" "}
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as RelationshipKind)}
        >
          {RELATIONSHIP_KINDS.map((k) => (
            <option key={k} value={k}>
              {RELATIONSHIP_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Label{" "}
        <input
          value={label}
          maxLength={MAX_RELATIONSHIP_LABEL}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="optional — “us”, “my parents”…"
        />
      </label>
      <label>
        Note{" "}
        <input
          value={note}
          maxLength={MAX_RELATIONSHIP_NOTE}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional"
        />
      </label>
      <span>
        <button onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>{" "}
        <button onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </span>
      {error && <span className={styles.muted}>{error}</span>}
    </div>
  );
}
