"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Sign } from "@astralsync/astro-core";
import type { ResolvedHebrewReading } from "@/lib/hebrewReading";
import type { HebrewView } from "@/lib/view-types";
import { toStoredHebrewGematria, toStoredMazal } from "@/lib/view-types";
import Markdown from "@/components/Markdown";
import { useStreamedGeneration } from "@/components/useStreamedGeneration";
import DiscardReadingButton from "@/components/profile/DiscardReadingButton";
import { PLANET_GLYPH_CHARS, SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import { buildMazalSummary } from "./mazalSummary";
import styles from "./mazal.module.css";

function dateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * The Mazal tab: an English-chrome summary card over the stored Hebrew
 * snapshot, then the Hebrew reading sections rendered RTL, then the stored
 * AI synthesis (or its once-only generate button — same UX contract as the
 * Reading tab). `hebrew` is null only for historical versions computed
 * before the feature — the latest version is lazily backfilled on view.
 */
export default function MazalPanel({
  hebrew,
  reading,
  profileId,
  version,
  llmEnabled,
}: {
  hebrew: HebrewView | null;
  reading: ResolvedHebrewReading | null;
  profileId: number;
  version: number;
  llmEnabled: boolean;
}) {
  const router = useRouter();
  const [genError, setGenError] = useState<string | null>(null);
  const { busy, streamText, generate: streamGenerate, reset } = useStreamedGeneration();
  const llmReading = hebrew?.llmReading ?? null;

  // Once the stored reading arrives (post-refresh), drop the live preview so
  // a later discard doesn't resurrect stale text.
  useEffect(() => {
    if (llmReading) reset();
  }, [llmReading, reset]);

  async function generate() {
    setGenError(null);
    const result = await streamGenerate(
      `/api/profiles/${profileId}/hebrew-reading?stream=1`,
      { version },
    );
    if (result.ok || result.status === 409 || result.errorCode === "already_generated") {
      // 409 ⇒ generated concurrently or hook toggled — refresh shows reality.
      router.refresh();
      return;
    }
    reset();
    setGenError(
      result.status === 502 || result.errorCode === "llm_unavailable"
        ? "The language model isn't reachable right now. Your chart and readings are unaffected — try again once it's running."
        : "Could not generate the reading.",
    );
  }
  if (hebrew === null || reading === null) {
    return (
      <p className={styles.notice}>
        The Hebrew chart was not computed for this snapshot version — it
        predates the Mazal feature. The current version has one; older
        versions stay exactly as they were computed.
      </p>
    );
  }

  const mazal = toStoredMazal(hebrew);
  const gematria = toStoredHebrewGematria(hebrew);
  const summary = buildMazalSummary(mazal, gematria);

  // Unicode glyphs with the text-presentation selector, same as the wheel.
  const signGlyph = SIGN_GLYPH_CHARS[summary.sign as Sign] ?? "";

  return (
    <div className={styles.panel}>
      <section className={styles.summaryCard} aria-label="Mazal summary">
        <dl className={styles.summaryGrid}>
          <dt>Hebrew date</dt>
          <dd>
            <span className={styles.hebrewDate} lang="he">
              {summary.dateDisplay}
            </span>
            {summary.afterSunset && (
              <span className={styles.muted}>
                born after sunset — the Hebrew day had already begun
                {summary.alternateDate && (
                  <>
                    {" "}
                    (daytime would have been{" "}
                    <span lang="he">{summary.alternateDate}</span>)
                  </>
                )}
              </span>
            )}
          </dd>

          <dt>Month mazal</dt>
          <dd>
            <span className={styles.glyph} aria-hidden="true">
              {signGlyph + "︎"}
            </span>
            {summary.monthLabel}
          </dd>

          <dt>Day planet</dt>
          <dd>
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[summary.dayPlanet] + "︎"}
            </span>
            {summary.dayPlanetLabel}
          </dd>

          <dt>Hour planet</dt>
          <dd>
            {summary.hourPlanet !== null && summary.hourLabel !== null ? (
              <>
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[summary.hourPlanet] + "︎"}
                </span>
                {summary.hourLabel}
              </>
            ) : (
              <span className={styles.muted}>
                not computed — see the notes below
              </span>
            )}
          </dd>

          <dt>Sefer Yetzirah</dt>
          <dd>
            <span className={styles.hebrewDate} lang="he" aria-hidden="true">
              {mazal.seferYetzirah.letter}
            </span>
            {summary.seferLabel}
          </dd>

          <dt>Date number</dt>
          <dd>
            {summary.dateGematria.value}
            {summary.dateGematria.isMaster && (
              <span className={styles.masterBadge}>master number</span>
            )}
          </dd>
        </dl>
      </section>

      {summary.chips.length > 0 && (
        <div className={styles.chipRow} aria-label="Uncertainty notes">
          {summary.chips.map((u) => (
            <span key={u.field} className={styles.chip} title={u.reason} tabIndex={0}>
              {u.field.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {reading.stale && (
        <p className={styles.notice}>
          {reading.snapshotContentVersion === "0"
            ? "This snapshot predates the Hebrew content library; the sections below use the current library."
            : `This snapshot was computed under content library v${reading.snapshotContentVersion}; the sections below use the current library (v${reading.contentVersion}).`}
        </p>
      )}

      {reading.sections.map((section) => (
        <section
          key={section.slot}
          className={styles.hebrewSection}
          lang="he"
          dir={reading.dir}
          aria-label={section.title}
        >
          <h3 className={styles.hebrewTitle}>{section.title}</h3>
          <p className={styles.hebrewSource}>{section.source}</p>
          <div className={styles.hebrewBody}>
            <Markdown md={section.bodyMd} />
          </div>
        </section>
      ))}

      {hebrew.llmReading ? (
        <section className={styles.hebrewSection} aria-label="AI synthesis">
          <h3 className={styles.hebrewTitle}>AI synthesis</h3>
          <p className={styles.hebrewSource}>
            Generated once by {hebrew.llmReading.modelName ?? "a local model"}{" "}
            on {dateOnly(hebrew.llmReading.createdAt)} — stored with this
            snapshot.
          </p>
          {/* Stored readings are never regenerated: ones from before the
              English-prompt switch stay Hebrew, so pick lang/dir per body. */}
          <div
            className={styles.hebrewBody}
            lang={/[֐-׿]/.test(hebrew.llmReading.bodyMd) ? "he" : "en"}
            dir={/[֐-׿]/.test(hebrew.llmReading.bodyMd) ? "rtl" : "ltr"}
          >
            <Markdown md={hebrew.llmReading.bodyMd} />
          </div>
          <div className={styles.actionRow}>
            <DiscardReadingButton
              endpoint={`/api/profiles/${profileId}/hebrew-reading?version=${version}`}
            />
          </div>
        </section>
      ) : (
        <>
          {streamText !== null && (
            <section
              className={styles.hebrewSection}
              aria-label="AI synthesis (generating)"
            >
              <h3 className={styles.hebrewTitle}>AI synthesis</h3>
              <p className={styles.hebrewSource}>
                {busy ? "Generating…" : "Finishing up…"}
              </p>
              <div className={styles.hebrewBody} lang="en" dir="ltr" aria-live="polite">
                <Markdown md={streamText} />
              </div>
            </section>
          )}
          {llmEnabled && (
            <div className={styles.actionRow}>
              <button onClick={generate} disabled={busy}>
                {busy ? "Generating…" : "Generate AI reading"}
              </button>
              <span className={styles.muted}>
                {" "}
                Written in English. Runs once for this chart version and is
                stored permanently.
              </span>
              {genError && <p className={styles.error}>{genError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
