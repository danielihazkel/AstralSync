"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "./ImportProfileButton.module.css";

/**
 * Restore a profile from an export file (Details tab → Export). Client-side
 * JSON.parse gives a friendlier error than the server for non-JSON files;
 * everything else is validated by POST /api/profiles/import.
 */
export default function ImportProfileButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setBusy(false);
      setError("That file isn't valid JSON.");
      return;
    }
    const res = await fetch("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 201) {
      const { id } = (await res.json()) as { id: number };
      router.push(`/profiles/${id}`);
      router.refresh();
      return;
    }
    if (res?.status === 400) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "unsupported_export_version"
          ? "This export was made by a newer version of AstralSync."
          : "That doesn't look like an AstralSync export file.",
      );
      return;
    }
    setError(
      res?.status === 413
        ? "That file is too large to import."
        : "Import failed — is the server running?",
    );
  }

  return (
    <span className={styles.wrap}>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className={styles.hiddenInput}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Allow re-selecting the same file after a failure.
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <button
        className={styles.button}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? "Importing…" : "Import from file"}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </span>
  );
}
