"use client";

import { useEffect, useRef, useState } from "react";
import ManualLocation from "./ManualLocation";
import type { CityOption } from "./types";
import styles from "./wizard.module.css";

interface CityResult {
  geonameId: number;
  name: string;
  countryCode: string;
  admin1: string;
  lat: number;
  lng: number;
  tzIana: string;
}

function labelFor(c: CityResult): string {
  return [c.name, c.admin1, c.countryCode].filter(Boolean).join(", ");
}

/**
 * Offline city search against the local GeoNames table (PRD §3.1) —
 * debounced prefix query, biggest cities first.
 */
export default function CitySearch({
  selected,
  onSelect,
}: {
  selected: CityOption | null;
  onSelect: (city: CityOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cities?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(data.cities ?? []);
      } catch {
        // Aborted or offline — keep the previous results.
      } finally {
        // On abort a newer effect run owns the searching state; clearing it
        // here would clobber that run's "Searching…" indicator.
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div>
      {selected && (
        <p className={styles.citySelected}>
          Birthplace: <strong>{selected.label}</strong>
          <span className={styles.cityCoords}>
            {" "}
            ({selected.lat.toFixed(2)}°, {selected.lng.toFixed(2)}° ·{" "}
            {selected.tzIana})
          </span>
        </p>
      )}
      {manual ? (
        <>
          <ManualLocation
            onSelect={(city) => {
              onSelect(city);
              setManual(false);
            }}
          />
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => setManual(false)}
          >
            Back to city search
          </button>
        </>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a city (min. 2 letters)…"
            aria-label="Search birth city"
            autoComplete="off"
            className={styles.cityInput}
          />
          {searching && <p className={styles.cityHint}>Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className={styles.cityHint}>
              No matching city. The offline dataset covers cities with 15,000+
              inhabitants — try the nearest larger town, or enter coordinates
              below.
            </p>
          )}
          <ul className={styles.cityResults}>
            {results.map((c) => (
              <li key={c.geonameId}>
                <button
                  type="button"
                  className={styles.cityResult}
                  onClick={() => {
                    onSelect({
                      geonameId: c.geonameId,
                      label: labelFor(c),
                      lat: c.lat,
                      lng: c.lng,
                      tzIana: c.tzIana,
                    });
                    setQuery("");
                    setResults([]);
                  }}
                >
                  {labelFor(c)}
                  <span className={styles.cityTz}>{c.tzIana}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => setManual(true)}
          >
            Can&rsquo;t find your birthplace? Enter coordinates
          </button>
        </>
      )}
    </div>
  );
}
