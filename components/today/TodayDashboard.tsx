"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeLocation, TodayProfile, TodaySky } from "@/lib/today";
// Type-only: the value import stays dynamic so the scan engine loads only
// when the digest is opened.
import type { CalendarAspectEvent } from "@/lib/transitCalendarCore";
import {
  ASPECT_NAMES,
  CLASSICAL_PLANET_LABELS,
  PLANET_NAMES,
  SIGN_NAMES,
} from "@/components/format";
import { PLANET_GLYPH_CHARS, SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import HomeLocationPicker from "@/components/settings/HomeLocationPicker";
import type { Sign } from "@astralsync/astro-core";
import { loadHomeLocation } from "@/lib/homeLocation";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { downloadIcs } from "@/components/downloadIcs";
import styles from "./today.module.css";

interface UpcomingProfile {
  profileId: number;
  displayName: string;
  events: CalendarAspectEvent[];
}

function upcomingIcsEvents(upcoming: UpcomingProfile[]): IcsEvent[] {
  return upcoming.flatMap((u) =>
    u.events.map((e) => ({
      uid: `upcoming-${u.profileId}-${e.a}-${e.b}-${e.type}-${e.utc}`,
      summary: `${PLANET_NAMES[e.a]} ${ASPECT_NAMES[e.type].toLowerCase()} natal ${PLANET_NAMES[e.b]} (${u.displayName})${e.retrograde ? " ℞" : ""}`,
      start: e.utc,
    })),
  );
}

/**
 * The home page's "Today" strip: current Moon, Hebrew date, planetary hour,
 * and notable transits across the saved profiles. Everything is computed
 * in-browser from the bundled engines (dynamic import keeps the ephemeris
 * off other pages), so it works offline and survives midnight. The planetary
 * hour needs a "home location", picked once and kept in localStorage — birth
 * cities are never assumed.
 */
export default function TodayDashboard({
  profiles,
  primaryId = null,
}: {
  profiles: TodayProfile[];
  /** The primary ("my") chart leads each per-profile list; the rest fold
   *  into a collapsed "other charts" group so the strip stays short. */
  primaryId?: number | null;
}) {
  const [sky, setSky] = useState<TodaySky | null>(null);
  const [location, setLocation] = useState<HomeLocation | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The 7-day digest scans ~90 planet pairs per profile, so it computes
  // lazily on first expand and is kept for the session.
  const [upcoming, setUpcoming] = useState<UpcomingProfile[] | null>(null);
  const upcomingStarted = useRef(false);

  const computeUpcoming = useCallback(async () => {
    if (upcomingStarted.current) return;
    upcomingStarted.current = true;
    const { scanAspectEvents } = await import("@/lib/transitCalendarCore");
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 86_400_000);
    setUpcoming(
      profiles.map((p) => ({
        profileId: p.id,
        displayName: p.displayName,
        events: scanAspectEvents(p.placements, from, to),
      })),
    );
  }, [profiles]);

  useEffect(() => {
    setLocation(loadHomeLocation());
    setLoaded(true);
  }, []);

  const recompute = useCallback(
    async (loc: HomeLocation | null) => {
      const [{ computeToday }, { loadOrbSettings }] = await Promise.all([
        import("@/lib/today"),
        import("@/lib/orbSettings"),
      ]);
      const orbs = loadOrbSettings();
      setSky(
        computeToday(new Date(), loc, profiles, {
          luminary: orbs.luminary,
          default: orbs.default,
        }),
      );
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

  if (!sky) {
    return (
      <section className={styles.strip} aria-label="Today">
        <p className={styles.muted}>Reading today’s sky…</p>
      </section>
    );
  }

  const moonGlyph = SIGN_GLYPH_CHARS[sky.moon.sign];
  const mazalSign = SIGN_GLYPH_CHARS[sky.hebrew.mazal.sign as Sign] ?? "";
  // Fold only when a primary exists and there is something to fold.
  const splitByPrimary = <T extends { profileId: number }>(items: T[]) => {
    if (primaryId === null) return { lead: items, rest: [] as T[] };
    const lead = items.filter((i) => i.profileId === primaryId);
    if (lead.length === 0) return { lead: items, rest: [] as T[] };
    return { lead, rest: items.filter((i) => i.profileId !== primaryId) };
  };
  const transitGroups = splitByPrimary(sky.transits);
  const upcomingGroups = upcoming ? splitByPrimary(upcoming) : null;

  const transitItems = (items: typeof sky.transits) =>
    items.map((t) => (
      <li key={t.profileId}>
        <span className={styles.who}>{t.displayName}:</span>{" "}
        {t.aspects.map((a, i) => (
          <span key={`${a.a}-${a.b}-${a.type}`}>
            {i > 0 && ", "}
            {PLANET_NAMES[a.a]} {ASPECT_NAMES[a.type].toLowerCase()} natal{" "}
            {PLANET_NAMES[a.b]}
            <span className={styles.orb}> ({a.orb.toFixed(1)}°)</span>
          </span>
        ))}
      </li>
    ));

  const upcomingItems = (items: UpcomingProfile[]) =>
    items.map((u) => (
      <div key={u.profileId}>
        <p className={styles.who}>{u.displayName}</p>
        {u.events.length === 0 ? (
          <p className={styles.muted}>
            No exact transit this week (the Moon is not scanned here).
          </p>
        ) : (
          <ul className={styles.transitList}>
            {u.events.map((e) => (
              <li key={`${e.a}-${e.b}-${e.type}-${e.utc}`}>
                {new Date(e.utc).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                : {PLANET_NAMES[e.a]} {ASPECT_NAMES[e.type].toLowerCase()}{" "}
                natal {PLANET_NAMES[e.b]}
                {e.retrograde && " ℞"}
                {e.pass.of > 1 && ` (pass ${e.pass.n} of ${e.pass.of})`}
              </li>
            ))}
          </ul>
        )}
      </div>
    ));

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
              <HomeLocationPicker
                onPick={(loc) => {
                  setLocation(loc);
                  setPicking(false);
                }}
                onCancel={() => setPicking(false)}
                cancelClassName={styles.linkButton}
              />
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

      {sky.eclipses.length > 0 && (
        <div className={styles.transits} aria-label="Upcoming eclipses">
          <h3 className={styles.cardTitle}>Eclipses ahead</h3>
          <ul className={styles.transitList}>
            {sky.eclipses.map((e) => (
              <li key={e.peakUtc}>
                {e.type[0].toUpperCase() + e.type.slice(1)} {e.kind} eclipse ·{" "}
                <span className={styles.glyph} aria-hidden="true">
                  {SIGN_GLYPH_CHARS[e.sign] + "︎"}
                </span>
                {Math.floor(e.degreeInSign)}° {SIGN_NAMES[e.sign]} on{" "}
                {new Date(e.peakUtc).toLocaleDateString(undefined, {
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
          <ul className={styles.transitList}>{transitItems(transitGroups.lead)}</ul>
          {transitGroups.rest.length > 0 && (
            <details>
              <summary className={styles.muted}>
                Other charts ({transitGroups.rest.length})
              </summary>
              <ul className={styles.transitList}>
                {transitItems(transitGroups.rest)}
              </ul>
            </details>
          )}
        </div>
      )}

      {profiles.length > 0 && (
        <details
          className={styles.transits}
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open) void computeUpcoming();
          }}
        >
          <summary className={styles.cardTitle}>Upcoming 7 days</summary>
          {upcoming === null || upcomingGroups === null ? (
            <p className={styles.muted}>Scanning the week ahead…</p>
          ) : (
            <>
              {upcomingItems(upcomingGroups.lead)}
              {upcomingGroups.rest.length > 0 && (
                <details>
                  <summary className={styles.muted}>
                    Other charts ({upcomingGroups.rest.length})
                  </summary>
                  {upcomingItems(upcomingGroups.rest)}
                </details>
              )}
              {upcoming.some((u) => u.events.length > 0) && (
                <button
                  className={styles.linkButton}
                  onClick={() =>
                    downloadIcs(
                      buildIcs(upcomingIcsEvents(upcoming), {
                        calName: "AstralSync — upcoming transits",
                      }),
                      "astralsync-upcoming",
                    )
                  }
                >
                  Export .ics
                </button>
              )}
            </>
          )}
        </details>
      )}
    </section>
  );
}
