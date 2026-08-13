"use client";

import { useState, type RefObject } from "react";
import { downloadPng, downloadSvg } from "./exportSvg";
import styles from "./chart.module.css";

/** "Download SVG / PNG" row for any wheel that exposes its <svg> via a ref. */
export default function DownloadChartButton({
  svgRef,
  baseName,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  baseName: string;
}) {
  const [error, setError] = useState<string | null>(null);

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

  return (
    <p className={styles.downloadRow}>
      <span className={styles.downloadLabel}>Download</span>
      <button className={styles.downloadButton} onClick={() => void handle("svg")}>
        SVG
      </button>
      <button className={styles.downloadButton} onClick={() => void handle("png")}>
        PNG
      </button>
      {error && <span className={styles.downloadError}>{error}</span>}
    </p>
  );
}
