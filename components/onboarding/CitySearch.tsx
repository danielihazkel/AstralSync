"use client";

import { useEffect, useRef, useState } from "react";
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
        const data = await res.json();
        setResults(data.cities ?? []);
        setSearching(false);
      } catch {
        // Aborted or offline — keep the previous results.
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
          inhabitants — try the nearest larger town.
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
    </div>
  );
}
