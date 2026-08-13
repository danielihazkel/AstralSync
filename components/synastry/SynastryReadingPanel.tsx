"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { StoredSynastryReading } from "@/lib/synastry";
import Markdown from "@/components/Markdown";
import { useStreamedGeneration } from "@/components/useStreamedGeneration";
import DiscardReadingButton from "@/components/profile/DiscardReadingButton";
import profileStyles from "@/components/profile/profile.module.css";
import styles from "./synastry.module.css";

function dateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * The AI synastry/composite reading at the bottom of the pair page —
 * ReadingPanel's shape with Forecast semantics: one cached slot per pair,
 * streamed on generation, discard to regenerate. A stale note appears when
 * either chart gained a version since the reading was generated.
 */
export default function SynastryReadingPanel({
  a,
  b,
  reading,
  stale,
  llmEnabled,
}: {
  a: number;
  b: number;
  reading: (Omit<StoredSynastryReading, "createdAt"> & {
    createdAt: Date | string;
  }) | null;
  stale: boolean;
  llmEnabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { busy, streamText, generate: streamGenerate, reset } = useStreamedGeneration();

  // Once the stored reading arrives (post-refresh), drop the live preview so
  // a later discard doesn't resurrect stale text.
  useEffect(() => {
    if (reading) reset();
  }, [reading, reset]);

  async function generate() {
    setError(null);
    const result = await streamGenerate(
      `/api/synastry/reading?a=${a}&b=${b}&stream=1`,
      {},
    );
    if (result.ok || result.status === 409 || result.errorCode === "already_generated") {
      router.refresh();
      return;
    }
    reset();
    setError(
      result.status === 502 || result.errorCode === "llm_unavailable"
        ? "The language model isn't reachable right now — try again once it's running."
        : "Could not generate the reading.",
    );
  }

  if (!llmEnabled && !reading) return null;

  return (
    <section aria-label="AI relationship reading">
      <h2 className={styles.sectionTitle}>AI relationship reading</h2>
      {reading ? (
        <>
          <p className={profileStyles.readingSource}>
            Generated once by {reading.modelName ?? "a local model"} on{" "}
            {dateOnly(reading.createdAt)} — stored for this pair.
          </p>
          {stale && (
            <p className={profileStyles.staleNote}>
              One of these charts has changed since this reading was generated
              — discard and regenerate to reflect the current versions.
            </p>
          )}
          <div className={profileStyles.readingBody}>
            <Markdown md={reading.bodyMd} />
          </div>
          <div className={profileStyles.actionRow}>
            <DiscardReadingButton
              endpoint={`/api/synastry/reading?a=${a}&b=${b}`}
            />
          </div>
        </>
      ) : (
        <>
          {streamText !== null && (
            <div className={profileStyles.readingBody} aria-live="polite">
              <Markdown md={streamText} />
            </div>
          )}
          <div className={profileStyles.actionRow}>
            <button onClick={generate} disabled={busy}>
              {busy ? "Generating…" : "Generate AI relationship reading"}
            </button>
            <span className={profileStyles.hint}>
              {" "}
              Stored for this pair until you discard it.
            </span>
            {error && <p className={profileStyles.selectorError}>{error}</p>}
          </div>
        </>
      )}
    </section>
  );
}
