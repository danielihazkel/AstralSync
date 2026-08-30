"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SIGNS } from "@astralsync/astro-core";
import type {
  TransitCalendarData,
  TransitCalendarEvent,
} from "@/lib/transitCalendar";
import { loadOrbSettings } from "@/lib/orbSettings";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import { buildIcs } from "@/lib/ics";
import { downloadIcs } from "@/components/downloadIcs";
import { transitMonthIcsEvents } from "./transitIcsEvents";
import styles from "./transits.module.css";

type State =
  | { kind: "loading" }
  | { kind: "data"; data: TransitCalendarData }
  | { kind: "offline" }
  | { kind: "error" };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthRange(year: number, month0: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month0 + 1)}-01`,
    to: `${year}-${pad(month0 + 1)}-${pad(last)}`,
  };
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventLine(e: TransitCalendarEvent): React.ReactNode {
  switch (e.kind) {
    case "aspect":
      return (
        <>
          <span className={styles.glyph} aria-hidden="true">
            {PLANET_GLYPH_CHARS[e.a]}
          </span>
          {PLANET_NAMES[e.a]}
          {e.retrograde && <span className={styles.retro}> ℞</span>}{" "}
          {ASPECT_NAMES[e.type].toLowerCase()} natal{" "}
          <span className={styles.glyph} aria-hidden="true">
            {PLANET_GLYPH_CHARS[e.b]}
          </span>
          {PLANET_NAMES[e.b]}
          {e.pass.of > 1 && (
            <span className={styles.orb}>
              {" "}
              (pass {e.pass.n} of {e.pass.of})
            </span>
          )}
        </>
      );
    case "ingress":
      return (
        <>
          <span className={styles.glyph} aria-hidden="true">
            {PLANET_GLYPH_CHARS[e.planet]}
          </span>
          {PLANET_NAMES[e.planet]}
          {e.retrograde ? " ℞ re-enters " : " enters "}
          {SIGN_NAMES[SIGNS[e.signIndex]]}
        </>
      );
    case "station":
      return (
        <>
          <span className={styles.glyph} aria-hidden="true">
            {PLANET_GLYPH_CHARS[e.planet]}
          </span>
          {PLANET_NAMES[e.planet]} stations {e.direction}
        </>
      );
    case "eclipse": {
      const ec = e.eclipse;
      const label = ec.kind === "solar" ? "solar eclipse" : "lunar eclipse";
      return (
        <>
          {ec.type[0].toUpperCase() + ec.type.slice(1)} {label} at{" "}
          {formatDegreeInSign(ec.degreeInSign)} {SIGN_NAMES[ec.sign]}
        </>
      );
    }
  }
}

/**
 * The Transits tab's "Calendar" view: exact transit events for one month —
 * aspect perfections against the natal chart, sign ingresses, stations and
 * eclipses. Times are shown in the browser's timezone; the scan itself runs
 * on UTC day boundaries.
 */
export default function TransitCalendarView({
  profileId,
}: {
  profileId: number;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [state, setState] = useState<State>({ kind: "loading" });
  // Journal note counts per civil date for the month — the calendar's
  // link back to "what I wrote that day". Best effort: a failed fetch just
  // shows no note markers.
  const [noteCounts, setNoteCounts] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }
    setState({ kind: "loading" });
    const { from, to } = monthRange(year, month0);
    const minors = loadOrbSettings().includeMinors ? "&minors=1" : "";
    let res: Response;
    try {
      res = await fetch(
        `/api/transits/${profileId}/calendar?from=${from}&to=${to}${minors}`,
      );
    } catch {
      setState({ kind: "offline" });
      return;
    }
    if (!res.ok) {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "data", data: await res.json() });
    try {
      const notes = await fetch(
        `/api/profiles/${profileId}/journal?from=${from}&to=${to}`,
      );
      if (notes.ok) {
        const body = (await notes.json()) as {
          entries: Array<{ entryDate: string }>;
        };
        const counts = new Map<string, number>();
        for (const e of body.entries) {
          counts.set(e.entryDate, (counts.get(e.entryDate) ?? 0) + 1);
        }
        setNoteCounts(counts);
      }
    } catch {
      // Markers are optional.
    }
  }, [profileId, year, month0]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-retry once connectivity returns (same stance as the Now view).
  useEffect(() => {
    const onOnline = () => {
      setState((s) => {
        if (s.kind === "offline") void load();
        return s;
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  const monthLabel = new Date(year, month0, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={styles.panel}>
      <div className={styles.asOfRow}>
        <h3 className={styles.sectionTitle}>{monthLabel}</h3>
        <span>
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>{" "}
          <button
            onClick={() => {
              setYear(now.getFullYear());
              setMonth0(now.getMonth());
            }}
          >
            This month
          </button>{" "}
          <button onClick={() => shiftMonth(1)} aria-label="Next month">
            ›
          </button>{" "}
          {state.kind === "data" && state.data.events.length > 0 && (
            <button
              onClick={() =>
                downloadIcs(
                  buildIcs(transitMonthIcsEvents(state.data), {
                    calName: `AstralSync transits — ${monthLabel}`,
                  }),
                  `astralsync-transits-${year}-${pad(month0 + 1)}`,
                )
              }
            >
              Export .ics
            </button>
          )}
        </span>
      </div>

      {state.kind === "loading" && (
        <p className={styles.muted}>Scanning the month’s transits…</p>
      )}
      {state.kind === "offline" && (
        <div className={styles.notice} role="status">
          <p>
            The transit calendar needs a live connection — it is scanned fresh
            and never stored.
          </p>
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {state.kind === "error" && (
        <div className={styles.notice} role="status">
          <p>Could not scan this month right now.</p>
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}

      {state.kind === "data" && (
        <MonthEvents
          data={state.data}
          profileId={profileId}
          noteCounts={noteCounts}
        />
      )}
    </div>
  );
}

/** Deep link into the Journal tab for one civil date. */
function journalHref(profileId: number, day: string): string {
  return `/profiles/${profileId}?tab=journal&date=${day}`;
}

function MonthEvents({
  data,
  profileId,
  noteCounts,
}: {
  data: TransitCalendarData;
  profileId: number;
  noteCounts: Map<string, number>;
}) {
  if (data.events.length === 0) {
    return (
      <p className={styles.muted}>
        No exact transit events this month (the transiting Moon is not
        tracked here).
      </p>
    );
  }

  const days = new Map<string, TransitCalendarEvent[]>();
  for (const e of data.events) {
    const key = localDayKey(e.utc);
    const list = days.get(key) ?? [];
    list.push(e);
    days.set(key, list);
  }

  return (
    <div>
      {data.natal.moonUncertain && (
        <p className={styles.muted}>
          Events involving the natal Moon are approximate — the birth time is
          not exact.
        </p>
      )}
      {[...days.entries()].map(([day, events]) => (
        <section key={day} aria-label={day}>
          <h4 className={styles.sectionTitle}>
            {new Date(`${day}T12:00:00`).toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}{" "}
            <Link
              href={journalHref(profileId, day)}
              className={styles.orb}
              title={
                noteCounts.has(day)
                  ? "Open this day's journal notes"
                  : "Write a journal note about this day"
              }
            >
              {noteCounts.has(day)
                ? `✎ ${noteCounts.get(day)} ${noteCounts.get(day) === 1 ? "note" : "notes"}`
                : "✎ note"}
            </Link>
          </h4>
          <ul className={styles.aspectList}>
            {events.map((e, i) => (
              <li key={i}>
                <span className={styles.orb}>{timeOf(e.utc)}</span>{" "}
                {eventLine(e)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
