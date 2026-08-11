"use client";

import { useEffect } from "react";

// NEXT_PUBLIC_SW_DEV=1 enables registration in dev for HTTPS mobile testing.
const ENABLED =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_SW_DEV === "1";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (ENABLED) {
      // updateViaCache "none" + no-store headers on /sw.js mean every load
      // checks for a new worker; failure must never break the app.
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    } else {
      // Dev: a previously installed production worker on this origin would
      // serve stale assets and fight HMR — remove it and its caches.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            keys
              .filter((key) => key.startsWith("astralsync-"))
              .forEach((key) => caches.delete(key))
          )
          .catch(() => {});
      }
    }
  }, []);
  return null;
}
