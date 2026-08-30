"use client";

import { useEffect, useState } from "react";
import { PLANETS } from "@astralsync/astro-core";
import type { EphemerisMonth } from "@/lib/ephemeris";
import { PLANET_NAMES } from "@/components/format";
import { PLANET_GLYPH_CHARS, POINT_GLYPH_CHARS } from "@/components/chart/glyphs";
import { downloadText } from "@/components/downloadText";
import styles from "./ephemeris.module.css";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

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
  const [format, setFormat] = useState<
    ((p: EphemerisMonth["days"][number]["positions"]["sun"]) => string) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    void (async () => {
      const mod = await import("@/lib/ephemeris");
      // Yield so the "computing" line paints before the ~0.5s sync work.
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;
      setFormat(() => mod.formatEphemerisPosition);
      setData(mod.computeEphemerisMonth(year, month));
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  function shift(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  }

  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString([], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const todayKey = now.toISOString().slice(0, 10);

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <button onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <h2 className={styles.monthLabel}>{label}</h2>
        <button onClick={() => shift(1)} aria-label="Next month">›</button>
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
            min="1700-01"
            max="2200-12"
            onChange={(e) => {
              const m = /^(\d{4})-(\d{2})$/.exec(e.target.value);
              if (!m) return;
              const y = Number(m[1]);
              if (y < 1700 || y > 2200) return;
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

      {!data || !format ? (
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
                  <th scope="row">{d.date.slice(8)}</th>
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
