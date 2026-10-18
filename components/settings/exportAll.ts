"use client";

import { downloadJson } from "@/components/downloadJson";
import { recordBackup } from "@/lib/backupReminder";
import { collectSettingsBundle } from "@/lib/settingsBundle";

/**
 * Download the whole-installation bundle (every profile, the pairs' data,
 * optionally this browser's settings) and note the backup for the
 * reminder. Shared by Settings → Your data and the home-page reminder.
 * Throws when the server cannot produce the export.
 */
export async function exportAllToFile(withSettings: boolean): Promise<void> {
  const res = await fetch("/api/profiles/export");
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const bundle = (await res.json()) as Record<string, unknown>;
  if (withSettings) bundle.settings = collectSettingsBundle();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(bundle, `astralsync-all-profiles-${stamp}`);
  recordBackup();
}
