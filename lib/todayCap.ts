/**
 * The Today strip's scan guardrail. Every profile on the home page used to
 * get a full transit scan (and a 7-day digest scan on expand) — fine for a
 * handful of charts, quadratic pain for a household of twenty. The strip now
 * scans the primary chart plus the most recently viewed others, up to
 * TODAY_SCAN_LIMIT; the rest stay listed in the profile list but sit out the
 * sky computations. Pure so node-env tests cover the selection.
 */

export const TODAY_SCAN_LIMIT = 12;

export interface TodayCapInput {
  id: number;
  isPrimary: boolean;
  /** Last profile-page open; null for never-viewed rows. */
  lastViewedAt: Date | string | null;
  createdAt: Date | string;
}

function ms(v: Date | string | null): number {
  if (v === null) return Number.NEGATIVE_INFINITY;
  return typeof v === "string" ? Date.parse(v) : v.getTime();
}

/**
 * Pick which profiles the Today strip scans: the primary always, then by
 * lastViewedAt (newest first, never-viewed last, createdAt as the
 * tie-break so fresh imports beat ancient ones). The returned `shown` list
 * preserves the input order — the cap chooses membership, not display
 * order. Never mutates the input.
 */
export function capTodayProfiles<T extends TodayCapInput>(
  profiles: T[],
  limit: number = TODAY_SCAN_LIMIT,
): { shown: T[]; hiddenCount: number } {
  if (profiles.length <= limit) return { shown: profiles, hiddenCount: 0 };
  const ranked = [...profiles].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const viewedA = ms(a.lastViewedAt);
    const viewedB = ms(b.lastViewedAt);
    // Compare before subtracting: -Infinity - -Infinity is NaN, which
    // would silently break the sort for two never-viewed profiles.
    if (viewedA !== viewedB) return viewedB - viewedA;
    return ms(b.createdAt) - ms(a.createdAt) || a.id - b.id;
  });
  const keep = new Set(ranked.slice(0, limit).map((p) => p.id));
  return {
    shown: profiles.filter((p) => keep.has(p.id)),
    hiddenCount: profiles.length - limit,
  };
}
