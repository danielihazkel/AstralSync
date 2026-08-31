/* AstralSync service worker.
 *
 * Goal (Phase 1g): previously loaded charts stay viewable offline. Pages are
 * force-dynamic server components, so we runtime-cache visited HTML documents
 * and RSC payloads (network-first) plus immutable build assets (cache-first).
 * API routes and mutations are never intercepted — offline they fail loudly
 * through the app's existing fetch error handling.
 *
 * VERSION is the entire update story: the registration uses updateViaCache
 * "none" and /sw.js is served with no-store, so a new version installs on the
 * next load and activate() drops every old cache. The placeholder below is
 * stamped with the Next build id by app/sw.js/route.ts — every deploy is a
 * new worker version with no manual bump to forget.
 */

const VERSION = "__BUILD_ID__";
const PREFIX = "astralsync-";
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const PAGES_CACHE = `${PREFIX}pages-${VERSION}`;
const RSC_CACHE = `${PREFIX}rsc-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_PAGE_ENTRIES = 50;
// Written by the page (lib/notifications.ts): upcoming transit notifications
// for the periodicsync handler to fire while the app is closed. Outside the
// versioned scheme on purpose — activate() spares it across deploys.
const DIGEST_CACHE = "astralsync-digest";
const DIGEST_URL = "/__astralsync/digest.json";

/**
 * Sort a request into a handling class. Pure — unit-tested via __testables.
 * @param {{method: string, mode: string, url: string, isRSC: boolean}} req
 * @returns {"passthrough"|"rsc"|"document"|"static"|"asset"}
 */
function classifyRequest({ method, mode, url, isRSC }) {
  const u = new URL(url);
  if (method !== "GET") return "passthrough";
  if (u.origin !== self.location.origin) return "passthrough";
  if (u.pathname.startsWith("/api/")) return "passthrough";
  if (isRSC || u.searchParams.has("_rsc")) return "rsc";
  if (mode === "navigate") return "document";
  if (u.pathname.startsWith("/_next/static/")) return "static";
  return "asset";
}

/**
 * RSC payloads for one route arrive with varying `_rsc` cache-busters; key
 * them by URL minus `_rsc` so the latest payload per route wins while
 * `?version=N` history views stay distinct.
 */
function rscCacheKey(url) {
  const u = new URL(url);
  u.searchParams.delete("_rsc");
  return u.toString();
}

/** Evict oldest entries beyond `max` (Cache API keys preserve insertion order). */
async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) {
    await cache.delete(key);
  }
}

/**
 * Digest entries worth firing now: exact instant inside the window (with a
 * little grace into the past, so a hit between syncs isn't lost) and not in
 * the fired list. Pure — unit-tested via __testables.
 * @param {{notifications?: Array<{key: string, atUtc: string}>, fired?: string[]}|null} digest
 * @param {number} nowMs
 */
function dueNotifications(digest, nowMs, windowMs = 24 * 3_600_000, graceMs = 3_600_000) {
  const fired = new Set(digest && Array.isArray(digest.fired) ? digest.fired : []);
  const list = digest && Array.isArray(digest.notifications) ? digest.notifications : [];
  return list.filter((n) => {
    const t = Date.parse(n.atUtc);
    return (
      Number.isFinite(t) &&
      t >= nowMs - graceMs &&
      t <= nowMs + windowMs &&
      !fired.has(n.key)
    );
  });
}

self.__testables = {
  classifyRequest,
  rscCacheKey,
  trimCache,
  dueNotifications,
  VERSION,
};

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (wins.length > 0) return wins[0].focus();
      return self.clients.openWindow("/");
    })()
  );
});

// Where the browser supports Periodic Background Sync, fire due digest
// notifications while the app is closed. The page rewrites the digest and
// re-registers the sync on every open (components/pwa/NotificationScheduler).
self.addEventListener("periodicsync", (event) => {
  if (event.tag !== "astralsync-digest") return;
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(DIGEST_CACHE);
        const res = await cache.match(DIGEST_URL);
        if (!res) return;
        const digest = await res.json();
        const due = dueNotifications(digest, Date.now());
        for (const n of due) {
          await self.registration.showNotification(n.title, {
            body: n.body,
            tag: n.key,
            icon: "/icon.svg",
          });
        }
        if (due.length > 0) {
          digest.fired = [
            ...(Array.isArray(digest.fired) ? digest.fired : []),
            ...due.map((n) => n.key),
          ];
          await cache.put(
            DIGEST_URL,
            new Response(JSON.stringify(digest), {
              headers: { "Content-Type": "application/json" },
            })
          );
        }
      } catch {
        // Notifications are best-effort; never break the worker.
      }
    })()
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
      try {
        const cache = await caches.open(PAGES_CACHE);
        const res = await fetch(OFFLINE_URL);
        if (!res.ok) return;
        await cache.put(new URL(OFFLINE_URL, self.location.origin).toString(), res.clone());
        // Warm the shared layout stylesheet(s) so the offline page (and every
        // cached page) has styles even if no asset request happened yet.
        const html = await res.text();
        const cssHrefs = [...html.matchAll(/href="(\/_next\/static\/[^"]+?\.css[^"]*)"/g)].map(
          (m) => m[1]
        );
        const staticCache = await caches.open(STATIC_CACHE);
        await Promise.all(
          cssHrefs.map(async (href) => {
            const cssRes = await fetch(href);
            if (cssRes.ok) await staticCache.put(href, cssRes);
          })
        );
      } catch {
        // Precache is best-effort; never fail installation.
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (n) =>
              n.startsWith(PREFIX) &&
              !n.endsWith(`-${VERSION}`) &&
              n !== DIGEST_CACHE
          )
          .map((n) => caches.delete(n))
      );
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const kind = classifyRequest({
    method: req.method,
    mode: req.mode,
    url: req.url,
    isRSC: req.headers.get("RSC") === "1",
  });
  if (kind === "passthrough") return;

  if (kind === "document") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(PAGES_CACHE);
            await cache.put(req.url, res.clone());
            event.waitUntil(trimCache(cache, MAX_PAGE_ENTRIES));
          }
          return res;
        } catch {
          // ignoreVary: Next varies on RSC/router-state headers, which would
          // otherwise block matching the stored entry.
          const cached = await caches.match(req.url, { ignoreVary: true });
          if (cached) return cached;
          const offline = await caches.match(
            new URL(OFFLINE_URL, self.location.origin).toString(),
            { ignoreVary: true }
          );
          return offline ?? new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  if (kind === "rsc") {
    event.respondWith(
      (async () => {
        const key = rscCacheKey(req.url);
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(RSC_CACHE);
            await cache.put(key, res.clone());
            event.waitUntil(trimCache(cache, MAX_PAGE_ENTRIES));
          }
          return res;
        } catch (err) {
          const cached = await caches.match(key, { ignoreVary: true });
          // A rejected RSC fetch makes Next's router fall back to a full
          // browser navigation, which the document branch serves from cache.
          if (!cached) throw err;
          return cached;
        }
      })()
    );
    return;
  }

  // static + asset: cache-first (build assets are content-hashed).
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreVary: true });
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(req, res.clone());
      }
      return res;
    })()
  );
});
