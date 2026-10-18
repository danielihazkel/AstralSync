/**
 * Local transit notifications ("Mars squares your Sun tomorrow") — the pure
 * half. There is no push server: the app itself computes the next day's
 * exact transits from the bundled engine (the Today-dashboard scan) whenever
 * it is open, fires Notifications for hits inside the window, and leaves a
 * digest in the Cache API for the service worker's `periodicsync` handler to
 * check while the app is closed (where the browser supports it).
 *
 * Settings and the fired-keys ledger live in localStorage (per-browser, the
 * orbSettings stance); everything here is pure or try/catch-guarded so
 * node-env tests cover it without a DOM.
 */

import type { CalendarAspectEvent } from "@/lib/transitCalendarCore";
import { ASPECT_NAMES, PLANET_NAMES } from "@/components/format";

// --- settings ---------------------------------------------------------------

export interface NotifySettings {
  /** Master switch; requires granted browser permission to matter. */
  enabled: boolean;
  /** Profiles whose transits notify. Empty = none picked yet, which the
   *  scheduler treats as "the primary profile only". */
  profileIds: number[];
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  enabled: false,
  profileIds: [],
};

/**
 * Which charts notify. An explicit pick wins. With none picked, the primary
 * chart — or, when no chart is marked primary, the oldest one (lowest id).
 * Nothing marks a primary automatically and trashing the primary clears the
 * mark, so "primary only" used to mean "nobody": notifications switched on
 * and silently never fired.
 */
export function notifiedProfileIds(
  profiles: ReadonlyArray<{ id: number; isPrimary: boolean }>,
  picked: readonly number[],
): number[] {
  if (!usesDefaultPick(profiles, picked)) {
    return profiles.filter((p) => picked.includes(p.id)).map((p) => p.id);
  }
  const primary = profiles.find((p) => p.isPrimary);
  if (primary) return [primary.id];
  if (profiles.length === 0) return [];
  return [Math.min(...profiles.map((p) => p.id))];
}

/** True when no picked chart is still live — nothing picked, or every pick
 *  since trashed — so the default chart notifies. A pick that went to the
 *  Trash must not leave notifications on and silent. */
export function usesDefaultPick(
  profiles: ReadonlyArray<{ id: number }>,
  picked: readonly number[],
): boolean {
  return !profiles.some((p) => picked.includes(p.id));
}

export const NOTIFY_SETTINGS_KEY = "notify.settings";
export const NOTIFY_FIRED_KEY = "notify.fired";

/** Pure: stored JSON → valid settings (anything malformed → defaults). */
export function sanitizeNotifySettings(raw: unknown): NotifySettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_NOTIFY_SETTINGS;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    profileIds: Array.isArray(o.profileIds)
      ? o.profileIds.filter(
          (v): v is number => Number.isInteger(v) && (v as number) > 0,
        )
      : [],
  };
}

export function loadNotifySettings(): NotifySettings {
  try {
    const raw = localStorage.getItem(NOTIFY_SETTINGS_KEY);
    return raw ? sanitizeNotifySettings(JSON.parse(raw)) : DEFAULT_NOTIFY_SETTINGS;
  } catch {
    return DEFAULT_NOTIFY_SETTINGS;
  }
}

export function saveNotifySettings(s: NotifySettings): void {
  try {
    if (!s.enabled && s.profileIds.length === 0) {
      localStorage.removeItem(NOTIFY_SETTINGS_KEY);
    } else {
      localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(s));
    }
  } catch {
    // Storage full/blocked — the session keeps the in-memory value.
  }
}

// --- building notifications -------------------------------------------------

export interface TransitNotification {
  /** Stable dedupe key — one notification per exact hit, ever. */
  key: string;
  title: string;
  body: string;
  /** ISO instant of the exact aspect. */
  atUtc: string;
}

export interface ProfileEvents {
  profileId: number;
  displayName: string;
  events: CalendarAspectEvent[];
}

/** Exact hits inside (now, now + windowHours] → notification payloads,
 *  soonest first. The Moon is not in the scan (transitCalendarCore's
 *  stance), so the volume stays civil. */
export function buildNotifications(
  profiles: ProfileEvents[],
  now: Date,
  windowHours = 24,
): TransitNotification[] {
  const lo = now.getTime();
  const hi = lo + windowHours * 3_600_000;
  const out: TransitNotification[] = [];
  for (const p of profiles) {
    for (const e of p.events) {
      const t = Date.parse(e.utc);
      if (!(t > lo && t <= hi)) continue;
      const when = new Date(t).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      out.push({
        key: `${p.profileId}:${e.a}:${e.type}:${e.b}:${e.utc}`,
        title: `${PLANET_NAMES[e.a]} ${ASPECT_NAMES[e.type].toLowerCase()} natal ${PLANET_NAMES[e.b]} — ${p.displayName}`,
        body: `Exact ${when}${e.retrograde ? " ℞" : ""}${
          e.pass.of > 1 ? ` (pass ${e.pass.n} of ${e.pass.of})` : ""
        }`,
        atUtc: e.utc,
      });
    }
  }
  return out.sort((a, b) => a.atUtc.localeCompare(b.atUtc));
}

// --- fired-keys ledger ------------------------------------------------------

/** How far apart two keys' instants may be and still be one hit. The scan
 *  refines each exact instant to about a second from a bracket that starts
 *  at "now", so the same hit lands on a slightly different millisecond on
 *  every open; and no pair repeats an aspect within hours (the Moon is not
 *  scanned). sw.src.js's dueNotifications mirrors this rule. */
export const SAME_HIT_MS = 3_600_000;

/** Split a key into its "profile:a:type:b" identity and its instant. */
function keyParts(key: string): { id: string; t: number } | null {
  const parts = key.split(":");
  if (parts.length < 5) return null;
  const t = Date.parse(parts.slice(4).join(":"));
  return Number.isFinite(t) ? { id: parts.slice(0, 4).join(":"), t } : null;
}

/** Whether `key` names a hit already in `fired` — the same key, or the same
 *  profile, pair and aspect within SAME_HIT_MS. Pure. */
export function alreadyFired(key: string, fired: Iterable<string>): boolean {
  const k = keyParts(key);
  for (const f of fired) {
    if (f === key) return true;
    const p = k && keyParts(f);
    if (p && p.id === k.id && Math.abs(p.t - k.t) < SAME_HIT_MS) return true;
  }
  return false;
}

/** Drop entries older than `maxAgeMs` — keys embed the exact instant, so a
 *  week-old entry can never match a future notification. Pure. */
export function pruneFired(
  fired: Record<string, number>,
  nowMs: number,
  maxAgeMs = 7 * 86_400_000,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, at] of Object.entries(fired)) {
    if (Number.isFinite(at) && nowMs - at < maxAgeMs) out[key] = at;
  }
  return out;
}

export function loadFiredKeys(nowMs: number): Record<string, number> {
  try {
    const raw = localStorage.getItem(NOTIFY_FIRED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null) return {};
    return pruneFired(parsed as Record<string, number>, nowMs);
  } catch {
    return {};
  }
}

/** Fold the keys the service worker fired while the app was closed (kept
 *  only in the digest) into the ledger, so the next open doesn't fire them
 *  again — and the rewritten digest keeps them. Pure. */
export function mergeFiredKeys(
  fired: Record<string, number>,
  digestFired: unknown,
  nowMs: number,
): Record<string, number> {
  const out = { ...fired };
  if (!Array.isArray(digestFired)) return out;
  for (const key of digestFired) {
    if (typeof key === "string" && !(key in out)) out[key] = nowMs;
  }
  return out;
}

export function saveFiredKeys(fired: Record<string, number>): void {
  try {
    localStorage.setItem(NOTIFY_FIRED_KEY, JSON.stringify(fired));
  } catch {
    // Best effort — worst case a duplicate notification after a wipe.
  }
}

// --- the service-worker digest ----------------------------------------------

/** Cache the scheduler writes and the SW's periodicsync handler reads.
 *  Deliberately outside the versioned page/asset caches: sw.src.js's
 *  activate() spares this name, so the digest survives a deploy. */
export const DIGEST_CACHE = "astralsync-digest";
/** Synthetic cache key — never fetched over the network. */
export const DIGEST_URL = "/__astralsync/digest.json";
/** The periodicsync tag sw.src.js listens for. */
export const DIGEST_SYNC_TAG = "astralsync-digest";

export interface NotificationDigest {
  /** ISO instant the digest was computed. */
  generatedAt: string;
  /** Upcoming (already filtered to the scan window) notifications. */
  notifications: TransitNotification[];
  /** Keys already shown — the SW appends as it fires. */
  fired: string[];
}

/** Notifications switched off (or permission withdrawn): drop the digest
 *  and the periodic check, so the service worker stops firing what an
 *  earlier open left behind. Best effort, browser only. */
export async function clearNotificationDigest(): Promise<void> {
  try {
    await caches.delete(DIGEST_CACHE);
  } catch {
    // Cache API blocked — there is no digest to fire from either.
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sync = (
      reg as unknown as {
        periodicSync?: { unregister: (tag: string) => Promise<void> };
      } | undefined
    )?.periodicSync;
    await sync?.unregister(DIGEST_SYNC_TAG);
  } catch {
    // Periodic Background Sync is a progressive enhancement.
  }
}
