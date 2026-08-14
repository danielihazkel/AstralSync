"use client";

import { useCallback, useEffect, useState } from "react";
import type { ElectionalDay, Intent, ScoredWindow } from "@/lib/electional";
import type { HomeLocation } from "@/lib/today";
import { loadHomeLocation } from "@/lib/homeLocation";
import { CLASSICAL_PLANET_LABELS, SIGN_NAMES } from "@/components/format";
import HomeLocationPicker from "@/components/settings/HomeLocationPicker";
import { buildIcs } from "@/lib/ics";
import { downloadIcs } from "@/components/downloadIcs";
import { electionalDayIcsEvents } from "./calendarIcsEvents";
import styles from "./calendar.module.css";

const INTENT_OPTIONS: Array<{ value: Intent; label: string }> = [
  { value: "communication", label: "Communication & contracts" },
  { value: "love", label: "Love & beauty" },
  { value: "action", label: "Action & courage" },
  { value: "growth", label: "Growth & fortune" },
  { value: "commitment", label: "Commitment & structure" },
  { value: "visibility", label: "Visibility & leadership" },
  { value: "home", label: "Home & family" },
];

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function timeRange(w: ScoredWindow): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(w.startUtc)}–${fmt(w.endUtc)}`;
}

const VERDICT_CLASS: Record<ScoredWindow["verdict"], string> = {
  good: styles.windowGood,
  mixed: styles.windowMixed,
  avoid: styles.windowAvoid,
};

/**
 * The Sky Calendar's "Day picker" view: rule-based electional windows for
 * one local day. With a home location the day splits into 24 planetary
 * hours; without one it scores the whole day. Every window lists its
 * factors — nothing is a black box.
 */
export default function DayPicker() {
  const [dateStr, setDateStr] = useState(todayStr());
  const [intent, setIntent] = useState<Intent | "">("");
  const [location, setLocation] = useState<HomeLocation | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<ElectionalDay | null>(null);

  useEffect(() => {
    setLocation(loadHomeLocation());
    setLoaded(true);
  }, []);

  const recompute = useCallback(async () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return;
    setResult(null);
    const { scoreDay } = await import("@/lib/electional");
    setResult(
      scoreDay({
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        location,
        intent: intent === "" ? null : intent,
      }),
    );
  }, [dateStr, intent, location]);

  useEffect(() => {
    if (!loaded) return;
    void recompute();
  }, [loaded, recompute]);

  return (
    <div className={styles.panel}>
      <div className={styles.locationRow}>
        <label>
          Day{" "}
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </label>
        <label>
          Intent{" "}
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as Intent | "")}
          >
            <option value="">Any</option>
            {INTENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {location ? (
          <span className={styles.muted}>
            Hours for {location.label}{" "}
            <button onClick={() => setPicking(true)}>Change</button>
          </span>
        ) : (
          <span className={styles.muted}>
            No home location — scoring the whole day.{" "}
            <button onClick={() => setPicking(true)}>Set location</button>
          </span>
        )}
      </div>

      {picking && (
        <HomeLocationPicker
          onPick={(loc) => {
            setLocation(loc);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      )}

      {result === null ? (
        <p className={styles.muted}>Scoring the day…</p>
      ) : (
        <>
          <p>
            Moon in {SIGN_NAMES[result.moonSign]} ·{" "}
            {CLASSICAL_PLANET_LABELS[result.dayRuler]} rules the day
            {result.mercuryRetrograde && " · Mercury retrograde"}{" "}
            <button
              onClick={() => {
                const label =
                  INTENT_OPTIONS.find((o) => o.value === intent)?.label ?? null;
                downloadIcs(
                  buildIcs(electionalDayIcsEvents(result, label), {
                    calName: `AstralSync electional — ${result.date}`,
                  }),
                  `astralsync-electional-${result.date}`,
                );
              }}
            >
              Export .ics
            </button>
          </p>
          <ul className={styles.windowList}>
            {result.windows.map((w) => (
              <li
                key={w.startUtc}
                className={`${styles.window} ${VERDICT_CLASS[w.verdict]}`}
              >
                <span>
                  <strong>{timeRange(w)}</strong>
                  {w.hourRuler && (
                    <>
                      {" "}
                      · {CLASSICAL_PLANET_LABELS[w.hourRuler]} hour
                      {w.isDay === false && " (night)"}
                    </>
                  )}{" "}
                  · {w.verdict}
                </span>
                {w.factors.length > 0 && (
                  <ul className={styles.factorList}>
                    {w.factors.map((f) => (
                      <li key={f.label}>
                        {f.label}
                        {f.score !== 0 &&
                          ` (${f.score > 0 ? "+" : ""}${f.score})`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            Rule-based, not a prediction: void-of-course Moon marks a window
            “avoid”; the Moon’s applying aspect, the planetary hour and day
            ruler for your intent, and Mercury retrograde do the rest. Moon
            sign is shown but never scored.
          </p>
        </>
      )}
    </div>
  );
}
