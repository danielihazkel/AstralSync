"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { momentHref } from "./atDate";

/** How many charts the row names before it stops — a long list of saved
 *  profiles would bury the page it sits on. */
const MAX_CHARTS = 5;

interface ChartRef {
  id: number;
  displayName: string;
  isPrimary: boolean;
}

/**
 * "Your charts on this day": for a calendar date, links into each saved
 * profile's Transits, Cycles and Journal pinned to that day. The almanac is
 * about the sky in general; this is the hand-off to what the day meant for
 * a particular chart. Primary chart first; renders nothing offline or with
 * no profiles.
 */
export default function DayProfileLinks({ date }: { date: string }) {
  const [charts, setCharts] = useState<ChartRef[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profiles?limit=50")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { profiles?: ChartRef[] } | null) => {
        if (cancelled || !body?.profiles) return;
        setCharts(
          body.profiles
            .map(({ id, displayName, isPrimary }) => ({ id, displayName, isPrimary }))
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
        );
      })
      .catch(() => {
        // Offline — the day's sky still stands on its own.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (charts === null || charts.length === 0) return null;
  const shown = charts.slice(0, MAX_CHARTS);

  return (
    <nav aria-label="Your charts on this day">
      <p>
        Your charts on this day:{" "}
        {shown.map((c, i) => (
          <span key={c.id}>
            {i > 0 && " · "}
            <strong>{c.displayName}</strong>{" "}
            <Link href={momentHref(c.id, "transits", date)}>transits</Link>,{" "}
            <Link href={momentHref(c.id, "cycles", date)}>cycles</Link>,{" "}
            <Link href={`/profiles/${c.id}?tab=journal&date=${date}`}>journal</Link>
          </span>
        ))}
        {charts.length > shown.length && ` and ${charts.length - shown.length} more`}
      </p>
    </nav>
  );
}
