"use client";

import { useEffect, useRef, useState } from "react";
import type { MoonDayCell, MoonMonth } from "@/lib/skyCalendar";
import { SIGN_NAMES } from "@/components/format";
import DayPicker from "./DayPicker";
import MoonMonthGrid from "./MoonMonthGrid";
import styles from "./calendar.module.css";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayTitle(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The Sky Calendar: a month of Moon signs, phases, void-of-course windows
 * and eclipses, computed in-browser (lib/skyCalendar via dynamic import —
 * the Today-dashboard pattern) so it works offline. Months are memoized for
 * the session; a month costs up to ~1s of ephemeris work.
 */
export default function SkyCalendar() {
  const now = new Date();
  const [view, setView] = useState<"moon" | "picker">("moon");
  const [year, setYear] = useState(now.getFullYear());
  const [month1, setMonth1] = useState(now.getMonth() + 1);
  const [month, setMonth] = useState<MoonMonth | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const cache = useRef(new Map<string, MoonMonth>());

  useEffect(() => {
    let cancelled = false;
    const key = `${year}-${month1}`;
    const cached = cache.current.get(key);
    if (cached) {
      setMonth(cached);
      return;
    }
    setMonth(null);
    void (async () => {
      const { computeMoonMonth } = await import("@/lib/skyCalendar");
      const computed = computeMoonMonth(year, month1);
      cache.current.set(key, computed);
      if (!cancelled) setMonth(computed);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month1]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month1 - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth1(d.getMonth() + 1);
    setSelected(null);
  }

  const monthLabel = new Date(year, month1 - 1, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  const selectedCell =
    month?.days.find((d) => d.date === selected) ?? null;

  const viewSwitch = (
    <div
      className={styles.viewSwitch}
      role="tablist"
      aria-label="Calendar view"
    >
      <button
        role="tab"
        aria-selected={view === "moon"}
        onClick={() => setView("moon")}
      >
        Moon
      </button>
      <button
        role="tab"
        aria-selected={view === "picker"}
        onClick={() => setView("picker")}
      >
        Day picker
      </button>
    </div>
  );

  if (view === "picker") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <DayPicker />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {viewSwitch}
      <div className={styles.controls}>
        <span className={styles.monthLabel}>{monthLabel}</span>
        <span>
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>{" "}
          <button
            onClick={() => {
              setYear(now.getFullYear());
              setMonth1(now.getMonth() + 1);
              setSelected(null);
            }}
          >
            This month
          </button>{" "}
          <button onClick={() => shiftMonth(1)} aria-label="Next month">
            ›
          </button>
        </span>
      </div>

      {month === null ? (
        <p className={styles.muted}>Computing the month’s sky…</p>
      ) : (
        <>
          <MoonMonthGrid
            month={month}
            selected={selected}
            onSelect={(d) => setSelected(d === selected ? null : d)}
          />
          {selectedCell && <DayDetail cell={selectedCell} />}
          <p className={styles.muted}>
            Times are shown in your device’s timezone. “v/c” marks a
            void-of-course window: the Moon perfects no further major aspect
            before leaving its sign.
          </p>
        </>
      )}
    </div>
  );
}

function DayDetail({ cell }: { cell: MoonDayCell }) {
  return (
    <section className={styles.detail} aria-label={`Details for ${cell.date}`}>
      <h2 className={styles.detailTitle}>{dayTitle(cell.date)}</h2>
      <p>
        Moon in {SIGN_NAMES[cell.signAtNoon]} at noon,{" "}
        {Math.round(cell.illumination * 100)}% illuminated.
      </p>
      <ul className={styles.eventList}>
        {cell.quarter && (
          <li>
            <span className={styles.time}>{timeOf(cell.quarter.utc)}</span>{" "}
            {cell.quarter.name}
          </li>
        )}
        {cell.ingresses.map((i) => (
          <li key={i.utc}>
            <span className={styles.time}>{timeOf(i.utc)}</span> Moon enters{" "}
            {SIGN_NAMES[i.sign]}
          </li>
        ))}
        {cell.voc.map((w) => (
          <li key={w.untilUtc} className={styles.voc}>
            Void of course{" "}
            {new Date(w.fromUtc).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            →{" "}
            {new Date(w.untilUtc).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            (then {SIGN_NAMES[w.nextSign]})
          </li>
        ))}
        {cell.eclipses.map((e) => (
          <li key={e.peakUtc} className={styles.eclipse}>
            <span className={styles.time}>{timeOf(e.peakUtc)}</span>{" "}
            {e.type[0].toUpperCase() + e.type.slice(1)} {e.kind} eclipse at{" "}
            {Math.floor(e.degreeInSign)}° {SIGN_NAMES[e.sign]}
          </li>
        ))}
      </ul>
    </section>
  );
}
