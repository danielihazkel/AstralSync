"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { JournalMood } from "@/lib/journalMeta";
import { JOURNAL_MOODS } from "@/lib/journalMeta";
import {
  filterTimeline,
  timelineTags,
  type TimelineEntryData,
} from "@/lib/journalTimeline";
import Markdown from "@/components/Markdown";
import { MOOD_LABELS } from "./moodLabels";
import styles from "./journal.module.css";

/**
 * The global journal timeline: every profile's notes in one chronological
 * stream, filtered client-side (free text, mood, tag, profile). Read-only —
 * editing stays on each profile's Journal tab, one link away.
 */
export default function JournalTimeline({
  entries,
}: {
  entries: TimelineEntryData[];
}) {
  const [q, setQ] = useState("");
  const [mood, setMood] = useState<JournalMood | "">("");
  const [tag, setTag] = useState("");
  const [profileId, setProfileId] = useState<number | "">("");

  const profiles = useMemo(() => {
    const seen = new Map<number, string>();
    for (const e of entries) {
      if (!seen.has(e.profileId)) seen.set(e.profileId, e.displayName);
    }
    return [...seen.entries()].map(([id, displayName]) => ({
      id,
      displayName,
    }));
  }, [entries]);
  const tags = useMemo(() => timelineTags(entries), [entries]);
  const filtered = useMemo(
    () => filterTimeline(entries, { q, mood, tag, profileId }),
    [entries, q, mood, tag, profileId],
  );

  if (entries.length === 0) {
    return (
      <p className={styles.muted}>
        No journal entries yet — notes live on each profile&rsquo;s Journal
        tab.
      </p>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.addForm} role="search" aria-label="Filter entries">
        <input
          type="search"
          placeholder="Search notes and tags…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search text"
        />
        {profiles.length > 1 && (
          <select
            value={profileId}
            onChange={(e) =>
              setProfileId(e.target.value === "" ? "" : Number(e.target.value))
            }
            aria-label="Profile"
          >
            <option value="">All profiles</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        )}
        <select
          value={mood}
          onChange={(e) => setMood(e.target.value as JournalMood | "")}
          aria-label="Mood"
        >
          <option value="">Any mood</option>
          {JOURNAL_MOODS.map((m) => (
            <option key={m} value={m}>
              {MOOD_LABELS[m]}
            </option>
          ))}
        </select>
        {tags.length > 0 && (
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            aria-label="Tag"
          >
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.muted}>No entries match these filters.</p>
      ) : (
        <>
          <p className={styles.muted}>
            {filtered.length} of {entries.length} entries
          </p>
          <ul className={styles.entryList}>
            {filtered.map((e) => (
              <li key={e.id} className={styles.entry}>
                <div className={styles.entryHeader}>
                  <span className={styles.entryDate}>
                    {new Date(`${e.entryDate}T12:00:00Z`).toLocaleDateString(
                      undefined,
                      { dateStyle: "medium" },
                    )}
                  </span>
                  <Link href={`/profiles/${e.profileId}?tab=Journal`}>
                    {e.displayName}
                  </Link>
                </div>
                {(e.mood !== null || e.tags.length > 0) && (
                  <ul className={styles.skyChips}>
                    {e.mood !== null && (
                      <li className={styles.moodChip}>
                        Mood: {MOOD_LABELS[e.mood]}
                      </li>
                    )}
                    {e.tags.map((t) => (
                      <li key={t} className={styles.tagChip}>
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
                <div className={styles.entryBody}>
                  <Markdown md={e.bodyMd} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
