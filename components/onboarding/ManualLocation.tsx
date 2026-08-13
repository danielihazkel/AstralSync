"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CityOption } from "./types";
import styles from "./wizard.module.css";

function parseCoord(raw: string, min: number, max: number): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Coordinate entry for birthplaces the 15,000+-inhabitant GeoNames dataset
 * doesn't cover — previously a hard onboarding dead-end. The timezone is
 * suggested from the coordinates (`/api/timezone`) and can be overridden
 * from the runtime's full IANA zone list; from here on the wizard treats
 * the result exactly like a picked city (`geonameId: null` is already the
 * stored shape for edit-mode profiles).
 */
export default function ManualLocation({
  onSelect,
}: {
  onSelect: (city: CityOption) => void;
}) {
  const [latRaw, setLatRaw] = useState("");
  const [lngRaw, setLngRaw] = useState("");
  const [tz, setTz] = useState("");
  const [noZone, setNoZone] = useState(false);
  // A zone the user picked by hand is never clobbered by a later suggestion.
  const tzPickedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const lat = parseCoord(latRaw, -90, 90);
  const lng = parseCoord(lngRaw, -180, 180);

  useEffect(() => {
    abortRef.current?.abort();
    if (lat === null || lng === null) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/timezone?lat=${lat}&lng=${lng}`, {
          signal: controller.signal,
        });
        if (res.status === 404) {
          setNoZone(true);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setNoZone(false);
        if (data.tzIana && !tzPickedRef.current) setTz(data.tzIana);
      } catch {
        // Aborted or offline — the user can still pick a zone by hand.
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lat, lng]);

  const ready = lat !== null && lng !== null && tz !== "";

  return (
    <div>
      <div className={styles.coordRow}>
        <label className={styles.field}>
          Latitude (−90 to 90, north positive)
          <input
            type="text"
            inputMode="decimal"
            value={latRaw}
            onChange={(e) => setLatRaw(e.target.value)}
            placeholder="e.g. 48.71"
            aria-invalid={latRaw.trim() !== "" && lat === null}
          />
        </label>
        <label className={styles.field}>
          Longitude (−180 to 180, east positive)
          <input
            type="text"
            inputMode="decimal"
            value={lngRaw}
            onChange={(e) => setLngRaw(e.target.value)}
            placeholder="e.g. 9.99"
            aria-invalid={lngRaw.trim() !== "" && lng === null}
          />
        </label>
      </div>
      <label className={styles.field}>
        Time zone
        <select
          value={tz}
          onChange={(e) => {
            setTz(e.target.value);
            tzPickedRef.current = true;
          }}
        >
          <option value="" disabled>
            {lat !== null && lng !== null
              ? "Suggesting from coordinates…"
              : "Enter coordinates or pick a zone"}
          </option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      {noZone && (
        <p className={styles.warning}>
          These coordinates fall outside every timezone region (open ocean?)
          — pick the zone that applied at the birthplace.
        </p>
      )}
      <p className={styles.hint}>
        Tip: an online map shows coordinates for any village — copy them here.
        The timezone is suggested automatically and rarely needs changing.
      </p>
      <button
        type="button"
        className={styles.nextBtn}
        disabled={!ready}
        onClick={() => {
          if (lat === null || lng === null) return;
          onSelect({
            geonameId: null,
            label: `Custom location (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`,
            lat,
            lng,
            tzIana: tz,
          });
        }}
      >
        Use this location
      </button>
    </div>
  );
}
