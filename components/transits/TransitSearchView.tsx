"use client";

import { useState } from "react";
// Type-only import: lib/aspectSearch value-imports prisma and the ephemeris
// (same constraint transitIcsEvents notes for lib/transitCalendar).
import type {
  AspectSearchData,
  SearchTarget,
} from "@/lib/aspectSearch";
import type { AspectType, Planet } from "@astralsync/astro-core";
import type { WheelChart } from "@/lib/view-types";
import {
  ANGLE_NAMES,
  ASPECT_NAMES,
  PLANET_NAMES,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { downloadIcs } from "@/components/downloadIcs";
import styles from "./transits.module.css";

/** Literal vocabularies for the pickers (no astro-core value imports in the
 *  client bundle — the DayPicker INTENT_OPTIONS precedent). */
const SEARCH_PLANETS: Planet[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const SEARCH_ASPECTS: AspectType[] = [
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition",
];

const ANGLE_TARGETS = ["ascendant", "mc"] as const;

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "data"; data: AspectSearchData }
  | { kind: "offline" }
  | { kind: "error" };

function targetLabel(target: SearchTarget): string {
  return target === "ascendant" || target === "mc"
    ? ANGLE_NAMES[target]
    : PLANET_NAMES[target];
}

function searchIcsEvents(data: AspectSearchData): IcsEvent[] {
  const summary = `${PLANET_NAMES[data.planet]} ${ASPECT_NAMES[
    data.aspect
  ].toLowerCase()} natal ${targetLabel(data.target)}`;
  return data.hits.map((h) => ({
    uid: `search-${data.planet}-${data.aspect}-${data.target}-${h.utc}`,
    summary: h.retrograde ? `${summary} ℞` : summary,
    start: h.utc,
  }));
}

/**
 * The Transits tab's "Search" view: "when is my next X?" — pick a transiting
 * planet, a major aspect and a natal point, get the next few exact dates.
 * Unlike the calendar sweep, the transiting Moon is allowed: a single pair
 * is cheap, and monthly lunar contacts are exactly what the calendar
 * excludes. Each retrograde re-pass is its own dated hit (℞-tagged) rather
 * than a "pass n of m" label — the horizon is open-ended, so there is no
 * honest "of".
 */
export default function TransitSearchView({
  profileId,
  chart,
}: {
  profileId: number;
  chart: WheelChart;
}) {
  const [planet, setPlanet] = useState<Planet>("saturn");
  const [aspect, setAspect] = useState<AspectType>("conjunction");
  const [target, setTarget] = useState<SearchTarget>("sun");
  const [state, setState] = useState<State>({ kind: "idle" });

  const hasAngles = chart.houses !== null;

  async function search() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }
    setState({ kind: "loading" });
    let res: Response;
    try {
      res = await fetch(
        `/api/transits/${profileId}/search?planet=${planet}&aspect=${aspect}&target=${target}`,
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
  }

  return (
    <div className={styles.panel}>
      <div className={styles.searchRow}>
        <label>
          Transiting{" "}
          <select
            value={planet}
            onChange={(e) => setPlanet(e.target.value as Planet)}
          >
            {SEARCH_PLANETS.map((p) => (
              <option key={p} value={p}>
                {PLANET_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Aspect{" "}
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value as AspectType)}
          >
            {SEARCH_ASPECTS.map((a) => (
              <option key={a} value={a}>
                {ASPECT_NAMES[a]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Natal point{" "}
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as SearchTarget)}
          >
            {SEARCH_PLANETS.map((p) => (
              <option key={p} value={p}>
                {PLANET_NAMES[p]}
              </option>
            ))}
            {hasAngles &&
              ANGLE_TARGETS.map((a) => (
                <option key={a} value={a}>
                  {ANGLE_NAMES[a]}
                </option>
              ))}
          </select>
        </label>
        <button onClick={() => void search()}>Find next 5</button>
      </div>

      {state.kind === "idle" && (
        <p className={styles.muted}>
          Pick a transit and a natal point to find its next exact dates —
          retrograde loops list every pass.
        </p>
      )}
      {state.kind === "loading" && (
        <p className={styles.muted}>Scanning ahead…</p>
      )}
      {state.kind === "offline" && (
        <div className={styles.notice} role="status">
          <p>
            The search needs a live connection — it is scanned fresh and never
            stored.
          </p>
          <button onClick={() => void search()}>Retry</button>
        </div>
      )}
      {state.kind === "error" && (
        <div className={styles.notice} role="status">
          <p>Could not run this search right now.</p>
          <button onClick={() => void search()}>Retry</button>
        </div>
      )}

      {state.kind === "data" && <SearchResults data={state.data} />}
    </div>
  );
}

function SearchResults({ data }: { data: AspectSearchData }) {
  const heading = `${PLANET_NAMES[data.planet]} ${ASPECT_NAMES[
    data.aspect
  ].toLowerCase()} natal ${targetLabel(data.target)}`;

  if (data.hits.length === 0) {
    return (
      <p className={styles.muted}>
        No exact {heading} before 2200 — for an outer planet a lifetime can
        miss a given aspect entirely.
      </p>
    );
  }

  return (
    <section aria-label="Search results">
      <div className={styles.asOfRow}>
        <h3 className={styles.sectionTitle}>Next {heading}</h3>
        <button
          onClick={() =>
            downloadIcs(
              buildIcs(searchIcsEvents(data), {
                calName: `AstralSync — ${heading}`,
              }),
              `astralsync-${data.planet}-${data.aspect}-${data.target}`,
            )
          }
        >
          Export .ics
        </button>
      </div>
      <ul className={styles.aspectList}>
        {data.hits.map((h) => (
          <li key={h.utc}>
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[data.planet]}
            </span>
            {new Date(h.utc).toLocaleString([], {
              dateStyle: "full",
              timeStyle: "short",
            })}
            {h.retrograde && <span className={styles.retro}> ℞</span>}
          </li>
        ))}
      </ul>
      {data.truncated && (
        <p className={styles.muted}>
          Fewer than {data.count} hits exist before 2200, where the ephemeris
          model ends.
        </p>
      )}
      {data.target === "moon" && data.natal.moonUncertain && (
        <p className={styles.muted}>
          Dates involving the natal Moon are approximate — the birth time is
          not exact.
        </p>
      )}
    </section>
  );
}
