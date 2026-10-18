"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MONTH_SHIFT_EVENT } from "@/lib/shortcuts";
import { PLANETS } from "@astralsync/astro-core";
import type { EphemerisMonth } from "@/lib/ephemeris";
import { PLANET_NAMES } from "@/components/format";
import { PLANET_GLYPH_CHARS, POINT_GLYPH_CHARS } from "@/components/chart/glyphs";
import { downloadText } from "@/components/downloadText";
import styles from "./ephemeris.module.css";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The engine's supported span, as the "Go to" field enforces it. */
const MIN_YEAR = 1700;
const MAX_YEAR = 2200;

/**
 * Monthly ephemeris table, computed in-browser (lib/ephemeris via dynamic
 * import — the Sky Calendar pattern) so it works offline. Daily 0h UT
 * positions with ingresses and stations marked; CSV export for anyone
 * cross-checking against a published ephemeris.
 */
export default function EphemerisTable() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [data, setData] = useState<EphemerisMonth | null>(null);
  const [failed, setFailed] = useState(false);
  const [format, setFormat] = useState<
    ((p: EphemerisMonth["days"][number]["positions"]["sun"]) => string) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    void (async () => {
      try {
        const mod = await import("@/lib/ephemeris");
        // Yield so the "computing" line paints before the ~0.5s sync work.
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;
        setFormat(() => mod.formatEphemerisPosition);
        setData(mod.computeEphemerisMonth(year, month));
      } catch {
        // Never leave "Computing the month…" up for good.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const atStart = year === MIN_YEAR && month === 1;
  const atEnd = year === MAX_YEAR && month === 12;

  function shift(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    const y = d.getUTCFullYear();
    // The buttons and the "[" / "]" shortcuts stop where the field does.
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    setYear(y);
    setMonth(d.getUTCMonth() + 1);
  }

  // The global "[" / "]" shortcuts page months via a window event; no dep
  // array — re-subscribing keeps the closure's month state fresh.
  useEffect(() => {
    const on = (e: Event) =>
      shift((e as CustomEvent<{ delta: number }>).detail.delta);
    window.addEventListener(MONTH_SHIFT_EVENT, on);
    return () => window.removeEventListener(MONTH_SHIFT_EVENT, on);
  });

  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString([], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const todayKey = now.toISOString().slice(0, 10);

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <button onClick={() => shift(-1)} aria-label="Previous month" disabled={atStart}>
          ‹
        </button>
        <h2 className={styles.monthLabel}>{label}</h2>
        <button onClick={() => shift(1)} aria-label="Next month" disabled={atEnd}>
          ›
        </button>
        <button
          onClick={() => {
            setYear(now.getUTCFullYear());
            setMonth(now.getUTCMonth() + 1);
          }}
        >
          This month
        </button>
        <label className={styles.jump}>
          Go to{" "}
          <input
            type="month"
            value={`${year}-${pad(month)}`}
            min={`${MIN_YEAR}-01`}
            max={`${MAX_YEAR}-12`}
            onChange={(e) => {
              const m = /^(\d{4})-(\d{2})$/.exec(e.target.value);
              if (!m) return;
              const y = Number(m[1]);
              if (y < MIN_YEAR || y > MAX_YEAR) return;
              setYear(y);
              setMonth(Number(m[2]));
            }}
          />
        </label>
        {data && (
          <button
            onClick={async () => {
              const { ephemerisCsv } = await import("@/lib/ephemeris");
              downloadText(
                ephemerisCsv(data),
                `astralsync-ephemeris-${year}-${pad(month)}`,
                "csv",
                "text/csv;charset=utf-8",
              );
            }}
          >
            Download CSV
          </button>
        )}
      </div>

      {failed ? (
        <p className={styles.muted}>This month could not be computed.</p>
      ) : !data || !format ? (
        <p className={styles.muted}>Computing the month…</p>
      ) : (
        <div className="tableWrap">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                {PLANETS.map((p) => (
                  <th key={p} scope="col" title={PLANET_NAMES[p]}>
                    <span aria-hidden="true">{PLANET_GLYPH_CHARS[p] + "︎"}</span>
                    <span className={styles.srOnly}>{PLANET_NAMES[p]}</span>
                  </th>
                ))}
                <th scope="col" title="True North Node">
                  <span aria-hidden="true">{POINT_GLYPH_CHARS.north_node}</span>
                  <span className={styles.srOnly}>North Node</span>
                </th>
                <th scope="col">Events</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr
                  key={d.date}
                  className={d.date === todayKey ? styles.today : undefined}
                >
                  <th scope="row">
                    <Link href={`/calendar/${d.date}`} title="This day's almanac">
                      {d.date.slice(8)}
                    </Link>
                  </th>
                  {PLANETS.map((p) => (
                    <td
                      key={p}
                      className={d.positions[p].retrograde ? styles.retro : undefined}
                    >
                      {format(d.positions[p])}
                    </td>
                  ))}
                  <td className={d.northNode.retrograde ? styles.retro : undefined}>
                    {format(d.northNode)}
                  </td>
                  <td className={styles.events}>{d.events.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.muted}>
        Positions at 0h UT, tropical longitudes of date; ℞ marks retrograde
        motion; the node is the true node. Computed here in the browser by{" "}
        {data ? `${data.engine.name} ${data.engine.version}` : "the bundled engine"}.
      </p>
    </div>
  );
}
