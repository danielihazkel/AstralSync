/**
 * Per-browser orb preferences for the ephemeral transit-style reads
 * (Transits tab, Cycles progressed aspects, Today strip). localStorage like
 * the other client prefs (chart.showPoints, today.homeLocation) — never in
 * the DB, never applied to stored snapshots. Stored forecasts deliberately
 * keep the engine defaults so cached prose stays consistent with the summary
 * that generated it.
 *
 * Parse/clamp logic is pure so node-env tests cover it without a DOM.
 */

export interface OrbSettings {
  /** Max orb when either body is the Sun or Moon. */
  luminary: number;
  /** Max orb for all other pairs. */
  default: number;
  /** Max orb for minor aspects. */
  minor: number;
  includeMinors: boolean;
}

/** Mirrors DEFAULT_TRANSIT_ORBS plus the engine's minor default. */
export const DEFAULT_ORB_SETTINGS: OrbSettings = {
  luminary: 3,
  default: 2,
  minor: 2,
  includeMinors: false,
};

const STORAGE_KEY = "settings.orbs";
const MAX_ORB = 12;

function clampOrb(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_ORB, Math.max(0, value));
}

/** Pure: any parsed JSON → valid settings (invalid fields fall back). */
export function sanitizeOrbSettings(raw: unknown): OrbSettings {
  const r = (raw ?? {}) as Partial<Record<keyof OrbSettings, unknown>>;
  return {
    luminary: clampOrb(r.luminary, DEFAULT_ORB_SETTINGS.luminary),
    default: clampOrb(r.default, DEFAULT_ORB_SETTINGS.default),
    minor: clampOrb(r.minor, DEFAULT_ORB_SETTINGS.minor),
    includeMinors: r.includeMinors === true,
  };
}

export function isDefaultOrbSettings(s: OrbSettings): boolean {
  return (
    s.luminary === DEFAULT_ORB_SETTINGS.luminary &&
    s.default === DEFAULT_ORB_SETTINGS.default &&
    s.minor === DEFAULT_ORB_SETTINGS.minor &&
    !s.includeMinors
  );
}

/** Pure: settings → query-string suffix for /api/transits and /api/cycles
 *  ("" at defaults, so default requests stay byte-identical to before). */
export function orbQuery(s: OrbSettings): string {
  if (isDefaultOrbSettings(s)) return "";
  const params = new URLSearchParams({
    luminaryOrb: String(s.luminary),
    defaultOrb: String(s.default),
    minorOrb: String(s.minor),
  });
  if (s.includeMinors) params.set("minors", "1");
  return `?${params.toString()}`;
}

export function loadOrbSettings(): OrbSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORB_SETTINGS;
    return sanitizeOrbSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_ORB_SETTINGS;
  }
}

export function saveOrbSettings(s: OrbSettings): void {
  try {
    if (isDefaultOrbSettings(s)) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage full/blocked — the session keeps the in-memory value.
  }
}
