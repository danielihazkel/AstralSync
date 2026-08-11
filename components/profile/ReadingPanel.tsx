"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ResolvedReading } from "@/lib/content";
import type { AstroView } from "@/lib/view-types";
import Markdown from "@/components/Markdown";
import { ELEMENTS } from "@/lib/dominance";
import styles from "./profile.module.css";

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function dateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * The Reading tab: template-resolved interpretation sections (rendered live
 * from the content library) plus the stored LLM synthesis, if any. The
 * generate button only appears when the READING_LLM hook is configured.
 */
export default function ReadingPanel({
  reading,
  llmReading,
  profileId,
  version,
  isSolarChart,
  llmEnabled,
}: {
  reading: ResolvedReading;
  llmReading: AstroView["llmReading"];
  profileId: number;
  version: number;
  isSolarChart: boolean;
  llmEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/profiles/${profileId}/reading`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok || res?.status === 409) {
      // 409 ⇒ generated concurrently or hook toggled — refresh shows reality.
      router.refresh();
      return;
    }
    setError(
      res?.status === 502
        ? "The language model isn't reachable right now. Your chart and readings are unaffected — try again once it's running."
        : "Could not generate the reading.",
    );
  }

  const { dominance } = reading;

  return (
    <div className={styles.reading}>
      {reading.stale && (
        <p className={styles.staleNote}>
          {reading.snapshotContentVersion === "0"
            ? "This chart version was computed before the interpretation library existed; the readings below use the current library."
            : `This chart version was computed under content library v${reading.snapshotContentVersion}; the readings below use the current library (v${reading.contentVersion}).`}
        </p>
      )}

      {isSolarChart && (
        <p className={styles.staleNote}>
          Birth time unknown — this is a solar chart, so there is no rising
          sign reading and no house placements.
        </p>
      )}

      <div className={styles.chipRow} aria-label="Element distribution">
        {ELEMENTS.map((e) => (
          <span
            key={e}
            className={e === dominance.dominant ? styles.chipActive : styles.chip}
          >
            {cap(e)} {dominance.counts[e]}
          </span>
        ))}
        {dominance.tied.length > 1 && (
          <span className={styles.hint}>
            {dominance.tied.map(cap).join(" and ")} are tied —{" "}
            {cap(dominance.dominant)} leads via your Sun, Moon, or element
            order.
          </span>
        )}
      </div>

      {reading.sections.map((section) => (
        <section
          key={section.slot}
          className={styles.readingSection}
          aria-label={section.title}
        >
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          <p className={styles.readingSource}>{section.source}</p>
          <div className={styles.readingBody}>
            <Markdown md={section.bodyMd} />
          </div>
        </section>
      ))}

      {llmReading ? (
        <section className={styles.readingSection} aria-label="AI synthesis">
          <h3 className={styles.sectionTitle}>AI synthesis</h3>
          <p className={styles.readingSource}>
            Generated once by {llmReading.modelName ?? "a local model"} on{" "}
            {dateOnly(llmReading.createdAt)} — stored with this snapshot.
          </p>
          <div className={styles.readingBody}>
            <Markdown md={llmReading.bodyMd} />
          </div>
        </section>
      ) : (
        llmEnabled && (
          <div className={styles.actionRow}>
            <button onClick={generate} disabled={busy}>
              {busy ? "Generating…" : "Generate AI reading"}
            </button>
            <span className={styles.hint}>
              {" "}
              Runs once for this chart version and is stored permanently.
            </span>
            {error && <p className={styles.selectorError}>{error}</p>}
          </div>
        )
      )}
    </div>
  );
}
