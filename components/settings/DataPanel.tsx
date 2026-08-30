"use client";

import { useRef, useState } from "react";
import { downloadJson } from "@/components/downloadJson";
import ImportProfileButton from "@/components/profiles/ImportProfileButton";
import { applySettingsBundle, collectSettingsBundle } from "@/lib/settingsBundle";
import styles from "./settings.module.css";

/**
 * Settings → Your data: whole-installation export/import (every profile in
 * one file, optionally with this browser's preferences) and a settings-only
 * bundle for moving preferences between devices. Profile data comes from
 * the server; preferences never leave the browser except through these
 * files.
 */
export default function DataPanel() {
  const settingsInput = useRef<HTMLInputElement>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function exportAll() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profiles/export");
      if (!res.ok) throw new Error();
      const bundle = (await res.json()) as Record<string, unknown>;
      if (withSettings) bundle.settings = collectSettingsBundle();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(bundle, `astralsync-all-profiles-${stamp}`);
    } catch {
      setNotice("Export failed — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  function exportSettings() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(collectSettingsBundle(), `astralsync-settings-${stamp}`);
  }

  async function importSettings(file: File) {
    setNotice(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setNotice("That file isn't valid JSON.");
      return;
    }
    // Accept a bare settings bundle or the settings block of an "export
    // all" file.
    const candidate =
      typeof data === "object" && data !== null && "settings" in data
        ? (data as { settings: unknown }).settings
        : data;
    if (applySettingsBundle(candidate)) {
      setNotice("Settings applied — reload the page to see every change.");
    } else {
      setNotice("That doesn't look like an AstralSync settings file.");
    }
  }

  return (
    <div>
      <div className={styles.actions}>
        <button className={styles.reset} onClick={() => void exportAll()} disabled={busy}>
          {busy ? "Exporting…" : "Export all profiles"}
        </button>
        <label className={styles.check} style={{ flexBasis: "auto" }}>
          <input
            type="checkbox"
            checked={withSettings}
            onChange={(e) => setWithSettings(e.target.checked)}
          />{" "}
          include this browser&rsquo;s settings
        </label>
      </div>
      <div className={styles.actions}>
        <span className={styles.note} style={{ marginTop: 0 }}>
          Restore a profile or a whole export:
        </span>
        <ImportProfileButton />
      </div>
      <div className={styles.actions}>
        <button className={styles.reset} onClick={exportSettings}>
          Export settings only
        </button>
        <input
          ref={settingsInput}
          type="file"
          accept=".json,application/json"
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importSettings(file);
          }}
        />
        <button className={styles.reset} onClick={() => settingsInput.current?.click()}>
          Import settings
        </button>
      </div>
      {notice && (
        <p className={styles.note} role="status">
          {notice}
        </p>
      )}
      <p className={styles.note}>
        Every profile export holds every chart version, reading and note —
        nothing held back. Settings (theme, orbs, home location, chart
        preferences) live in this browser only and travel through these
        files.
      </p>
    </div>
  );
}
