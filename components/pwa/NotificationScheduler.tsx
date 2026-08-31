"use client";

import { useEffect } from "react";
import type { Placement } from "@astralsync/astro-core";
import {
  DIGEST_CACHE,
  DIGEST_URL,
  buildNotifications,
  loadFiredKeys,
  loadNotifySettings,
  saveFiredKeys,
  type NotificationDigest,
  type ProfileEvents,
} from "@/lib/notifications";

/** Scan window: a day ahead, plus slack so "tomorrow, same time" hits. */
const WINDOW_HOURS = 26;
/** Per-open cap — a returning user should never face a notification wall. */
const MAX_PER_OPEN = 5;

/**
 * Local transit notifications, no push server: whenever the app opens (and
 * the user has opted in and granted permission), scan the next day's exact
 * transits for the opted-in profiles, fire notifications for new hits, and
 * leave a digest in the Cache API for the service worker's periodicsync
 * handler to check while the app is closed (where supported). Renders
 * nothing; every failure path is silent — notifications are best-effort.
 */
export function NotificationScheduler() {
  useEffect(() => {
    const settings = loadNotifySettings();
    if (!settings.enabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profiles");
        if (!res.ok) return;
        const { profiles } = (await res.json()) as {
          profiles: Array<{
            id: number;
            displayName: string;
            isPrimary: boolean;
            placements: Placement[] | null;
          }>;
        };
        // Empty selection = "the primary chart only" (the settings default).
        const wanted = (
          settings.profileIds.length > 0
            ? profiles.filter((p) => settings.profileIds.includes(p.id))
            : profiles.filter((p) => p.isPrimary)
        ).filter((p) => p.placements !== null);
        if (wanted.length === 0) return;

        const { scanAspectEvents } = await import("@/lib/transitCalendarCore");
        const now = new Date();
        const to = new Date(now.getTime() + WINDOW_HOURS * 3_600_000);
        const perProfile: ProfileEvents[] = wanted.map((p) => ({
          profileId: p.id,
          displayName: p.displayName,
          events: scanAspectEvents(p.placements!, now, to),
        }));
        const notifications = buildNotifications(perProfile, now, WINDOW_HOURS);
        if (cancelled) return;

        const fired = loadFiredKeys(now.getTime());
        const fresh = notifications.filter((n) => !(n.key in fired));
        // `ready` never rejects and never resolves when no worker is
        // registered (dev) — race a timeout instead of hanging.
        const reg =
          "serviceWorker" in navigator
            ? await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<null>((r) => setTimeout(() => r(null), 3000)),
              ]).catch(() => null)
            : null;
        for (const n of fresh.slice(0, MAX_PER_OPEN)) {
          try {
            if (reg) {
              await reg.showNotification(n.title, {
                body: n.body,
                tag: n.key,
                icon: "/icon.svg",
              });
            } else {
              new Notification(n.title, { body: n.body, tag: n.key });
            }
            fired[n.key] = now.getTime();
          } catch {
            // A single failed notification never blocks the rest.
          }
        }
        saveFiredKeys(fired);

        // Leave the digest for the SW's periodicsync handler.
        try {
          const digest: NotificationDigest = {
            generatedAt: now.toISOString(),
            notifications,
            fired: Object.keys(fired),
          };
          const cache = await caches.open(DIGEST_CACHE);
          await cache.put(
            DIGEST_URL,
            new Response(JSON.stringify(digest), {
              headers: { "Content-Type": "application/json" },
            }),
          );
        } catch {
          // Cache API blocked — on-open notifications still worked.
        }
        try {
          const sync = (
            reg as unknown as {
              periodicSync?: {
                register: (tag: string, opts: { minInterval: number }) => Promise<void>;
              };
            } | null
          )?.periodicSync;
          await sync?.register("astralsync-digest", {
            minInterval: 6 * 3_600_000,
          });
        } catch {
          // Periodic Background Sync is a progressive enhancement.
        }
      } catch {
        // Offline or the server is down — nothing to notify about.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
