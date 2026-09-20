"use client";

import { useId } from "react";
import {
  MAX_AT_DATE,
  MIN_AT_DATE,
  clampAtDate,
  todayLocalDate,
} from "./atDate";
import styles from "./atInstantPicker.module.css";

/**
 * "Now | a chosen day" for the surfaces that can be computed at any instant.
 *
 * The transits and cycles routes have always accepted `?at=`, validated and
 * tested, but only the Journal tab ever sent it — so the app could compute
 * your profection year for 2011 and had no way to ask. This is the control
 * that asks.
 *
 * It is also the single place the ephemeris clamp is enforced: the bounds
 * live in atDate.ts and every picker inherits them, rather than each surface
 * deciding for itself how far back the engine can be trusted.
 */
export default function AtInstantPicker({
  /** null = now. */
  date,
  onChange,
  label = "Date",
  busy = false,
}: {
  date: string | null;
  onChange: (date: string | null) => void;
  label?: string;
  busy?: boolean;
}) {
  const id = useId();
  const today = todayLocalDate();
  const value = date ?? today;

  return (
    <div className={styles.row}>
      <span className={styles.label} id={`${id}-label`}>
        {label}
      </span>
      <div className={styles.controls} role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          className={date === null ? styles.active : styles.choice}
          aria-pressed={date === null}
          onClick={() => onChange(null)}
        >
          Now
        </button>
        <input
          id={`${id}-date`}
          type="date"
          value={value}
          min={MIN_AT_DATE}
          max={MAX_AT_DATE}
          aria-label={`${label} — a specific day`}
          onChange={(e) => onChange(clampAtDate(e.target.value, value))}
        />
        {date !== null && (
          <span className={styles.status} aria-live="polite">
            {busy ? "Computing…" : "pinned"}
          </span>
        )}
      </div>
    </div>
  );
}
