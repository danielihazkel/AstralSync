"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { applySettingsBundle } from "@/lib/settingsBundle";
import styles from "./ImportProfileButton.module.css";

interface DuplicateMatch {
  index: number;
  existingId: number;
  displayName: string;
}

/** A parsed file waiting on the "already here" question. */
interface PendingImport {
  data: unknown;
  duplicates: DuplicateMatch[];
  total: number;
}

/**
 * Restore from an export file — one profile (Details tab → Export) or an
 * "Export all" bundle (Settings → Your data). Client-side JSON.parse gives a
 * friendlier error than the server for non-JSON files; everything else is
 * validated by POST /api/profiles/import. When the file holds profiles that
 * are already here, the server answers 409 and the user picks: skip them or
 * import copies. A bundle's settings block is applied here, in the browser,
 * since preferences never reach the server.
 */
export default function ImportProfileButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setDone(null);
    setPending(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setError("That file isn't valid JSON.");
      return;
    }
    await submit(data, null);
  }

  async function submit(data: unknown, duplicates: "skip" | "keep" | null) {
    setBusy(true);
    setPending(null);
    const query = duplicates ? `?duplicates=${duplicates}` : "";
    const res = await fetch(`/api/profiles/import${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 201 || res?.status === 200) {
      const body = (await res.json()) as {
        id?: number;
        ids?: number[];
        skipped?: number | boolean;
      };
      if (Array.isArray(body.ids)) {
        const settings = (data as { settings?: unknown }).settings;
        const applied =
          settings !== undefined && applySettingsBundle(settings);
        const n = body.ids.length;
        const skipped = typeof body.skipped === "number" ? body.skipped : 0;
        setDone(
          `Imported ${n} ${n === 1 ? "profile" : "profiles"}` +
            (skipped > 0 ? `, skipped ${skipped} already here` : "") +
            (applied ? " and applied the settings" : "") +
            ".",
        );
        router.push("/");
        router.refresh();
        return;
      }
      router.push(`/profiles/${body.id}`);
      router.refresh();
      return;
    }
    if (res?.status === 409) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; duplicates?: DuplicateMatch[]; total?: number }
        | null;
      if (body?.error === "duplicates" && body.duplicates) {
        setPending({ data, duplicates: body.duplicates, total: body.total ?? 1 });
        return;
      }
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

  const names = pending?.duplicates.map((d) => d.displayName) ?? [];
  const allHere = pending !== null && pending.duplicates.length === pending.total;

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
      {pending && (
        <span className={styles.prompt} role="alertdialog" aria-label="Profiles already here">
          <span>
            {names.length === 1
              ? `${names[0]} is already here.`
              : `${names.length} of these profiles are already here (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}).`}
          </span>
          <button className={styles.button} onClick={() => void submit(pending.data, "skip")}>
            {allHere ? (names.length === 1 ? "Open it" : "Skip them") : "Skip those"}
          </button>
          <button className={styles.button} onClick={() => void submit(pending.data, "keep")}>
            Import copies
          </button>
          <button className={styles.button} onClick={() => setPending(null)}>
            Cancel
          </button>
        </span>
      )}
    </span>
  );
}
