"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { applySettingsBundle } from "@/lib/settingsBundle";
import styles from "./ImportProfileButton.module.css";

/**
 * Restore from an export file — one profile (Details tab → Export) or an
 * "Export all" bundle (Settings → Your data). Client-side JSON.parse gives a
 * friendlier error than the server for non-JSON files; everything else is
 * validated by POST /api/profiles/import. A bundle's settings block is
 * applied here, in the browser, since preferences never reach the server.
 */
export default function ImportProfileButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setDone(null);
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
      const body = (await res.json()) as { id?: number; ids?: number[] };
      if (Array.isArray(body.ids)) {
        const settings = (data as { settings?: unknown }).settings;
        const applied =
          settings !== undefined && applySettingsBundle(settings);
        setDone(
          `Imported ${body.ids.length} ${body.ids.length === 1 ? "profile" : "profiles"}${applied ? " and applied the settings" : ""}.`,
        );
        router.push("/");
        router.refresh();
        return;
      }
      router.push(`/profiles/${body.id}`);
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
      {done && <span role="status">{done}</span>}
    </span>
  );
}
