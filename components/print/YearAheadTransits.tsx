"use client";

import { useEffect, useState } from "react";
import type { Placement } from "@astralsync/astro-core";
import type { CalendarAspectEvent } from "@/lib/transitCalendarCore";
import { ASPECT_NAMES, PLANET_NAMES } from "@/components/format";

/**
 * The year-ahead report's exact transit list: every perfection of the
 * scanned planets (Sun–Pluto, no Moon) against the natal chart for the next
 * twelve months, grouped by month. Computed in-browser from the bundled
 * engine (the Today-dashboard pattern) because a year-long scan is too heavy
 * to run per server request — the page shows a progress line until it lands.
 */
export default function YearAheadTransits({
  placements,
}: {
  placements: Placement[];
}) {
  const [events, setEvents] = useState<CalendarAspectEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { scanAspectEvents } = await import("@/lib/transitCalendarCore");
      // Let the progress line paint before the multi-second sync scan.
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;
      const from = new Date();
      const to = new Date(from.getTime() + 365 * 86_400_000);
      setEvents(scanAspectEvents(placements, from, to));
    })();
    return () => {
      cancelled = true;
    };
  }, [placements]);

  if (events === null) {
    return <p>Scanning the year ahead… this takes a few seconds.</p>;
  }
  if (events.length === 0) {
    return <p>No exact outer-planet transit in the next twelve months.</p>;
  }

  const months: Array<{ label: string; events: CalendarAspectEvent[] }> = [];
  for (const e of events) {
    const label = new Date(e.utc).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    const last = months[months.length - 1];
    if (last && last.label === label) last.events.push(e);
    else months.push({ label, events: [e] });
  }

  return (
    <div>
      {months.map((m) => (
        <div key={m.label}>
          <h3>{m.label}</h3>
          <ul>
            {m.events.map((e) => (
              <li key={`${e.a}-${e.b}-${e.type}-${e.utc}`}>
                {new Date(e.utc).toLocaleDateString(undefined, {
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
        </div>
      ))}
      <p>
        Sun through Pluto against the natal chart; the Moon&rsquo;s ~2,500
        yearly contacts are left to the monthly calendar.
      </p>
    </div>
  );
}
