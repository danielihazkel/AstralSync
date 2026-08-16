"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Planet, Sign } from "@astralsync/astro-core";
import { PLANET_NAMES, SIGN_NAMES } from "@/components/format";
import type { EntrySky } from "@/lib/journal";
import {
  MIN_BASELINE_DAYS,
  MIN_ENTRIES,
  computeInsights,
  featuresFromEntrySky,
  formatShare,
  highlights,
  tagCounts,
  type BaselineDay,
  type CategoryStat,
  type InsightEntry,
  type MoodSlice,
} from "@/lib/journalInsights";
import type { JournalMood } from "@/lib/journalMeta";
import type { WheelChart } from "@/lib/view-types";
import { todayLocalDate } from "./journalDate";
import { MOOD_LABELS } from "./moodLabels";
import styles from "./journal.module.css";

/** The slice of a loaded entry the Insights view needs. */
export interface InsightsEntryInput {
  entryDate: string;
  mood: JournalMood | null;
  tags: string[];
  sky: EntrySky | null;
}

type BaselineState =
  | { kind: "sampling"; done: number; total: number }
  | { kind: "data"; days: BaselineDay[] };

const ELEMENT_LABELS: Record<string, string> = {
  fire: "Fire",
  earth: "Earth",
  air: "Air",
  water: "Water",
};

/**
 * Journal↔sky correlations: entry distributions against a baseline sampled
 * from every day the journal spans (lib/journalBaseline behind a dynamic
 * import — the ephemeris loads only when this view opens). The statistics
 * themselves are pure (lib/journalInsights).
 */
export default function InsightsView({
  entries,
  chart,
}: {
  entries: InsightsEntryInput[];
  chart: WheelChart;
}) {
  const [baseline, setBaseline] = useState<BaselineState>({
    kind: "sampling",
    done: 0,
    total: 0,
  });
  const [tag, setTag] = useState("");
  // Baselines are a property of the span — memoized across tag slicing and
  // re-renders; resampled only when the span itself changes.
  const cache = useRef(new Map<string, BaselineDay[]>());

  const insightEntries = useMemo<InsightEntry[]>(
    () =>
      entries.map((e) => ({
        entryDate: e.entryDate,
        mood: e.mood,
        tags: e.tags,
        features: e.sky ? featuresFromEntrySky(e.sky) : null,
      })),
    [entries],
  );

  const today = todayLocalDate();
  const from = useMemo(
    () =>
      entries.reduce(
        (min, e) => (e.entryDate < min ? e.entryDate : min),
        today,
      ),
    [entries, today],
  );

  useEffect(() => {
    let cancelled = false;
    const key = `${from}:${today}`;
    const cached = cache.current.get(key);
    if (cached) {
      setBaseline({ kind: "data", days: cached });
      return;
    }
    setBaseline({ kind: "sampling", done: 0, total: 0 });
    void (async () => {
      const { sampleBaseline } = await import("@/lib/journalBaseline");
      const days = await sampleBaseline(
        from,
        today,
        chart.placements,
        (done, total) => {
          if (!cancelled) setBaseline({ kind: "sampling", done, total });
        },
      );
      cache.current.set(key, days);
      if (!cancelled) setBaseline({ kind: "data", days });
    })();
    return () => {
      cancelled = true;
    };
    // chart.placements is stable for a mounted profile page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, today]);

  const sliced = useMemo(
    () =>
      tag === ""
        ? insightEntries
        : insightEntries.filter((e) => e.tags.includes(tag)),
    [insightEntries, tag],
  );

  const tags = useMemo(() => tagCounts(insightEntries), [insightEntries]);

  if (entries.length === 0) {
    return (
      <p className={styles.muted}>
        No notes yet — Insights needs a journal to correlate. Write a few
        notes in the Notes view first.
      </p>
    );
  }

  if (baseline.kind === "sampling") {
    return (
      <p className={styles.muted} role="status">
        Sampling the sky for every day your journal covers
        {baseline.total > 0
          ? ` (${baseline.done} of ${baseline.total} days)…`
          : "…"}
      </p>
    );
  }

  const report = computeInsights(sliced, baseline.days);
  const heads = highlights(report);
  const skylessCount = report.totalEntries - report.entriesWithSky;

  return (
    <div className={styles.panel}>
      {report.entriesWithSky < MIN_ENTRIES && (
        <p className={styles.notice}>
          Keep journaling — patterns need at least {MIN_ENTRIES} notes with a
          stored sky before differences from the baseline mean much
          {tag !== "" ? " (this tag has fewer)" : ""}.
        </p>
      )}

      {tags.length > 0 && (
        <div className={styles.dateRow}>
          <label htmlFor="insights-tag" className={styles.muted}>
            Slice by tag
          </label>
          <select
            id="insights-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">All notes</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                #{t.tag} ({t.count})
              </option>
            ))}
          </select>
        </div>
      )}

      {heads.length > 0 && (
        <section aria-label="Highlights">
          <h3 className={styles.sectionTitle}>Highlights</h3>
          <ul className={styles.entryList}>
            {heads.map((h) => (
              <li key={h.text} className={styles.skyChip}>
                {h.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <StatSection
        title="Moon sign on note days"
        stats={report.moonSign}
        label={(k) => SIGN_NAMES[k as Sign]}
      />
      <StatSection
        title="Moon element"
        stats={report.moonElement}
        label={(k) => ELEMENT_LABELS[k] ?? k}
      />
      <StatSection
        title="Moon phase"
        stats={report.phase}
        label={(k) => k}
      />
      <StatSection
        title="Retrogrades in effect"
        stats={report.retrograde}
        label={(k) => `${PLANET_NAMES[k as Planet]} retrograde`}
      />
      <StatSection
        title="Transits touching your chart"
        stats={report.aspectPlanet}
        label={(k) => PLANET_NAMES[k as Planet]}
      />

      <section aria-label="Mood">
        <h3 className={styles.sectionTitle}>Mood</h3>
        {report.moodAverage === null ? (
          <p className={styles.muted}>
            No moods recorded yet — set a mood when adding a note to see how
            it moves with the sky.
          </p>
        ) : (
          <>
            <p>
              Average mood {report.moodAverage.toFixed(1)} of 5 across{" "}
              {report.moodCounts.reduce((n, m) => n + m.count, 0)} rated notes
              (
              {report.moodCounts
                .filter((m) => m.count > 0)
                .map((m) => `${MOOD_LABELS[m.mood]} ×${m.count}`)
                .join(", ")}
              ).
            </p>
            <MoodSlices
              title="By Moon element"
              slices={report.moodByElement}
              label={(k) => ELEMENT_LABELS[k] ?? k}
            />
            <MoodSlices
              title="By Moon phase"
              slices={report.moodByPhase}
              label={(k) => k}
            />
          </>
        )}
      </section>

      <p className={styles.muted}>
        Baseline: the sky at local noon of each of the {report.baselineDays}{" "}
        days from {from} to {today}, at the same orbs as the stored skies.
        {skylessCount > 0 &&
          ` ${skylessCount} note${skylessCount === 1 ? "" : "s"} without a stored sky ${skylessCount === 1 ? "is" : "are"} excluded from the sky distributions.`}{" "}
        Baseline aspects use the current chart; each note&rsquo;s stored
        aspects used the chart version active when it was saved.
        {report.baselineDays < MIN_BASELINE_DAYS &&
          " The span is still short — highlights appear once it covers at least a month."}
      </p>
    </div>
  );
}

function StatSection({
  title,
  stats,
  label,
}: {
  title: string;
  stats: CategoryStat[];
  label: (key: string) => string;
}) {
  if (stats.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <ul className={styles.statList}>
        {stats.map((s) => (
          <li key={s.key} className={styles.statRow}>
            <span>{label(s.key)}</span>
            <span className={styles.statBars} aria-hidden="true">
              <span
                className={styles.statBarEntry}
                style={{ width: `${Math.round(s.entryShare * 100)}%` }}
              />
              <span
                className={styles.statBarBase}
                style={{ width: `${Math.round(s.baselineShare * 100)}%` }}
              />
            </span>
            <span className={styles.statNums}>
              {formatShare(s.entryShare)} vs {formatShare(s.baselineShare)} ·{" "}
              {s.entryCount} note{s.entryCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MoodSlices({
  title,
  slices,
  label,
}: {
  title: string;
  slices: MoodSlice[];
  label: (key: string) => string;
}) {
  if (slices.length === 0) return null;
  return (
    <>
      <h4 className={styles.subTitle}>{title}</h4>
      <ul className={styles.skyChips}>
        {slices.map((s) => (
          <li key={s.key} className={styles.skyChip}>
            {label(s.key)}: {s.avgMood.toFixed(1)}{" "}
            <span className={styles.muted}>({s.count} notes)</span>
          </li>
        ))}
      </ul>
    </>
  );
}
