"use client";

import { useEffect, useState } from "react";
import {
  loadNotifySettings,
  saveNotifySettings,
  type NotifySettings,
} from "@/lib/notifications";
import styles from "./settings.module.css";

type Permission = "default" | "granted" | "denied" | "unsupported";

/**
 * Settings → Notifications: opt in to local transit notifications
 * ("Mars squares your Sun tomorrow"). Purely local — the app scans the next
 * day's transits whenever it is open (plus periodic background checks where
 * the browser supports them); no push server, nothing leaves the device.
 */
export default function NotificationsPanel() {
  const [settings, setSettings] = useState<NotifySettings | null>(null);
  const [permission, setPermission] = useState<Permission>("default");
  const [profiles, setProfiles] = useState<
    Array<{ id: number; displayName: string; isPrimary: boolean }>
  >([]);

  useEffect(() => {
    setSettings(loadNotifySettings());
    setPermission(
      typeof Notification === "undefined"
        ? "unsupported"
        : (Notification.permission as Permission),
    );
    fetch("/api/profiles")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (body: {
          profiles?: Array<{ id: number; displayName: string; isPrimary: boolean }>;
        } | null) => {
          if (body?.profiles) {
            setProfiles(
              body.profiles.map(({ id, displayName, isPrimary }) => ({
                id,
                displayName,
                isPrimary,
              })),
            );
          }
        },
      )
      .catch(() => {});
  }, []);

  function update(next: NotifySettings) {
    setSettings(next);
    saveNotifySettings(next);
  }

  async function toggleEnabled(enabled: boolean) {
    if (!settings) return;
    if (enabled && permission === "default") {
      const result = await Notification.requestPermission();
      setPermission(result as Permission);
      if (result !== "granted") return;
    }
    update({ ...settings, enabled });
  }

  function toggleProfile(id: number, on: boolean) {
    if (!settings) return;
    const ids = on
      ? [...settings.profileIds, id]
      : settings.profileIds.filter((p) => p !== id);
    update({ ...settings, profileIds: ids });
  }

  if (settings === null) return null;

  if (permission === "unsupported") {
    return (
      <p className={styles.note}>
        This browser doesn&rsquo;t support notifications.
      </p>
    );
  }

  return (
    <div>
      <div className={styles.fields}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={settings.enabled && permission === "granted"}
            onChange={(e) => void toggleEnabled(e.target.checked)}
            disabled={permission === "denied"}
          />{" "}
          Notify me about exact transits in the next 24 hours
        </label>
      </div>
      {permission === "denied" && (
        <p className={styles.note}>
          Notifications are blocked for this site — allow them in the browser
          settings, then come back here.
        </p>
      )}
      {settings.enabled && permission === "granted" && profiles.length > 0 && (
        <div className={styles.fields} role="group" aria-label="Charts to notify about">
          {profiles.map((p) => (
            <label key={p.id} className={styles.check}>
              <input
                type="checkbox"
                checked={
                  settings.profileIds.length > 0
                    ? settings.profileIds.includes(p.id)
                    : p.isPrimary
                }
                onChange={(e) => toggleProfile(p.id, e.target.checked)}
              />{" "}
              {p.displayName}
              {p.isPrimary && " ★"}
            </label>
          ))}
          {settings.profileIds.length === 0 && (
            <p className={styles.note}>
              No charts picked — the primary chart is notified by default.
            </p>
          )}
        </div>
      )}
      <p className={styles.note}>
        Fully local: the app scans the coming day&rsquo;s transits from its
        own engine when you open it (and periodically in the background where
        the browser allows). Nothing is sent anywhere, and the Moon&rsquo;s
        fast transits are left out so the volume stays civil.
      </p>
    </div>
  );
}
