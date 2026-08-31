"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  type ThemePreference,
} from "@/lib/themeSettings";
import {
  loadOrbSettings,
  saveOrbSettings,
  type OrbSettings,
} from "@/lib/orbSettings";
import {
  loadChartSettings,
  saveChartSettings,
  type ChartDisplaySettings,
} from "@/lib/chartSettings";
import { loadHomeLocation } from "@/lib/homeLocation";
import type { HomeLocation } from "@/lib/today";
import type { HouseSystem } from "@astralsync/astro-core";
import { HOUSE_SYSTEM_NAMES } from "@/components/format";
import OrbSettingsControl from "./OrbSettingsControl";
import HomeLocationPicker from "./HomeLocationPicker";
import DataPanel from "./DataPanel";
import NotificationsPanel from "./NotificationsPanel";
import TrashPanel from "./TrashPanel";
import styles from "./settings.module.css";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Auto (follow the system)" },
];

/**
 * Every per-browser preference in one place. Each store keeps its own
 * localStorage key (theme, orbs, home location, chart-wheel display); this
 * page just loads them on mount and saves on change — the pages that
 * consume them re-read on navigation, so no change signal is needed beyond
 * the theme's same-tab event (the header toggle never remounts).
 */
export default function SettingsPanel() {
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("dark");
  const [orbs, setOrbs] = useState<OrbSettings | null>(null);
  const [chart, setChart] = useState<ChartDisplaySettings | null>(null);
  const [location, setLocation] = useState<HomeLocation | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setTheme(loadThemePreference());
    setOrbs(loadOrbSettings());
    setChart(loadChartSettings());
    setLocation(loadHomeLocation());
    setLoaded(true);
  }, []);

  function changeTheme(next: ThemePreference) {
    setTheme(next);
    saveThemePreference(next);
    applyTheme(
      resolveTheme(next, matchMedia("(prefers-color-scheme: light)").matches),
    );
  }

  function changeChart(patch: Partial<ChartDisplaySettings>) {
    setChart((cur) => {
      if (cur === null) return cur;
      const next = { ...cur, ...patch };
      saveChartSettings(next);
      return next;
    });
  }

  if (!loaded) return null;

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Theme</h2>
        <div
          className={styles.fields}
          role="radiogroup"
          aria-label="Color theme"
        >
          {THEME_OPTIONS.map((o) => (
            <label key={o.value} className={styles.field}>
              <input
                type="radio"
                name="theme"
                value={o.value}
                checked={theme === o.value}
                onChange={() => changeTheme(o.value)}
              />{" "}
              {o.label}
            </label>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Aspect orbs</h2>
        {orbs && (
          <OrbSettingsControl
            value={orbs}
            onChange={(next) => {
              saveOrbSettings(next);
              setOrbs(next);
            }}
          />
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Home location</h2>
        <p className={styles.note}>
          Used for planetary hours on the Today strip and the electional day
          picker. Birth cities are never assumed.
        </p>
        {picking ? (
          <HomeLocationPicker
            onPick={(loc) => {
              setLocation(loc);
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <p>
            {location ? (
              <>
                <strong>{location.label}</strong>{" "}
                <span className={styles.note}>({location.tzIana})</span>{" "}
              </>
            ) : (
              "No home location set. "
            )}
            <button className={styles.reset} onClick={() => setPicking(true)}>
              {location ? "Change" : "Set location"}
            </button>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Chart wheel</h2>
        {chart && (
          <div className={styles.fields}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={chart.showPoints}
                onChange={(e) => changeChart({ showPoints: e.target.checked })}
              />{" "}
              Show points (nodes, Lilith, Fortune)
            </label>
            <label className={styles.field}>
              Node:{" "}
              <select
                value={chart.nodeVariant}
                onChange={(e) =>
                  changeChart({
                    nodeVariant: e.target.value === "mean" ? "mean" : "true",
                  })
                }
              >
                <option value="true">True</option>
                <option value="mean">Mean</option>
              </select>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={chart.showMinorAspects}
                onChange={(e) =>
                  changeChart({ showMinorAspects: e.target.checked })
                }
              />{" "}
              Show minor aspects when available
            </label>
            <label className={styles.field}>
              Default chart view:{" "}
              <select
                value={chart.chartView}
                onChange={(e) =>
                  changeChart({
                    chartView: e.target.value === "table" ? "table" : "wheel",
                  })
                }
              >
                <option value="wheel">Wheel</option>
                <option value="table">Table</option>
              </select>
            </label>
            <label className={styles.field}>
              House system for new profiles:{" "}
              <select
                value={chart.defaultHouseSystem}
                onChange={(e) =>
                  changeChart({
                    defaultHouseSystem: e.target.value as HouseSystem,
                  })
                }
              >
                {(Object.keys(HOUSE_SYSTEM_NAMES) as HouseSystem[]).map((h) => (
                  <option key={h} value={h}>
                    {HOUSE_SYSTEM_NAMES[h]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <p className={styles.note}>
          The house system is otherwise a per-profile choice: the wizard
          starts from this default, and a profile&rsquo;s Details tab can
          switch it later (which recomputes a new chart version).
        </p>
      </section>

      <section className={styles.section} id="notifications">
        <h2 className={styles.sectionTitle}>Notifications</h2>
        <NotificationsPanel />
      </section>

      <section className={styles.section} id="data">
        <h2 className={styles.sectionTitle}>Your data</h2>
        <DataPanel />
      </section>

      <section className={styles.section} id="trash">
        <h2 className={styles.sectionTitle}>Trash</h2>
        <TrashPanel />
      </section>

      <p className={styles.note}>
        Preferences are stored in this browser only — use &ldquo;Export
        settings&rdquo; above to carry them to another device.
      </p>
    </div>
  );
}
