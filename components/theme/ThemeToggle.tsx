"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  DEFAULT_THEME,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  type ThemePreference,
} from "@/lib/themeSettings";

const ORDER: ThemePreference[] = ["dark", "light", "system"];

const LABEL: Record<ThemePreference, string> = {
  dark: "Dark",
  light: "Light",
  system: "Auto",
};

const ICON: Record<ThemePreference, string> = {
  dark: "☾",
  light: "☀",
  system: "◐",
};

/**
 * Cycles dark → light → system. Preference is per-browser
 * (lib/themeSettings.ts); ThemeScript already applied it pre-paint, this
 * control only handles changes after load.
 */
export function ThemeToggle() {
  // Render the default until mounted so SSR output stays stable.
  const [pref, setPref] = useState<ThemePreference>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(loadThemePreference());
    setMounted(true);
  }, []);

  // While on "system", follow live OS changes.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const sync = () => applyTheme(resolveTheme("system", mq.matches));
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [pref]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(next);
    saveThemePreference(next);
    applyTheme(
      resolveTheme(next, matchMedia("(prefers-color-scheme: light)").matches),
    );
  }

  return (
    <button
      type="button"
      className="themeToggle"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[pref]}. Activate to change.`}
      title={mounted ? `Theme: ${LABEL[pref]}` : undefined}
    >
      <span aria-hidden="true">{ICON[pref]}</span> {LABEL[pref]}
    </button>
  );
}
