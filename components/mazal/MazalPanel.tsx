"use client";

import type { Sign } from "@astralsync/astro-core";
import type { ResolvedHebrewReading } from "@/lib/hebrewReading";
import type { HebrewView } from "@/lib/view-types";
import { toStoredHebrewGematria, toStoredMazal } from "@/lib/view-types";
import Markdown from "@/components/Markdown";
import { PLANET_GLYPH_CHARS, SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import { buildMazalSummary } from "./mazalSummary";
import styles from "./mazal.module.css";

/**
 * The Mazal tab: an English-chrome summary card over the stored Hebrew
 * snapshot, then the Hebrew reading sections rendered RTL. `hebrew` is null
 * only for historical versions computed before the feature — the latest
 * version is lazily backfilled on view (Phase 2b).
 */
export default function MazalPanel({
  hebrew,
  reading,
}: {
  hebrew: HebrewView | null;
  reading: ResolvedHebrewReading | null;
}) {
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
    </div>
  );
}
