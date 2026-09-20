"use client";

import { useEffect, useState } from "react";
import type { CrossAspect, Placement } from "@astralsync/astro-core";
import { localNoonIso } from "@/components/atDate";
import { PLANET_NAMES, POINT_NAMES, SIGN_NAMES } from "@/components/format";
import {
  TransitAspectList,
  TransitPositionsTable,
} from "@/components/transits/TransitTables";
import {
  filterAspectsForPrecision,
  filterPlacementsForPrecision,
  precisionCaveat,
  timeLordLines,
  type EventCyclesInput,
  type TimeLordLine,
} from "@/lib/eventSky";
import type { LifeEventPrecision } from "@/lib/lifeEventMeta";
import styles from "./lifeEvents.module.css";

/**
 * "What was happening in the chart when this happened."
 *
 * Every technique here already existed and both routes have always taken
 * `?at=` — this is the surface that finally asks them about a date the user
 * cared about rather than about today. Fetched on expand, never up front: a
 * profile can hold 200 events and prefetching all of them would be 400
 * requests nobody asked for.
 */

type Sky = {
  placements: Placement[];
  crossAspects: CrossAspect[];
  natal: { isSolarChart: boolean; moonUncertain?: boolean };
};

type State =
  | { kind: "loading" }
  | { kind: "data"; sky: Sky; cycles: EventCyclesInput }
  | { kind: "offline" }
  | { kind: "error" };

const ORDINAL = [
  "1st", "2nd", "3rd", "4th", "5th", "6th",
  "7th", "8th", "9th", "10th", "11th", "12th",
];

/** Firdaria lords include the nodes, which live in POINT_NAMES. */
function lordName(lord: string): string {
  return lord === "north_node" || lord === "south_node"
    ? POINT_NAMES[lord]
    : (PLANET_NAMES[lord as keyof typeof PLANET_NAMES] ?? lord);
}

function signName(sign: string): string {
  return SIGN_NAMES[sign as keyof typeof SIGN_NAMES] ?? sign;
}

function TimeLordRow({ line }: { line: TimeLordLine }) {
  switch (line.kind) {
    case "profection":
      return (
        <div className={styles.lordRow}>
          <dt>Annual profection</dt>
          <dd>
            {ORDINAL[line.house - 1]} house in {signName(line.sign)} —{" "}
            {lordName(line.lord)} lord of the year
            <span className={styles.muted}> · age {line.age}</span>
          </dd>
        </div>
      );
    case "firdaria":
      return (
        <div className={styles.lordRow}>
          <dt>Firdaria</dt>
          <dd>
            {lordName(line.major)}
            {line.sub ? ` / ${lordName(line.sub)}` : ""}
            {line.secondCycle && (
              <span className={styles.muted}> · second cycle</span>
            )}
          </dd>
        </div>
      );
    case "releasing": {
      const marks = [
        line.peak ? "peak period" : null,
        line.loosedBond ? "loosed the bond" : null,
      ].filter(Boolean);
      return (
        <div className={styles.lordRow}>
          <dt>Releasing from {line.lot === "fortune" ? "Fortune" : "Spirit"}</dt>
          <dd>
            {signName(line.sign)} ({lordName(line.lord)})
            {line.subSign ? ` → ${signName(line.subSign)}` : ""}
            {marks.length > 0 && (
              <span className={styles.muted}> · {marks.join(", ")}</span>
            )}
          </dd>
        </div>
      );
    }
    case "progressed-sun":
      return (
        <div className={styles.lordRow}>
          <dt>Progressed Sun</dt>
          <dd>{signName(line.sign)}</dd>
        </div>
      );
  }
}

export default function EventSky({
  profileId,
  eventDate,
  precision,
}: {
  profileId: number;
  /** Canonical "YYYY-MM-DD" (day 01 for month precision, Jan 01 for year). */
  eventDate: string;
  precision: LifeEventPrecision;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setState({ kind: "offline" });
        return;
      }
      const at = encodeURIComponent(localNoonIso(eventDate));
      try {
        const [tRes, cRes] = await Promise.all([
          fetch(`/api/transits/${profileId}?at=${at}`),
          fetch(`/api/cycles/${profileId}?at=${at}`),
        ]);
        if (cancelled) return;
        if (!tRes.ok || !cRes.ok) {
          setState({ kind: "error" });
          return;
        }
        setState({
          kind: "data",
          sky: (await tRes.json()) as Sky,
          cycles: (await cRes.json()) as EventCyclesInput,
        });
      } catch {
        // sw.js never intercepts /api/*, so this is a real network failure.
        if (!cancelled) setState({ kind: "offline" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, eventDate]);

  if (state.kind === "loading") {
    return <p className={styles.muted}>Casting the sky for that day…</p>;
  }
  if (state.kind === "offline") {
    return (
      <p className={styles.muted}>
        The sky for a past date is computed fresh and needs a connection.
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className={styles.muted}>
        Could not compute the sky for that date.
      </p>
    );
  }

  const { sky, cycles } = state;
  const caveat = precisionCaveat(precision);
  const placements = filterPlacementsForPrecision(sky.placements, precision);
  const aspects = filterAspectsForPrecision(sky.crossAspects, precision);
  const lords = timeLordLines(cycles);
  const showHouses = !sky.natal.isSolarChart;

  return (
    <div className={styles.eventSky}>
      {caveat && <p className={styles.muted}>{caveat}</p>}

      {lords.length > 0 && (
        <section aria-label="Time lords at this event">
          <h4 className={styles.skyHeading}>Who was in charge</h4>
          <dl className={styles.lordList}>
            {lords.map((line, i) => (
              <TimeLordRow key={`${line.kind}-${i}`} line={line} />
            ))}
          </dl>
        </section>
      )}

      <section aria-label="Transits at this event">
        <h4 className={styles.skyHeading}>Transits to the natal chart</h4>
        <TransitAspectList
          aspects={aspects}
          prose={undefined}
          moonUncertain={false}
          moonReason=""
          emptyText={
            precision === "day"
              ? "Nothing within orb that day."
              : "No slow-planet contacts within orb."
          }
        />
      </section>

      <section aria-label="Positions at this event">
        <h4 className={styles.skyHeading}>Where the planets were</h4>
        <TransitPositionsTable
          placements={placements}
          showHouses={showHouses}
          positionHeader="Position"
          houseHeader="Natal house"
        />
      </section>
    </div>
  );
}
