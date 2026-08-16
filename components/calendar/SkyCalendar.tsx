"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MoonDayCell, MoonMonth } from "@/lib/skyCalendar";
import { SIGN_NAMES } from "@/components/format";
import DayPicker from "./DayPicker";
import MoonMonthGrid from "./MoonMonthGrid";
import { useTabList } from "@/components/useTabList";
import { buildIcs } from "@/lib/ics";
import { downloadIcs } from "@/components/downloadIcs";
import { moonMonthIcsEvents } from "./calendarIcsEvents";
import { dayTitle, timeOf } from "./calendarFormat";
import styles from "./calendar.module.css";

const VIEWS = ["moon", "picker"] as const;

/** Run `work` when the main thread is idle; 200ms fallback where
 *  requestIdleCallback is unavailable (Safari). */
function scheduleIdle(work: () => void): { cancel: () => void } {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => work());
    return { cancel: () => cancelIdleCallback(id) };
  }
  const id = setTimeout(work, 200);
  return { cancel: () => clearTimeout(id) };
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

  useEffect(() => {
    let cancelled = false;
    const idleHandles: Array<{ cancel: () => void }> = [];
    void (async () => {
      // Memoized at module level in lib/skyCalendar — shared with the
      // almanac page, survives unmount.
      const { computeMoonMonthCached, peekMoonMonth } = await import(
        "@/lib/skyCalendar"
      );
      let computed = peekMoonMonth(year, month1);
      if (!computed) {
        // Show the indicator and let it actually paint before the ~1s
        // synchronous compute blocks the main thread. Cache hits skip
        // this entirely — no flash on revisits.
        setMonth(null);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled) return;
        computed = computeMoonMonthCached(year, month1);
      }
      if (cancelled) return;
      setMonth(computed);
      // Warm the neighbours in idle time — one idle slot each — so ‹ / ›
      // navigation lands on a cache hit.
      for (const delta of [-1, 1]) {
        const d = new Date(year, month1 - 1 + delta, 1);
        idleHandles.push(
          scheduleIdle(() =>
            computeMoonMonthCached(d.getFullYear(), d.getMonth() + 1),
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
      for (const h of idleHandles) h.cancel();
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

  const { getTabProps, getPanelProps } = useTabList({
    count: VIEWS.length,
    selected: VIEWS.indexOf(view),
    onSelect: (i) => setView(VIEWS[i]),
    idBase: "calendar-view",
  });
  const panelProps = getPanelProps(VIEWS.indexOf(view));
  const viewSwitch = (
    <div
      className={styles.viewSwitch}
      role="tablist"
      aria-label="Calendar view"
    >
      <button {...getTabProps(0)}>Moon</button>
      <button {...getTabProps(1)}>Day picker</button>
    </div>
  );

  if (view === "picker") {
    return (
      <div className={styles.panel}>
        {viewSwitch}
        <div {...panelProps} className={styles.tabPanel}>
          <DayPicker />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {viewSwitch}
      <div {...panelProps} className={styles.tabPanel}>
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
          </button>{" "}
          {month !== null && (
            <button
              onClick={() =>
                downloadIcs(
                  buildIcs(moonMonthIcsEvents(month), {
                    calName: `AstralSync sky — ${monthLabel}`,
                  }),
                  `astralsync-sky-${year}-${String(month1).padStart(2, "0")}`,
                )
              }
            >
              Export .ics
            </button>
          )}
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
      <Link href={`/calendar/${cell.date}`}>Full day view →</Link>
    </section>
  );
}
