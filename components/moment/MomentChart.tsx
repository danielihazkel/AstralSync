"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { HouseSystem } from "@astralsync/astro-core";
import LazyChartWheel from "@/components/chart/LazyChartWheel";
import CitySearch from "@/components/onboarding/CitySearch";
import { loadChartSettings } from "@/lib/chartSettings";
import { loadHomeLocation } from "@/lib/homeLocation";
import type { HoraryNote } from "@/lib/horary";
import type { MomentChart as Cast } from "@/lib/momentChart";
import { momentFromQuery, momentQuery, type MomentPlace } from "@/lib/momentQuery";
import styles from "./moment.module.css";

/** Minutes east of UTC → "UTC+3", "UTC−4:30". */
function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const m = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

type Computed = { cast: Cast; notes: HoraryNote[] } | { error: true };

/**
 * The chart of any moment — an event, a question, the sky right now — at a
 * chosen place, with no profile behind it. Everything is computed in the
 * browser (lib/momentChart, dynamic-imported like the ephemeris); the
 * moment lives in the URL so it can be bookmarked, and "Save as a profile"
 * hands it to the onboarding wizard prefilled.
 */
export default function MomentChart() {
  const searchParams = useSearchParams();
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [place, setPlace] = useState<MomentPlace | null>(null);
  const [houseSystem, setHouseSystem] = useState<HouseSystem>("placidus");
  const [picking, setPicking] = useState(false);
  const [ready, setReady] = useState(false);
  const [computed, setComputed] = useState<Computed | null>(null);

  // Seed once, after mount: the URL's moment, else now at the home
  // location (localStorage is client-only, so the server render is empty).
  useEffect(() => {
    void (async () => {
      const { wallNowIn } = await import("@/lib/momentChart");
      const fromUrl = momentFromQuery(searchParams);
      const startPlace = fromUrl.place ?? loadHomeLocation();
      const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let now: { date: string; time: string };
      try {
        now = wallNowIn(startPlace?.tzIana ?? browserZone);
      } catch {
        // A stored zone this runtime does not know: read the browser's clock
        // rather than leave the page on "Reading the clock…".
        now = wallNowIn(browserZone);
      }
      setPlace(startPlace);
      setDate(fromUrl.date ?? now.date);
      setTime(fromUrl.time ?? now.time);
      setHouseSystem(loadChartSettings().defaultHouseSystem);
      setReady(true);
    })();
    // Seeded from the first URL only; later edits write the URL themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || date === null || time === null || place === null) return;
    let cancelled = false;
    void (async () => {
      const [{ castMoment }, { computeVoidOfCourse }, { horaryConsiderations }] =
        await Promise.all([
          import("@/lib/momentChart"),
          import("@/lib/today"),
          import("@/lib/horary"),
        ]);
      if (cancelled) return;
      window.history.replaceState(null, "", `?${momentQuery({ date, time, place })}`);
      try {
        const cast = castMoment({ date, time, place, houseSystem });
        setComputed({
          cast,
          notes: horaryConsiderations(cast.chart, computeVoidOfCourse(cast.utc)),
        });
      } catch {
        setComputed({ error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, date, time, place, houseSystem]);

  async function toNow() {
    const { wallNowIn } = await import("@/lib/momentChart");
    const now = wallNowIn(place?.tzIana ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setDate(now.date);
    setTime(now.time);
  }

  if (!ready) return <p className={styles.muted}>Reading the clock…</p>;

  const saveHref =
    date !== null && time !== null && place !== null
      ? `/onboarding?${momentQuery({ date, time, place })}`
      : null;

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <label>
          Date{" "}
          <input
            type="date"
            value={date ?? ""}
            min="1700-01-01"
            max="2200-12-31"
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <label>
          Time{" "}
          <input
            type="time"
            value={time ?? ""}
            onChange={(e) => e.target.value && setTime(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => void toNow()}>
          Now
        </button>
      </div>

      <div className={styles.placeRow}>
        {picking || place === null ? (
          <div className={styles.picker}>
            <CitySearch
              selected={null}
              onSelect={(city) => {
                setPlace({ label: city.label, lat: city.lat, lng: city.lng, tzIana: city.tzIana });
                setPicking(false);
              }}
              searchLabel="Search a place for the chart"
              manualLabel="Can’t find the place? Enter coordinates"
            />
            {place !== null && (
              <button type="button" className={styles.linkButton} onClick={() => setPicking(false)}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <p>
            At <strong>{place.label}</strong>{" "}
            <button type="button" className={styles.linkButton} onClick={() => setPicking(true)}>
              change place
            </button>
          </p>
        )}
      </div>

      {place === null ? (
        <p className={styles.muted}>Pick a place to cast the chart — the houses need one.</p>
      ) : computed === null ? (
        <p className={styles.muted}>Casting…</p>
      ) : "error" in computed ? (
        <p className={styles.muted}>This moment could not be cast.</p>
      ) : (
        <>
          <p className={styles.muted}>
            {computed.cast.utc.toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
            {offsetLabel(computed.cast.offsetMinutes)} at the place
            {computed.cast.chart.tzWarnings.includes("dst_gap") &&
              " · that clock time never happened (the clocks went forward); cast for the moment just after"}
            {computed.cast.chart.tzWarnings.includes("dst_ambiguous") &&
              " · that clock time happened twice (the clocks went back); cast for the first"}
          </p>
          <LazyChartWheel
            chart={computed.cast.chart}
            points={computed.cast.points}
            downloadName={`chart ${date} ${time}`}
          />
          <section className={styles.notes} aria-labelledby="considerations">
            <h2 id="considerations" className={styles.notesTitle}>
              Considerations before judgment
            </h2>
            {computed.notes.length === 0 ? (
              <p className={styles.muted}>
                None of the traditional cautions apply: the Ascendant is mid-sign,
                the Moon is not void or in the via combusta, and Saturn is off the
                1st–7th axis.
              </p>
            ) : (
              <ul>
                {computed.notes.map((n) => (
                  <li key={n.id}>{n.text}</li>
                ))}
              </ul>
            )}
            <p className={styles.muted}>
              The horary tradition&rsquo;s warnings that a chart may be unfit to
              judge — read them as cautions, not verdicts.
            </p>
          </section>
          {saveHref && (
            <p>
              <Link href={saveHref}>Save this moment as a profile →</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
