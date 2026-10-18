/**
 * Backup reminders — the pure half. A browser cannot save a file on a
 * timer without the user's click, so "automatic backup" here is a nudge:
 * the home page offers the whole-installation export once a backup is
 * older than the chosen interval. State is per browser (localStorage, the
 * orbSettings stance), every access guarded; a blocked store just means no
 * reminders.
 */

export const BACKUP_INTERVALS = [0, 7, 14, 30] as const;
export type BackupInterval = (typeof BACKUP_INTERVALS)[number];

export interface BackupState {
  /** Days between reminders; 0 = never remind. */
  intervalDays: BackupInterval;
  /** ISO instant of the last "Export all" from this browser. */
  lastBackupAt: string | null;
  /** ISO instant reminders started counting from, when there has been no
   *  backup yet — so a brand-new installation is not nagged on day one. */
  since: string | null;
  /** ISO instant before which the reminder stays quiet ("tomorrow"). */
  snoozedUntil: string | null;
}

export const DEFAULT_BACKUP_STATE: BackupState = {
  intervalDays: 30,
  lastBackupAt: null,
  since: null,
  snoozedUntil: null,
};

export const BACKUP_STATE_KEY = "backup.reminder";
const DAY_MS = 86_400_000;

const isoOrNull = (v: unknown): string | null =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;

/** Pure: stored JSON → valid state (anything malformed → defaults). */
export function sanitizeBackupState(raw: unknown): BackupState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_BACKUP_STATE;
  const o = raw as Record<string, unknown>;
  return {
    intervalDays: (BACKUP_INTERVALS as readonly unknown[]).includes(o.intervalDays)
      ? (o.intervalDays as BackupInterval)
      : DEFAULT_BACKUP_STATE.intervalDays,
    lastBackupAt: isoOrNull(o.lastBackupAt),
    since: isoOrNull(o.since),
    snoozedUntil: isoOrNull(o.snoozedUntil),
  };
}

/** Whole days since the last backup (or since counting began); null when
 *  neither is known. */
export function daysSinceBackup(s: BackupState, now: Date): number | null {
  const ref = s.lastBackupAt ?? s.since;
  return ref === null ? null : Math.floor((now.getTime() - Date.parse(ref)) / DAY_MS);
}

/** Whether the home page should offer a backup now. Pure. */
export function backupDue(s: BackupState, now: Date): boolean {
  if (s.intervalDays === 0) return false;
  if (s.snoozedUntil !== null && now.getTime() < Date.parse(s.snoozedUntil)) return false;
  const days = daysSinceBackup(s, now);
  return days !== null && days >= s.intervalDays;
}

/** Start counting on first sight, so the first reminder comes one interval
 *  after the app was first used rather than immediately. Pure. */
export function withCountingStarted(s: BackupState, now: Date): BackupState {
  return s.lastBackupAt === null && s.since === null
    ? { ...s, since: now.toISOString() }
    : s;
}

export function loadBackupState(): BackupState {
  try {
    const raw = localStorage.getItem(BACKUP_STATE_KEY);
    return raw ? sanitizeBackupState(JSON.parse(raw)) : DEFAULT_BACKUP_STATE;
  } catch {
    return DEFAULT_BACKUP_STATE;
  }
}

export function saveBackupState(s: BackupState): void {
  try {
    localStorage.setItem(BACKUP_STATE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: reminders just won't persist.
  }
}

/** Note a completed export (clears any snooze). */
export function recordBackup(now: Date = new Date()): BackupState {
  const next = { ...loadBackupState(), lastBackupAt: now.toISOString(), snoozedUntil: null };
  saveBackupState(next);
  return next;
}
