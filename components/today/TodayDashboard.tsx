"use client";

import { useCallback, useEffect, useState } from "react";
import type { HomeLocation, TodayProfile, TodaySky } from "@/lib/today";
import {
  ASPECT_NAMES,
  CLASSICAL_PLANET_LABELS,
  PLANET_NAMES,
  SIGN_NAMES,
} from "@/components/format";
import { PLANET_GLYPH_CHARS, SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import CitySearch from "@/components/onboarding/CitySearch";
import type { CityOption } from "@/components/onboarding/types";
import type { Sign } from "@astralsync/astro-core";
import styles from "./today.module.css";

const LOCATION_KEY = "today.homeLocation";

function loadLocation(): HomeLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeLocation;
    return typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      typeof parsed.tzIana === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * The home page's "Today" strip: current Moon, Hebrew date, planetary hour,
 * and notable transits across the saved profiles. Everything is computed
 * in-browser from the bundled engines (dynamic import keeps the ephemeris
 * off other pages), so it works offline and survives midnight. The planetary
 * hour needs a "home location", picked once and kept in localStorage — birth
 * cities are never assumed.
 */
export default function TodayDashboard({ profiles }: { profiles: TodayProfile[] }) {
  const [sky, setSky] = useState<TodaySky | null>(null);
  const [location, setLocation] = useState<HomeLocation | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLocation(loadLocation());
    setLoaded(true);
  }, []);

  const recompute = useCallback(
    async (loc: HomeLocation | null) => {
      const { computeToday } = await import("@/lib/today");
      setSky(computeToday(new Date(), loc, profiles));
    },
    [profiles],
  );

  // Compute on mount and re-check each minute (the planetary hour moves).
  useEffect(() => {
    if (!loaded) return;
    void recompute(location);
    const timer = setInterval(() => void recompute(location), 60_000);
    return () => clearInterval(timer);
  }, [loaded, location, recompute]);

  function pickCity(city: CityOption) {
    const loc: HomeLocation = {
      label: city.label,
      lat: city.lat,
      lng: city.lng,
      tzIana: city.tzIana,
    };
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
    setLocation(loc);
    setPicking(false);
  }

  if (!sky) {
    return (
      <section className={styles.strip} aria-label="Today">
        <p className={styles.muted}>Reading today’s sky…</p>
      </section>
    );
  }

  const moonGlyph = SIGN_GLYPH_CHARS[sky.moon.sign];
  const mazalSign = SIGN_GLYPH_CHARS[sky.hebrew.mazal.sign as Sign] ?? "";

  return (
    <section className={styles.strip} aria-label="Today">
      <div className={styles.cards}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Moon</h3>
          <p className={styles.big}>
            <span className={styles.glyph} aria-hidden="true">
              {moonGlyph + "︎"}
            </span>
            {SIGN_NAMES[sky.moon.sign]}
          </p>
          <p className={styles.muted}>
            {sky.moon.phaseName} · {Math.round(sky.moon.illumination * 100)}% lit
          </p>
          <p className={styles.muted}>
            {sky.moon.nextQuarter.name} on{" "}
            {new Date(sky.moon.nextQuarter.atUtc).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
          {sky.moon.voidOfCourse && (
            <p className={styles.muted}>
              Void of course until{" "}
              {new Date(sky.moon.voidOfCourse.until).toLocaleTimeString(
                undefined,
                { hour: "2-digit", minute: "2-digit" },
              )}{" "}
              → enters {SIGN_NAMES[sky.moon.voidOfCourse.nextSign]}
            </p>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Hebrew date</h3>
          <p className={styles.big} lang="he">
            {sky.hebrew.parts.renderGematriya}
          </p>
          <p className={styles.muted}>
            {sky.hebrew.parts.day} {sky.hebrew.parts.monthName}{" "}
            {sky.hebrew.parts.year} ·{" "}
            <span className={styles.glyph} aria-hidden="true">
              {mazalSign + "︎"}
            </span>
            mazal {sky.hebrew.mazal.mazal}
          </p>
          {sky.hebrew.approximate && (
            <p className={styles.muted}>
              After sunset the next Hebrew day begins — set a location to
              account for it.
            </p>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Planetary hour</h3>
          {sky.hour ? (
            <>
              <p className={styles.big}>
                <span className={styles.glyph} aria-hidden="true">
                  {PLANET_GLYPH_CHARS[sky.hour.planet] + "︎"}
                </span>
                {CLASSICAL_PLANET_LABELS[sky.hour.planet]}
              </p>
              <p className={styles.muted}>
                {sky.hour.hourIndex}
                {sky.hour.hourIndex === 1
                  ? "st"
                  : sky.hour.hourIndex === 2
                    ? "nd"
                    : sky.hour.hourIndex === 3
                      ? "rd"
                      : "th"}{" "}
                hour of the {sky.hour.isDay ? "day" : "night"} · day ruler{" "}
                {CLASSICAL_PLANET_LABELS[sky.hour.dayRuler]}
              </p>
              <p className={styles.muted}>
                until{" "}
                {new Date(sky.hour.endUtc).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </>
          ) : location ? (
            <p className={styles.muted}>
              No planetary hours here today (no sunrise or sunset).
            </p>
          ) : (
            <p className={styles.muted}>
              Set your location to see the current planetary hour.
            </p>
          )}
          {picking ? (
            <div className={styles.picker}>
              <CitySearch selected={null} onSelect={pickCity} />
              <button
                className={styles.linkButton}
                onClick={() => setPicking(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className={styles.linkButton}
              onClick={() => setPicking(true)}
            >
              {location ? `Location: ${location.label} — change` : "Set location"}
            </button>
          )}
        </div>
      </div>

      {sky.stations.length > 0 && (
        <div className={styles.transits} aria-label="Upcoming stations">
          <h3 className={styles.cardTitle}>Stations this week</h3>
          <ul className={styles.transitList}>
            {sky.stations.map((s) => (
              <li key={`${s.planet}-${s.kind}`}>
                {PLANET_NAMES[s.planet]} stations {s.kind} around{" "}
                {new Date(s.aroundUtc).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sky.transits.length > 0 && (
        <div className={styles.transits} aria-label="Notable transits">
          <h3 className={styles.cardTitle}>In the sky for your charts</h3>
          <ul className={styles.transitList}>
            {sky.transits.map((t) => (
              <li key={t.profileId}>
                <span className={styles.who}>{t.displayName}:</span>{" "}
                {t.aspects.map((a, i) => (
                  <span key={`${a.a}-${a.b}-${a.type}`}>
                    {i > 0 && ", "}
                    {PLANET_NAMES[a.a]} {ASPECT_NAMES[a.type].toLowerCase()}{" "}
                    natal {PLANET_NAMES[a.b]}
                    <span className={styles.orb}> ({a.orb.toFixed(1)}°)</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
