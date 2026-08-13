"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  downloadPng,
  downloadSvg,
  pngBlob,
  sanitizeFileName,
} from "./exportSvg";
import styles from "./chart.module.css";

function shareFileName(baseName: string): string {
  return `${sanitizeFileName(baseName)}.png`;
}

/** "Download SVG / PNG" row for any wheel that exposes its <svg> via a ref.
 *  A Share button appears only where the Web Share API accepts files
 *  (Android/iOS and some desktop browsers). */
export default function DownloadChartButton({
  svgRef,
  baseName,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  baseName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    try {
      const probe = new File([""], "chart.png", { type: "image/png" });
      setCanShare(
        typeof navigator.share === "function" &&
          navigator.canShare?.({ files: [probe] }) === true,
      );
    } catch {
      // File constructor or canShare unavailable — keep the button hidden.
    }
  }, []);

  async function handle(kind: "svg" | "png") {
    const svg = svgRef.current;
    if (!svg) return;
    setError(null);
    try {
      if (kind === "svg") downloadSvg(svg, baseName);
      else await downloadPng(svg, baseName);
    } catch {
      setError("Download failed — try the other format.");
    }
  }

  async function share() {
    const svg = svgRef.current;
    if (!svg) return;
    setError(null);
    try {
      const blob = await pngBlob(svg);
      const file = new File([blob], shareFileName(baseName), {
        type: "image/png",
      });
      await navigator.share({ files: [file], title: baseName });
    } catch (e) {
      // Closing the share sheet rejects with AbortError — not an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Sharing failed — download the PNG instead.");
    }
  }

  return (
    <p className={styles.downloadRow}>
      <span className={styles.downloadLabel}>Download</span>
      <button className={styles.downloadButton} onClick={() => void handle("svg")}>
        SVG
      </button>
      <button className={styles.downloadButton} onClick={() => void handle("png")}>
        PNG
      </button>
      {canShare && (
        <button className={styles.downloadButton} onClick={() => void share()}>
          Share
        </button>
      )}
      {error && <span className={styles.downloadError}>{error}</span>}
    </p>
  );
}
