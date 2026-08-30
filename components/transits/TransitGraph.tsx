"use client";

import { useCallback, useEffect, useState } from "react";
import type { AspectType } from "@astralsync/astro-core";
import type { GraphBar, TransitGraphData } from "@/lib/transitGraphCore";
import { loadOrbSettings, orbQuery } from "@/lib/orbSettings";
import { ASPECT_NAMES, PLANET_NAMES } from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import styles from "./transits.module.css";

type State =
  | { kind: "loading" }
  | { kind: "data"; data: TransitGraphData }
  | { kind: "offline" }
  | { kind: "error" };

const DAY_MS = 86_400_000;

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

const ASPECT_CLASS: Record<AspectType, string> = {
  conjunction: styles.barConjunction,
  sextile: styles.barSextile,
  square: styles.barSquare,
  trine: styles.barTrine,
  opposition: styles.barOpposition,
  semisextile: styles.barMinor,
  semisquare: styles.barMinor,
  quintile: styles.barMinor,
  sesquiquadrate: styles.barMinor,
  quincunx: styles.barMinor,
};

const LEFT = 64;
const RIGHT = 12;
const ROW_H = 22;
const HEADER_H = 26;
const WIDTH = 800;

function describe(b: GraphBar): string {
  const d = (iso: string) =>
    new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${PLANET_NAMES[b.transiter]} ${ASPECT_NAMES[b.type].toLowerCase()} natal ${PLANET_NAMES[b.target]}${b.retrograde ? " ℞" : ""}${b.pass.of > 1 ? ` (pass ${b.pass.n} of ${b.pass.of})` : ""}: ${b.truncated.entry ? "before " : ""}${d(b.entryUtc)} → exact ${d(b.exactUtc)} → ${d(b.exitUtc)}${b.truncated.exit ? " or later" : ""}`;
}

/**
 * The Transits tab's "Graph" view: one row per natal planet, a bar for each
 * transiting contact's in-orb window across the month (entry → exact →
 * exit), with the exact instant ticked and retrograde passes tagged. The
 * bars come from /api/transits/[id]/graph at the per-browser orbs.
 */
export default function TransitGraph({ profileId }: { profileId: number }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }
    setState({ kind: "loading" });
    const { from, to } = monthRange(year, month0);
    const orbs = orbQuery(loadOrbSettings());
    const query = `from=${from}&to=${to}${orbs ? "&" + orbs.slice(1) : ""}`;
    let res: Response;
    try {
      res = await fetch(`/api/transits/${profileId}/graph?${query}`);
    } catch {
      setState({ kind: "offline" });
      return;
    }
    if (!res.ok) {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "data", data: await res.json() });
  }, [profileId, year, month0]);

  useEffect(() => {
    void load();
  }, [load]);

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
          </button>
        </span>
      </div>

      {state.kind === "loading" && (
        <p className={styles.muted}>Tracing the month’s transit windows…</p>
      )}
      {state.kind === "offline" && (
        <div className={styles.notice} role="status">
          <p>The transit graph needs a live connection — it is traced fresh and never stored.</p>
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {state.kind === "error" && (
        <div className={styles.notice} role="status">
          <p>Could not trace this month right now.</p>
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {state.kind === "data" && <Graph data={state.data} />}
    </div>
  );
}

function Graph({ data }: { data: TransitGraphData }) {
  // Read once per mount: the "today" marker needn't tick.
  const [todayMs] = useState(() => Date.now());
  const from = Date.parse(data.from);
  const to = Date.parse(data.to);
  const span = to - from;
  const x = (iso: string) =>
    LEFT +
    ((Math.min(Math.max(Date.parse(iso), from), to) - from) / span) *
      (WIDTH - LEFT - RIGHT);
  const rows = data.rows;
  const height = HEADER_H + rows.length * ROW_H + 8;
  const totalBars = rows.reduce((n, r) => n + r.bars.length, 0);

  // Week gridlines on local Mondays inside the range.
  const gridDays: number[] = [];
  for (let t = from; t <= to; t += DAY_MS) {
    const d = new Date(t);
    if (d.getUTCDate() === 1 || d.getUTCDate() % 7 === 1) gridDays.push(t);
  }

  return (
    <div>
      {data.natal.moonUncertain && (
        <p className={styles.muted}>
          Windows to the natal Moon are approximate — the birth time is not
          exact.
        </p>
      )}
      <div className="tableWrap">
        <svg
          className={styles.graph}
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={`Transit windows for the month: ${totalBars} contacts`}
        >
          {gridDays.map((t) => (
            <g key={t}>
              <line
                x1={x(new Date(t).toISOString())}
                x2={x(new Date(t).toISOString())}
                y1={HEADER_H - 6}
                y2={height - 4}
                className={styles.gridLine}
              />
              <text
                x={x(new Date(t).toISOString()) + 2}
                y={HEADER_H - 10}
                className={styles.gridLabel}
              >
                {new Date(t).getUTCDate()}
              </text>
            </g>
          ))}
          {todayMs >= from && todayMs <= to && (
            <line
              x1={x(new Date(todayMs).toISOString())}
              x2={x(new Date(todayMs).toISOString())}
              y1={HEADER_H - 6}
              y2={height - 4}
              className={styles.todayLine}
            />
          )}
          {rows.map((row, i) => {
            const y = HEADER_H + i * ROW_H;
            // Stack overlapping bars in sub-lanes so they stay readable.
            const lanes: number[] = [];
            const placed = row.bars.map((b) => {
              const start = Date.parse(b.entryUtc);
              let lane = lanes.findIndex((end) => end <= start);
              if (lane === -1) {
                lane = lanes.length;
                lanes.push(0);
              }
              lanes[lane] = Date.parse(b.exitUtc);
              return { b, lane };
            });
            const laneH = Math.max(4, (ROW_H - 6) / Math.max(1, lanes.length));
            return (
              <g key={row.target}>
                <line
                  x1={LEFT}
                  x2={WIDTH - RIGHT}
                  y1={y + ROW_H}
                  y2={y + ROW_H}
                  className={styles.rowLine}
                />
                <text x={4} y={y + ROW_H / 2 + 4} className={styles.rowLabel}>
                  <tspan aria-hidden="true">{PLANET_GLYPH_CHARS[row.target] + "︎"}</tspan>{" "}
                  {PLANET_NAMES[row.target]}
                </text>
                {placed.map(({ b, lane }, j) => {
                  const x1 = x(b.entryUtc);
                  const x2 = x(b.exitUtc);
                  const xe = x(b.exactUtc);
                  const by = y + 3 + lane * laneH;
                  const inRange =
                    Date.parse(b.exactUtc) >= from && Date.parse(b.exactUtc) <= to;
                  return (
                    <g key={`${b.transiter}-${b.type}-${j}`} className={ASPECT_CLASS[b.type]}>
                      <title>{describe(b)}</title>
                      <rect
                        x={x1}
                        y={by}
                        width={Math.max(2, x2 - x1)}
                        height={laneH - 1}
                        rx={2}
                        className={styles.bar}
                      />
                      {inRange && (
                        <line
                          x1={xe}
                          x2={xe}
                          y1={by - 1}
                          y2={by + laneH}
                          className={styles.exactTick}
                        />
                      )}
                      <text
                        x={Math.min(x1 + 3, WIDTH - RIGHT - 40)}
                        y={by + laneH - 2}
                        className={styles.barLabel}
                      >
                        {PLANET_GLYPH_CHARS[b.transiter] + "︎"}
                        {b.retrograde ? "℞" : ""}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className={styles.legend} aria-label="Aspect colours">
        {(["conjunction", "sextile", "square", "trine", "opposition"] as AspectType[]).map(
          (t) => (
            <li key={t} className={ASPECT_CLASS[t]}>
              <span className={styles.legendSwatch} aria-hidden="true" />
              {ASPECT_NAMES[t]}
            </li>
          ),
        )}
        {data.includeMinors && (
          <li className={styles.barMinor}>
            <span className={styles.legendSwatch} aria-hidden="true" />
            Minor aspects
          </li>
        )}
      </ul>
      <p className={styles.muted}>
        Each bar is one contact&rsquo;s in-orb window ({data.orbs.luminary}°
        for the luminaries, {data.orbs.default}° otherwise — the same
        per-browser orbs as the Now view); the tick is the exact hit, ℞ a
        retrograde pass. The transiting Moon is left out. Hover a bar for
        its dates.
      </p>
      {totalBars === 0 && (
        <p className={styles.muted}>
          No transiting contact is within orb of a natal placement this month.
        </p>
      )}
    </div>
  );
}
