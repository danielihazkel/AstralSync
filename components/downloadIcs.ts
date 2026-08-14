"use client";

import { sanitizeFileName, triggerDownload } from "@/components/chart/exportSvg";

/** Hand a built .ics text to the browser as a file download. */
export function downloadIcs(ics: string, baseName: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, `${sanitizeFileName(baseName)}.ics`);
  } finally {
    // Delay revocation so the click's navigation can start.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
