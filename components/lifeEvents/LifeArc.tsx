"use client";

import { useMemo, useState } from "react";
import { PLANET_NAMES, POINT_NAMES, SIGN_NAMES } from "@/components/format";
import {
  LIFE_EVENT_CATEGORY_LABELS,
  formatEventDate,
} from "@/lib/lifeEventMeta";
import {
  arcScale,
  decadeTicks,
  personalYearBands,
  pinnacleBands,
  placeBands,
  placeEvents,
  profectionBands,
  type ArcBand,
  type ArcEvent,
} from "@/lib/lifeArc";
import styles from "./lifeArc.module.css";

/**
 * The life arc: recorded events pinned against the time-lord periods that
 * were running underneath them.
 *
 * Separately, releasing periods, firdaria periods, profection years,
 * numerology's pinnacles and personal years, and the user's own events are
 * six lists of dates. On one axis they become the
 * question this app exists to answer — whether the system describes what
 * actually happened. Every band is labelled with the technique that produced
 * it, so it stays a reading aid rather than a decorative stripe.
 *
 * All arithmetic lives in lib/lifeArc (pure, unit-tested); this renders it.
 */

const ORDINAL = [
  "1st", "2nd", "3rd", "4th", "5th", "6th",
  "7th", "8th", "9th", "10th", "11th", "12th",
];

function lordName(lord: string): string {
  return lord === "north_node" || lord === "south_node"
    ? POINT_NAMES[lord]
    : (PLANET_NAMES[lord as keyof typeof PLANET_NAMES] ?? lord);
}

function signName(sign: string): string {
  return SIGN_NAMES[sign as keyof typeof SIGN_NAMES] ?? sign;
}

export interface LifeArcPeriods {
  releasing: {
    sign: string;
    lord: string;
    startUtc: string;
    endUtc: string;
    peak: boolean;
    loosedBond: boolean;
  }[];
  firdaria: { lord: string; startUtc: string; endUtc: string }[];
}

export default function LifeArc({
  birthUtc,
  birthDate,
  events,
  periods,
}: {
  birthUtc: string;
  /** Civil birth date "YYYY-MM-DD": numerology counts from the calendar
   *  date, which can differ from the UTC instant's date. */
  birthDate: string;
  events: ArcEvent[];
  /** Null on a solar chart: releasing, firdaria and profections all need an
   *  Ascendant, so the arc degrades to events on a bare timeline. */
  periods: LifeArcPeriods | null;
}) {
  const [active, setActive] = useState<number | null>(null);

  const model = useMemo(() => {
    const scale = arcScale(birthUtc, events);
    const [year, month, day] = birthDate.split("-").map(Number);
    const civil = { year, month, day };
    const releasing: ArcBand[] = (periods?.releasing ?? []).map((p) => ({
      key: p.sign,
      lord: p.lord,
      startUtc: p.startUtc,
      endUtc: p.endUtc,
      peak: p.peak,
      loosedBond: p.loosedBond,
    }));
    const firdaria: ArcBand[] = (periods?.firdaria ?? []).map((p) => ({
      key: p.lord,
      startUtc: p.startUtc,
      endUtc: p.endUtc,
    }));
    return {
      scale,
      ticks: decadeTicks(birthUtc, scale),
      releasing: placeBands(releasing, scale),
      firdaria: placeBands(firdaria, scale),
      profections: periods ? placeBands(profectionBands(birthUtc, scale), scale) : [],
      // Numerology needs only the date, so these rows stay on solar charts.
      pinnacles: placeBands(pinnacleBands(birthUtc, civil, scale), scale),
      personalYears: placeBands(personalYearBands(civil, scale), scale),
      events: placeEvents(events, scale),
    };
  }, [birthUtc, birthDate, events, periods]);

  const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
  const activeEvent = model.events.find((e) => e.id === active) ?? null;

  const rows: { label: string; hint: string; bands: typeof model.releasing }[] = [
    {
      label: "Releasing (Fortune)",
      hint: "Zodiacal releasing from the Lot of Fortune — general periods",
      bands: model.releasing,
    },
    { label: "Firdaria", hint: "Persian time-lords, the 75-year wheel", bands: model.firdaria },
    {
      label: "Profection",
      hint: "Annual profection — the house the year counts to",
      bands: model.profections,
    },
    {
      label: "Pinnacle",
      hint: "Numerology pinnacles — the four long chapters, with their challenges",
      bands: model.pinnacles,
    },
    {
      label: "Personal year",
      hint: "Numerology personal years — the nine-year cycle, January to January",
      bands: model.personalYears,
    },
  ];

  return (
    <div className={styles.arc}>
      {!periods && (
        <p className={styles.muted}>
          This is a solar chart, so there is no Ascendant to profect from and
          no lots to release from — the arc shows your events against the
          numerology cycles, which need only the birth date.
        </p>
      )}

      <div className={styles.axis} aria-hidden="true">
        {model.ticks.map((t) => (
          <span key={t.age} className={styles.tick} style={{ left: pct(t.x) }}>
            {t.age}
          </span>
        ))}
      </div>

      {rows.map(
        (row) =>
          row.bands.length > 0 && (
            <div className={styles.row} key={row.label}>
              <span className={styles.rowLabel} title={row.hint}>
                {row.label}
              </span>
              <div className={styles.track}>
                {row.bands.map((b, i) => (
                  <span
                    key={`${b.key}-${b.startUtc}-${i}`}
                    className={[
                      styles.band,
                      b.peak ? styles.peak : "",
                      b.loosedBond ? styles.loosed : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ left: pct(b.x), width: pct(b.width) }}
                    title={bandTitle(row.label, b)}
                  >
                    <span className={styles.bandText}>
                      {bandShort(row.label, b)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ),
      )}

      <div className={styles.row}>
        <span className={styles.rowLabel}>Your events</span>
        <div className={styles.track}>
          {model.events.map((e) => (
            <button
              key={e.id}
              className={
                e.id === active ? `${styles.pin} ${styles.pinActive}` : styles.pin
              }
              style={{ left: pct(e.x) }}
              aria-pressed={e.id === active}
              onClick={() => setActive((v) => (v === e.id ? null : e.id))}
            >
              <span className={styles.srOnly}>
                {e.title}, {formatEventDate(e.eventDate, e.precision)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className={styles.caption} role="status">
        {activeEvent ? (
          <>
            <strong>{activeEvent.title}</strong> ·{" "}
            {formatEventDate(activeEvent.eventDate, activeEvent.precision)} ·{" "}
            {LIFE_EVENT_CATEGORY_LABELS[activeEvent.category]}
          </>
        ) : (
          "Select a pin to name the event. Hover a band for its period."
        )}
      </p>
    </div>
  );
}

function bandShort(rowLabel: string, b: ArcBand): string {
  if (rowLabel === "Profection" || rowLabel === "Personal year") return b.key;
  if (rowLabel === "Pinnacle") return `${b.key} · c${b.lord}`;
  if (rowLabel === "Firdaria") return lordName(b.key);
  return signName(b.key);
}

function bandTitle(rowLabel: string, b: ArcBand): string {
  const span = `${new Date(b.startUtc).getUTCFullYear()}–${new Date(b.endUtc).getUTCFullYear()}`;
  if (rowLabel === "Profection") {
    return `${ORDINAL[Number(b.key) - 1]}-house profection year (${span})`;
  }
  if (rowLabel === "Firdaria") {
    return `${lordName(b.key)} firdaria period (${span})`;
  }
  if (rowLabel === "Pinnacle") {
    return `Pinnacle ${b.key}, challenge ${b.lord} (${span})`;
  }
  if (rowLabel === "Personal year") {
    return `Personal year ${b.key} (${new Date(b.startUtc).getUTCFullYear()})`;
  }
  const marks = [b.peak ? "peak period" : null, b.loosedBond ? "loosed the bond" : null]
    .filter(Boolean)
    .join(", ");
  return `Releasing in ${signName(b.key)}${b.lord ? `, ruled by ${lordName(b.lord)}` : ""} (${span})${marks ? ` — ${marks}` : ""}`;
}
