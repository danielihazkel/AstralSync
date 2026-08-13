"use client";

import {
  DEFAULT_ORB_SETTINGS,
  isDefaultOrbSettings,
  sanitizeOrbSettings,
  type OrbSettings,
} from "@/lib/orbSettings";
import styles from "./settings.module.css";

/**
 * Collapsible orb preferences for the ephemeral transit-style reads. The
 * owner loads/saves localStorage and refetches — this control is pure
 * value/onChange. Forecasts are deliberately absent: their prose is cached
 * per period, so they stay on the engine defaults.
 */
export default function OrbSettingsControl({
  value,
  onChange,
}: {
  value: OrbSettings;
  onChange: (next: OrbSettings) => void;
}) {
  function set(patch: Partial<OrbSettings>) {
    onChange(sanitizeOrbSettings({ ...value, ...patch }));
  }

  const orbField = (
    label: string,
    key: "luminary" | "default" | "minor",
    hint: string,
  ) => (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={12}
        step={0.5}
        value={value[key]}
        onChange={(e) => set({ [key]: e.target.valueAsNumber })}
        aria-label={hint}
      />
    </label>
  );

  return (
    <details className={styles.orbSettings}>
      <summary>
        Aspect &amp; orb settings
        {!isDefaultOrbSettings(value) && (
          <span className={styles.customTag}>custom</span>
        )}
      </summary>
      <div className={styles.fields}>
        {orbField("Luminary orb", "luminary", "Max orb in degrees when the Sun or Moon is involved")}
        {orbField("Planet orb", "default", "Max orb in degrees for other pairs")}
        {orbField("Minor-aspect orb", "minor", "Max orb in degrees for minor aspects")}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={value.includeMinors}
            onChange={(e) => set({ includeMinors: e.target.checked })}
          />{" "}
          Include minor aspects (quincunx, semisextile, semisquare,
          sesquiquadrate, quintile)
        </label>
        <button
          className={styles.reset}
          onClick={() => onChange(DEFAULT_ORB_SETTINGS)}
          disabled={isDefaultOrbSettings(value)}
        >
          Reset to defaults
        </button>
      </div>
      <p className={styles.note}>
        Applies to live reads (transits, progressed aspects, the Today strip)
        in this browser only. Stored AI forecasts keep the default orbs so
        their cached text stays consistent with the sky summary that produced
        it. Minor aspects have no authored prose — they list positions and
        orbs only.
      </p>
    </details>
  );
}
