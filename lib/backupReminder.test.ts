import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKUP_STATE,
  backupDue,
  daysSinceBackup,
  sanitizeBackupState,
  withCountingStarted,
} from "./backupReminder";

const NOW = new Date("2026-10-18T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("backupDue", () => {
  it("waits one interval from first use before the first reminder", () => {
    const fresh = withCountingStarted(DEFAULT_BACKUP_STATE, NOW);
    expect(fresh.since).toBe(NOW.toISOString());
    expect(backupDue(fresh, NOW)).toBe(false);
    expect(backupDue({ ...fresh, since: daysAgo(30) }, NOW)).toBe(true);
  });

  it("counts from the last backup, and never when switched off", () => {
    const s = { ...DEFAULT_BACKUP_STATE, intervalDays: 7 as const, lastBackupAt: daysAgo(6) };
    expect(backupDue(s, NOW)).toBe(false);
    expect(backupDue({ ...s, lastBackupAt: daysAgo(8) }, NOW)).toBe(true);
    expect(backupDue({ ...s, lastBackupAt: daysAgo(80), intervalDays: 0 }, NOW)).toBe(false);
    expect(daysSinceBackup({ ...s, lastBackupAt: daysAgo(8) }, NOW)).toBe(8);
  });

  it("stays quiet while snoozed", () => {
    const s = {
      ...DEFAULT_BACKUP_STATE,
      lastBackupAt: daysAgo(40),
      snoozedUntil: new Date(NOW.getTime() + 3_600_000).toISOString(),
    };
    expect(backupDue(s, NOW)).toBe(false);
  });

  it("never restarts the count once it has begun", () => {
    const s = { ...DEFAULT_BACKUP_STATE, since: daysAgo(3) };
    expect(withCountingStarted(s, NOW)).toBe(s);
  });
});

describe("sanitizeBackupState", () => {
  it("falls back to defaults for junk", () => {
    expect(sanitizeBackupState(null)).toEqual(DEFAULT_BACKUP_STATE);
    expect(sanitizeBackupState({ intervalDays: 5, lastBackupAt: "nope", since: 3 })).toEqual(
      DEFAULT_BACKUP_STATE,
    );
    expect(sanitizeBackupState({ intervalDays: 14, lastBackupAt: daysAgo(1) }).intervalDays).toBe(14);
  });
});
