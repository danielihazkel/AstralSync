"use client";

import { useState } from "react";
import ForecastCard, { type ForecastKind } from "./ForecastCard";
import styles from "./forecast.module.css";

const KINDS: { kind: ForecastKind; label: string }[] = [
  { kind: "day", label: "Day" },
  { kind: "week", label: "Week" },
  { kind: "month", label: "Month" },
];

/**
 * The Forecast tab: daily/weekly/monthly AI forecasts, one card per mode —
 * Western transits and the Hebrew calendar, both read against the natal
 * charts. Weeks run Sunday–Saturday in both modes; the Western month is the
 * civil month while the Hebrew month follows the Hebrew calendar, so the
 * two cards may label different date ranges under the Month view.
 */
export default function ForecastPanel({
  profileId,
  llmEnabled,
  hebrewAvailable,
}: {
  profileId: number;
  llmEnabled: boolean;
  hebrewAvailable: boolean;
}) {
  const [kind, setKind] = useState<ForecastKind>("day");

  return (
    <div className={styles.panel}>
      {!llmEnabled && (
        <p className={styles.notice} role="note">
          AI forecasts are switched off on this install. To enable them, set{" "}
          <code>READING_LLM</code> and <code>READING_LLM_MODEL</code> in the
          server&rsquo;s <code>.env</code> and restart (see the README).
          Charts, transits and template readings all work without them.
        </p>
      )}
      <div
        className={styles.switcher}
        role="group"
        aria-label="Forecast period"
      >
        {KINDS.map((k) => (
          <button
            key={k.kind}
            className={kind === k.kind ? styles.switchActive : styles.switch}
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <ForecastCard
        profileId={profileId}
        mode="western"
        kind={kind}
        llmEnabled={llmEnabled}
        heading="Western transits"
      />

      {hebrewAvailable ? (
        <>
          <ForecastCard
            profileId={profileId}
            mode="hebrew"
            kind={kind}
            llmEnabled={llmEnabled}
            heading="Hebrew (Mazal)"
          />
          <p className={styles.muted}>
            Hebrew dates use the daytime mapping — after sunset the next
            Hebrew day has already begun.
          </p>
        </>
      ) : (
        <p className={styles.notice}>
          This chart version has no Hebrew (Mazal) snapshot, so no Hebrew
          forecast is available.
        </p>
      )}
    </div>
  );
}
