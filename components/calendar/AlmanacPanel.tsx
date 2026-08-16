"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AlmanacDay } from "@/lib/almanac";
import { addDaysCivil, isValidAlmanacDate } from "@/lib/almanacDate";
import type { ElectionalDay, Intent, ScoredWindow } from "@/lib/electional";
import { loadHomeLocation } from "@/lib/homeLocation";
import { buildIcs } from "@/lib/ics";
import type { HomeLocation } from "@/lib/today";
import {
  CLASSICAL_PLANET_LABELS,
  MAJOR_ANGLE_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
} from "@/components/format";
import { PLANET_GLYPH_CHARS, SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import { downloadIcs } from "@/components/downloadIcs";
import HomeLocationPicker from "@/components/settings/HomeLocationPicker";
import {
  almanacDayIcsEvents,
  electionalDayIcsEvents,
} from "./calendarIcsEvents";
import { dayTitle, timeOf } from "./calendarFormat";
import { INTENT_OPTIONS } from "./DayPicker";
import styles from "./calendar.module.css";

const VERDICT_CLASS: Record<ScoredWindow["verdict"], string> = {
  good: styles.windowGood,
  mixed: styles.windowMixed,
  avoid: styles.windowAvoid,
};

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The day almanac: everything the sky does on one civil day. The moon story
 * and the mundane events come from lib/almanac (shared month cache — free
 * when the month grid already computed it); the electional windows /
 * planetary hours come from lib/electional.scoreDay, recomputed
 * independently when location or intent changes. The chosen intent rides in
 * ?intent= so prev/next day links keep it and a flavored day is linkable.
 */
export default function AlmanacPanel({ date }: { date: string }) {
  const searchParams = useSearchParams();
  const rawIntent = searchParams.get("intent") ?? "";
  const intent: Intent | "" = INTENT_OPTIONS.some((o) => o.value === rawIntent)
    ? (rawIntent as Intent)
    : "";

  const [almanac, setAlmanac] = useState<AlmanacDay | null>(null);
  const [electional, setElectional] = useState<ElectionalDay | null>(null);
  const [location, setLocation] = useState<HomeLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setLocation(loadHomeLocation());
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAlmanac(null);
    void (async () => {
      const { computeAlmanacDay } = await import("@/lib/almanac");
      const day = computeAlmanacDay(date);
      if (!cancelled) setAlmanac(day);
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setElectional(null);
    void (async () => {
      const { scoreDay } = await import("@/lib/electional");
      const [y, m, d] = date.split("-").map(Number);
      const result = scoreDay({
        year: y,
        month: m,
        day: d,
        location,
        intent: intent === "" ? null : intent,
      });
      if (!cancelled) setElectional(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [date, loaded, location, intent]);

  function setIntent(next: Intent | "") {
    // The App Router's shallow-update path (the ProfileTabs pattern):
    // useSearchParams stays in sync with native replaceState.
    const url = new URL(window.location.href);
    if (next === "") url.searchParams.delete("intent");
    else url.searchParams.set("intent", next);
    window.history.replaceState(null, "", url);
  }

  const intentQuery = intent === "" ? "" : `?intent=${intent}`;
  const dayLink = (d: string) => `/calendar/${d}${intentQuery}`;
  const today = todayStr();
  const intentLabel =
    INTENT_OPTIONS.find((o) => o.value === intent)?.label ?? null;

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <span className={styles.monthLabel}>{dayTitle(date)}</span>
        <span>
          {isValidAlmanacDate(addDaysCivil(date, -1)) && (
            <Link href={dayLink(addDaysCivil(date, -1))} aria-label="Previous day">
              ‹ Prev
            </Link>
          )}{" "}
          <Link href="/calendar">Month view</Link>{" "}
          {date !== today && <Link href={dayLink(today)}>Today</Link>}{" "}
          {isValidAlmanacDate(addDaysCivil(date, 1)) && (
            <Link href={dayLink(addDaysCivil(date, 1))} aria-label="Next day">
              Next ›
            </Link>
          )}{" "}
          {almanac && electional && (
            <button
              onClick={() =>
                downloadIcs(
                  buildIcs(
                    [
                      ...almanacDayIcsEvents(almanac),
                      ...electionalDayIcsEvents(electional, intentLabel),
                    ],
                    { calName: `AstralSync almanac — ${date}` },
                  ),
                  `astralsync-almanac-${date}`,
                )
              }
            >
              Export .ics
            </button>
          )}
        </span>
      </div>

      {almanac === null ? (
        <p className={styles.muted}>Computing the day’s sky…</p>
      ) : (
        <div className={styles.cards}>
          <section className={styles.card} aria-label="Moon">
            <h2 className={styles.cardTitle}>Moon</h2>
            <p>
              <span aria-hidden="true">
                {SIGN_GLYPH_CHARS[almanac.moon.signAtNoon]}
              </span>{" "}
              Moon in {SIGN_NAMES[almanac.moon.signAtNoon]} at noon ·{" "}
              {almanac.phaseName},{" "}
              {Math.round(almanac.moon.illumination * 100)}% illuminated.
            </p>
            <ul className={styles.eventList}>
              {almanac.moon.quarter && (
                <li>
                  <span className={styles.time}>
                    {timeOf(almanac.moon.quarter.utc)}
                  </span>{" "}
                  {almanac.moon.quarter.name}
                </li>
              )}
              {almanac.moon.ingresses.map((i) => (
                <li key={i.utc}>
                  <span className={styles.time}>{timeOf(i.utc)}</span> Moon
                  enters {SIGN_NAMES[i.sign]}
                </li>
              ))}
              {almanac.moon.voc.map((w) => (
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
              {almanac.moon.eclipses.map((e) => (
                <li key={e.peakUtc} className={styles.eclipse}>
                  <span className={styles.time}>{timeOf(e.peakUtc)}</span>{" "}
                  {e.type[0].toUpperCase() + e.type.slice(1)} {e.kind} eclipse
                  at {Math.floor(e.degreeInSign)}° {SIGN_NAMES[e.sign]}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.card} aria-label="Aspects perfecting">
            <h2 className={styles.cardTitle}>Aspects perfecting</h2>
            {almanac.mundane.length === 0 ? (
              <p className={styles.muted}>
                No planet-to-planet aspect perfects today (Moon aspects are
                part of the void-of-course story).
              </p>
            ) : (
              <ul className={styles.eventList}>
                {almanac.mundane.map((h) => (
                  <li key={`${h.a}-${h.b}-${h.utc}`}>
                    <span className={styles.time}>{timeOf(h.utc)}</span>{" "}
                    <span aria-hidden="true">{PLANET_GLYPH_CHARS[h.a]}</span>{" "}
                    {PLANET_NAMES[h.a]}{" "}
                    {MAJOR_ANGLE_NAMES[h.angle] ?? `${h.angle}°`}{" "}
                    <span aria-hidden="true">{PLANET_GLYPH_CHARS[h.b]}</span>{" "}
                    {PLANET_NAMES[h.b]}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.card} aria-label="Ingresses and stations">
            <h2 className={styles.cardTitle}>Ingresses &amp; stations</h2>
            {almanac.ingresses.length === 0 &&
            almanac.stations.length === 0 ? (
              <p className={styles.muted}>
                No planet changes sign or direction today.
              </p>
            ) : (
              <ul className={styles.eventList}>
                {[
                  ...almanac.stations.map((s) => ({
                    utc: s.utc,
                    text: `${PLANET_NAMES[s.planet]} stations ${s.direction}`,
                  })),
                  ...almanac.ingresses.map((i) => ({
                    utc: i.utc,
                    text: `${PLANET_NAMES[i.planet]} enters ${SIGN_NAMES[i.sign]}`,
                  })),
                ]
                  .sort((a, b) => a.utc.localeCompare(b.utc))
                  .map((ev) => (
                    <li key={`${ev.utc}-${ev.text}`}>
                      <span className={styles.time}>{timeOf(ev.utc)}</span>{" "}
                      {ev.text}
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section
            className={`${styles.card} ${styles.cardWide}`}
            aria-label="Timing windows"
          >
            <h2 className={styles.cardTitle}>Timing windows</h2>
            <div className={styles.locationRow}>
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
            {electional === null ? (
              <p className={styles.muted}>Scoring the day…</p>
            ) : (
              <>
                <p>
                  {CLASSICAL_PLANET_LABELS[electional.dayRuler]} rules the day
                  {electional.mercuryRetrograde && " · Mercury retrograde"}
                </p>
                <ul className={styles.windowList}>
                  {electional.windows.map((w) => (
                    <li
                      key={w.startUtc}
                      className={`${styles.window} ${VERDICT_CLASS[w.verdict]}`}
                    >
                      <span>
                        <strong>
                          {timeOf(w.startUtc)}–{timeOf(w.endUtc)}
                        </strong>
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
                  Rule-based, not a prediction: void-of-course Moon marks a
                  window “avoid”; the Moon’s applying aspect, the planetary
                  hour and day ruler for your intent, and Mercury retrograde
                  do the rest.
                </p>
              </>
            )}
          </section>
        </div>
      )}

      <p className={styles.muted}>
        Times are shown in your device’s timezone; planetary hours follow the
        home location’s sun.
      </p>
    </div>
  );
}
