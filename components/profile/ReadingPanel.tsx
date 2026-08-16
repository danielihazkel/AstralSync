"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReadingSlot, ResolvedReading } from "@/lib/content";
import type { AstroView } from "@/lib/view-types";
import Markdown from "@/components/Markdown";
import { useStreamedGeneration } from "@/components/useStreamedGeneration";
import ChatPanel from "./ChatPanel";
import DiscardReadingButton from "./DiscardReadingButton";
import { ELEMENTS, MODALITIES } from "@/lib/dominance";
import styles from "./profile.module.css";

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function dateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** Group heading per slot; null renders ungrouped (synthesis stands alone). */
const SLOT_GROUP: Record<ReadingSlot, string | null> = {
  sun: "Placements",
  moon: "Placements",
  ascendant: "Placements",
  mc: "Placements",
  mercury: "Placements",
  venus: "Placements",
  mars: "Placements",
  jupiter: "Placements",
  saturn: "Placements",
  uranus: "Generational backdrop",
  neptune: "Generational backdrop",
  pluto: "Generational backdrop",
  element: "Chart balance",
  modality: "Chart balance",
  chart_pattern: "Chart patterns",
  aspect: "Key aspects",
  retrograde: "Retrogrades",
  house: "Houses",
  point: "Points",
  life_path: "Numerology",
  destiny: "Numerology",
  soul_urge: "Numerology",
  synthesis: null,
};

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
  const [error, setError] = useState<string | null>(null);
  const { busy, streamText, generate: streamGenerate, reset } = useStreamedGeneration();

  // Once the stored reading arrives (post-refresh), drop the live preview so
  // a later discard doesn't resurrect stale text.
  useEffect(() => {
    if (llmReading) reset();
  }, [llmReading, reset]);

  async function generate() {
    setError(null);
    const result = await streamGenerate(
      `/api/profiles/${profileId}/reading?stream=1`,
      { version },
    );
    if (result.ok || result.status === 409 || result.errorCode === "already_generated") {
      // 409 ⇒ generated concurrently or hook toggled — refresh shows reality.
      router.refresh();
      return;
    }
    reset();
    setError(
      result.status === 502 || result.errorCode === "llm_unavailable"
        ? "The language model isn't reachable right now. Your chart and readings are unaffected — try again once it's running."
        : "Could not generate the reading.",
    );
  }

  const { dominance, modality } = reading;

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

      <div className={styles.chipRow} aria-label="Modality distribution">
        {MODALITIES.map((m) => (
          <span
            key={m}
            className={m === modality.dominant ? styles.chipActive : styles.chip}
          >
            {cap(m)} {modality.counts[m]}
          </span>
        ))}
        {modality.tied.length > 1 && (
          <span className={styles.hint}>
            {modality.tied.map(cap).join(" and ")} are tied —{" "}
            {cap(modality.dominant)} leads via your Sun, Moon, or modality
            order.
          </span>
        )}
      </div>

      {reading.sections.map((section, i) => {
        const group = SLOT_GROUP[section.slot];
        const prevGroup = i > 0 ? SLOT_GROUP[reading.sections[i - 1].slot] : null;
        // Index-qualified key: the same entry can legitimately repeat (two
        // stelliums both resolve chart_pattern/stellium).
        return (
          <div key={`${section.key ?? section.slot}-${i}`} className={styles.reading}>
            {group !== null && group !== prevGroup && (
              <h2 className={styles.readingGroup}>{group}</h2>
            )}
            <section
              className={styles.readingSection}
              aria-label={section.title}
            >
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <p className={styles.readingSource}>{section.source}</p>
              <div className={styles.readingBody}>
                <Markdown md={section.bodyMd} />
              </div>
            </section>
          </div>
        );
      })}

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
          <div className={styles.actionRow}>
            <DiscardReadingButton
              endpoint={`/api/profiles/${profileId}/reading?version=${version}`}
            />
          </div>
          {llmEnabled && <ChatPanel profileId={profileId} />}
        </section>
      ) : (
        <>
          {streamText !== null && (
            <section
              className={styles.readingSection}
              aria-label="AI synthesis (generating)"
            >
              <h3 className={styles.sectionTitle}>AI synthesis</h3>
              <p className={styles.readingSource}>
                {busy ? "Generating…" : "Finishing up…"}
              </p>
              <div className={styles.readingBody} aria-live="polite">
                <Markdown md={streamText} />
              </div>
            </section>
          )}
          {llmEnabled && (
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
          )}
        </>
      )}
    </div>
  );
}
