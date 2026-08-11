"use client";

import { useEffect, useState } from "react";
import type { TzWarning } from "@/lib/tz";
import { TZ_WARNING_COPY, formatOffset } from "@/components/format";
import styles from "./wizard.module.css";

interface Resolved {
  offsetMinutes: number;
  warnings: TzWarning[];
}

/**
 * UTC offset review with manual override (PRD §3.1): always shows what the
 * IANA database resolved for the birth moment, because pre-1970 data is
 * imperfect everywhere. The preview endpoint mirrors compute exactly (noon
 * for unknown time), so what the user confirms here is what gets stored.
 */
export default function OffsetReview({
  tz,
  date,
  time,
  unknownTime,
  overridden,
  overrideMinutes,
  onOverrideChange,
}: {
  tz: string;
  date: string;
  time: string | null;
  unknownTime: boolean;
  overridden: boolean;
  overrideMinutes: number | null;
  onOverrideChange: (overridden: boolean, minutes: number | null) => void;
}) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    setFailed(false);
    const params = new URLSearchParams({ tz, date });
    if (time) params.set("time", time);
    fetch(`/api/offset?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setResolved(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tz, date, time]);

  const effectiveMinutes = overridden
    ? (overrideMinutes ?? resolved?.offsetMinutes ?? 0)
    : resolved?.offsetMinutes;

  const hours = Math.trunc((overrideMinutes ?? 0) / 60);
  const minutes = Math.abs((overrideMinutes ?? 0) % 60);

  function setOverride(h: number, m: number) {
    const total = h < 0 ? -(Math.abs(h) * 60 + m) : h * 60 + m;
    onOverrideChange(true, total);
  }

  return (
    <div>
      <p className={styles.hint}>
        Time zone for the birthplace: <strong>{tz}</strong>
        {unknownTime && " · offset shown for local noon (unknown birth time)"}
      </p>

      {failed && (
        <p className={styles.warning}>
          Could not resolve the offset automatically — you can set it manually
          below, or continue and let the server resolve it on save.
        </p>
      )}
      {!resolved && !failed && <p className={styles.hint}>Resolving offset…</p>}

      {resolved && (
        <p className={styles.offsetValue}>
          Resolved UTC offset:{" "}
          <strong>{formatOffset(resolved.offsetMinutes)}</strong>
        </p>
      )}

      {resolved?.warnings.map((w) => (
        <p key={w} className={styles.warning}>
          {TZ_WARNING_COPY[w]}
        </p>
      ))}

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={overridden}
          onChange={(e) => {
            if (e.target.checked) {
              onOverrideChange(true, resolved?.offsetMinutes ?? 0);
            } else {
              onOverrideChange(false, null);
            }
          }}
        />
        Override the offset manually
      </label>

      {overridden && (
        <div className={styles.overrideRow}>
          <label>
            Hours
            <select
              value={hours}
              onChange={(e) => setOverride(Number(e.target.value), minutes)}
            >
              {Array.from({ length: 29 }, (_, i) => i - 14).map((h) => (
                <option key={h} value={h}>
                  {h >= 0 ? `+${h}` : h}
                </option>
              ))}
            </select>
          </label>
          <label>
            Minutes
            <select
              value={minutes}
              onChange={(e) => setOverride(hours, Number(e.target.value))}
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.offsetValue}>
            = {formatOffset(effectiveMinutes ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
}
