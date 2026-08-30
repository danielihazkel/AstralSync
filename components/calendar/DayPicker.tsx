"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ElectionalDay,
  ElectionalNatal,
  Intent,
  ScoredWindow,
} from "@/lib/electional";
import type { HomeLocation } from "@/lib/today";
import { loadHomeLocation } from "@/lib/homeLocation";
import { CLASSICAL_PLANET_LABELS, SIGN_NAMES } from "@/components/format";
import HomeLocationPicker from "@/components/settings/HomeLocationPicker";
import { buildIcs } from "@/lib/ics";
import { downloadIcs } from "@/components/downloadIcs";
import { electionalDayIcsEvents } from "./calendarIcsEvents";
import styles from "./calendar.module.css";

/** Local copy of the intent list (lib/electional's INTENT_LABELS is a value
 *  export in an ephemeris-importing module); shared with the almanac. */
export const INTENT_OPTIONS: Array<{ value: Intent; label: string }> = [
  { value: "communication", label: "Communication & contracts" },
  { value: "love", label: "Love & beauty" },
  { value: "action", label: "Action & courage" },
  { value: "growth", label: "Growth & fortune" },
  { value: "commitment", label: "Commitment & structure" },
  { value: "visibility", label: "Visibility & leadership" },
  { value: "home", label: "Home & family" },
];

/** One selectable chart for natal-aware scoring, built from the lean
 *  profile list (`GET /api/profiles` already ships latest placements). */
interface ElectionalProfile {
  id: number;
  displayName: string;
  /** The primary ("my") chart is preselected once the list loads. */
  isPrimary: boolean;
  natal: ElectionalNatal;
}

interface ProfileListEntry {
  id: number;
  displayName: string;
  isSolarChart: boolean;
  latestVersion: number;
  isPrimary?: boolean;
  placements: Array<{ planet: string; longitude: number }> | null;
}

function toElectionalProfiles(list: ProfileListEntry[]): ElectionalProfile[] {
  const out: ElectionalProfile[] = [];
  for (const p of list) {
    const sun = p.placements?.find((pl) => pl.planet === "sun");
    if (!sun) continue;
    const moon = p.placements?.find((pl) => pl.planet === "moon");
    out.push({
      id: p.id,
      displayName: p.displayName,
      isPrimary: p.isPrimary === true,
      natal: {
        key: `${p.id}v${p.latestVersion}`,
        sunLongitude: sun.longitude,
        // A solar chart's Moon is a noon estimate — never build a personal
        // factor on it.
        moonLongitude: p.isSolarChart ? null : (moon?.longitude ?? null),
      },
    });
  }
  return out;
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function timeRange(w: ScoredWindow): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(w.startUtc)}–${fmt(w.endUtc)}`;
}

const VERDICT_CLASS: Record<ScoredWindow["verdict"], string> = {
  good: styles.windowGood,
  mixed: styles.windowMixed,
  avoid: styles.windowAvoid,
};

/**
 * The Sky Calendar's "Day picker" view: rule-based electional windows for
 * one local day. With a home location the day splits into 24 planetary
 * hours; without one it scores the whole day. Every window lists its
 * factors — nothing is a black box.
 */
export default function DayPicker() {
  const [dateStr, setDateStr] = useState(todayStr());
  const [intent, setIntent] = useState<Intent | "">("");
  const [location, setLocation] = useState<HomeLocation | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<ElectionalDay | null>(null);
  // Natal-aware mode: charts fetched once when online; the selector simply
  // stays hidden offline — the mundane picker keeps its offline promise.
  const [profiles, setProfiles] = useState<ElectionalProfile[]>([]);
  const [profileId, setProfileId] = useState<number | "">("");

  useEffect(() => {
    setLocation(loadHomeLocation());
    setLoaded(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profiles");
        if (!res.ok) return;
        const body = (await res.json()) as { profiles: ProfileListEntry[] };
        if (cancelled) return;
        const list = toElectionalProfiles(body.profiles);
        setProfiles(list);
        const primary = list.find((p) => p.isPrimary);
        if (primary) setProfileId((cur) => (cur === "" ? primary.id : cur));
      } catch {
        // Offline or unreachable: natal-aware mode is simply unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recompute = useCallback(async () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return;
    setResult(null);
    const { scoreDay } = await import("@/lib/electional");
    setResult(
      scoreDay({
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        location,
        intent: intent === "" ? null : intent,
        natal:
          profiles.find((p) => p.id === profileId)?.natal ?? null,
      }),
    );
  }, [dateStr, intent, location, profiles, profileId]);

  useEffect(() => {
    if (!loaded) return;
    void recompute();
  }, [loaded, recompute]);

  return (
    <div className={styles.panel}>
      <div className={styles.locationRow}>
        <label>
          Day{" "}
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </label>
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
        {profiles.length > 0 && (
          <label>
            For{" "}
            <select
              value={profileId}
              onChange={(e) =>
                setProfileId(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            >
              <option value="">Anyone (mundane)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
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

      {result === null ? (
        <p className={styles.muted}>Scoring the day…</p>
      ) : (
        <>
          <p>
            Moon in {SIGN_NAMES[result.moonSign]} ·{" "}
            {CLASSICAL_PLANET_LABELS[result.dayRuler]} rules the day
            {result.mercuryRetrograde && " · Mercury retrograde"}{" "}
            <button
              onClick={() => {
                const label =
                  INTENT_OPTIONS.find((o) => o.value === intent)?.label ?? null;
                downloadIcs(
                  buildIcs(electionalDayIcsEvents(result, label), {
                    calName: `AstralSync electional — ${result.date}`,
                  }),
                  `astralsync-electional-${result.date}`,
                );
              }}
            >
              Export .ics
            </button>
          </p>
          <ul className={styles.windowList}>
            {result.windows.map((w) => (
              <li
                key={w.startUtc}
                className={`${styles.window} ${VERDICT_CLASS[w.verdict]}`}
              >
                <span>
                  <strong>{timeRange(w)}</strong>
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
            Rule-based, not a prediction: void-of-course Moon marks a window
            “avoid”; the Moon’s applying aspect, the planetary hour and day
            ruler for your intent, and Mercury retrograde do the rest. Moon
            sign is shown but never scored.
            {profileId !== "" &&
              " With a chart selected, factors marked “your natal” add that person's transits: benefics supporting or malefics afflicting the natal Sun and Moon, and the Moon perfecting a contact to them inside a window."}
          </p>
        </>
      )}
    </div>
  );
}
