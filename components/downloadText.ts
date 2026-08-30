"use client";

import { sanitizeFileName, triggerDownload } from "@/components/chart/exportSvg";

/** Hand any text document to the browser as a file download. */
export function downloadText(
  text: string,
  baseName: string,
  extension: string,
  mime: string,
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, `${sanitizeFileName(baseName)}.${extension}`);
  } finally {
    // Delay revocation so the click's navigation can start.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
