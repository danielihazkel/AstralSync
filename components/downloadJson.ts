"use client";

import { sanitizeFileName, triggerDownload } from "@/components/chart/exportSvg";

/** Hand a JSON document to the browser as a file download. */
export function downloadJson(data: unknown, baseName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, `${sanitizeFileName(baseName)}.json`);
  } finally {
    // Delay revocation so the click's navigation can start.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
