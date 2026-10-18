import { describe, expect, it } from "vitest";
import type { CalendarAspectEvent } from "./transitCalendarCore";
import {
  alreadyFired,
  mergeFiredKeys,
  notifiedProfileIds,
  usesDefaultPick,
  DEFAULT_NOTIFY_SETTINGS,
  buildNotifications,
  pruneFired,
  sanitizeNotifySettings,
} from "./notifications";

function event(utc: string, over: Partial<CalendarAspectEvent> = {}): CalendarAspectEvent {
  return {
    a: "mars",
    b: "sun",
    type: "square",
    utc,
    retrograde: false,
    pass: { n: 1, of: 1 },
    ...over,
  } as CalendarAspectEvent;
}

const NOW = new Date("2026-08-31T12:00:00Z");

describe("sanitizeNotifySettings", () => {
  it("defaults anything malformed", () => {
    expect(sanitizeNotifySettings(null)).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(sanitizeNotifySettings("x")).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(sanitizeNotifySettings({ enabled: "yes" })).toEqual({
      enabled: false,
      profileIds: [],
    });
  });

  it("keeps valid ids and drops junk", () => {
    expect(
      sanitizeNotifySettings({ enabled: true, profileIds: [3, -1, "x", 7, 2.5] }),
    ).toEqual({ enabled: true, profileIds: [3, 7] });
  });
});

describe("buildNotifications", () => {
  it("keeps only hits inside the window, sorted soonest first", () => {
    const profiles = [
      {
        profileId: 5,
        displayName: "Dana",
        events: [
          event("2026-08-31T10:00:00.000Z"), // past — out
          event("2026-09-01T09:00:00.000Z"), // 21h ahead — in
          event("2026-08-31T15:00:00.000Z"), // 3h ahead — in
          event("2026-09-02T13:00:00.000Z"), // beyond 24h — out
        ],
      },
    ];
    const out = buildNotifications(profiles, NOW);
    expect(out.map((n) => n.atUtc)).toEqual([
      "2026-08-31T15:00:00.000Z",
      "2026-09-01T09:00:00.000Z",
    ]);
    expect(out[0].title).toContain("Mars");
    expect(out[0].title).toContain("square");
    expect(out[0].title).toContain("Dana");
    expect(out[0].key).toBe("5:mars:square:sun:2026-08-31T15:00:00.000Z");
  });

  it("annotates retrograde and multi-pass hits in the body", () => {
    const out = buildNotifications(
      [
        {
          profileId: 1,
          displayName: "N",
          events: [
            event("2026-08-31T15:00:00.000Z", {
              retrograde: true,
              pass: { n: 2, of: 3 },
            }),
          ],
        },
      ],
      NOW,
    );
    expect(out[0].body).toContain("℞");
    expect(out[0].body).toContain("pass 2 of 3");
  });
});

describe("pruneFired", () => {
  it("drops stale and malformed entries, keeps fresh ones", () => {
    const now = Date.parse("2026-08-31T12:00:00Z");
    const fired = {
      fresh: now - 1000,
      stale: now - 8 * 86_400_000,
      junk: Number.NaN,
    };
    expect(pruneFired(fired, now)).toEqual({ fresh: now - 1000 });
  });
});

describe("notifiedProfileIds", () => {
  const charts = [
    { id: 4, isPrimary: false },
    { id: 2, isPrimary: false },
    { id: 7, isPrimary: true },
  ];

  it("honours an explicit pick, dropping ids that no longer exist", () => {
    expect(notifiedProfileIds(charts, [2, 99])).toEqual([2]);
  });

  it("defaults to the primary chart", () => {
    expect(notifiedProfileIds(charts, [])).toEqual([7]);
  });

  it("falls back to the oldest chart when none is primary", () => {
    // Nothing marks a primary automatically — this used to notify nobody.
    const none = charts.map((c) => ({ ...c, isPrimary: false }));
    expect(notifiedProfileIds(none, [])).toEqual([2]);
  });

  it("is empty with no charts at all", () => {
    expect(notifiedProfileIds([], [])).toEqual([]);
  });
});

describe("a pick that went to the Trash", () => {
  const charts = [
    { id: 2, isPrimary: false },
    { id: 7, isPrimary: true },
  ];

  it("falls back to the default chart instead of going silent", () => {
    // Profile 5 was the only pick and is now trashed (absent from the list).
    expect(usesDefaultPick(charts, [5])).toBe(true);
    expect(notifiedProfileIds(charts, [5])).toEqual([7]);
  });

  it("keeps a live pick", () => {
    expect(usesDefaultPick(charts, [5, 2])).toBe(false);
    expect(notifiedProfileIds(charts, [5, 2])).toEqual([2]);
  });
});

describe("mergeFiredKeys", () => {
  it("adds the worker's fired keys without touching known ones", () => {
    const merged = mergeFiredKeys({ a: 100 }, ["a", "b"], 500);
    expect(merged).toEqual({ a: 100, b: 500 });
  });

  it("ignores a malformed digest list", () => {
    expect(mergeFiredKeys({ a: 1 }, "nope", 5)).toEqual({ a: 1 });
    expect(mergeFiredKeys({}, [3, null, "k"], 5)).toEqual({ k: 5 });
  });
});

describe("alreadyFired", () => {
  const key = "5:mars:square:sun:2026-08-31T15:00:00.412Z";

  it("matches the same hit refined to a different millisecond by a later scan", () => {
    expect(alreadyFired("5:mars:square:sun:2026-08-31T15:00:01.087Z", [key])).toBe(true);
    expect(alreadyFired("5:mars:square:sun:2026-08-31T14:59:59.731Z", [key])).toBe(true);
  });

  it("keeps a different profile, pair, aspect or pass apart", () => {
    expect(alreadyFired("6:mars:square:sun:2026-08-31T15:00:00.412Z", [key])).toBe(false);
    expect(alreadyFired("5:mars:trine:sun:2026-08-31T15:00:00.412Z", [key])).toBe(false);
    // A retrograde re-pass is weeks later.
    expect(alreadyFired("5:mars:square:sun:2026-10-20T03:00:00.000Z", [key])).toBe(false);
  });

  it("still dedupes an exact match of an unparseable key", () => {
    expect(alreadyFired("odd", ["odd"])).toBe(true);
    expect(alreadyFired("odd", [key])).toBe(false);
  });
});

describe("eclipse notifications", () => {
  const eclipse = {
    kind: "lunar" as const,
    type: "total" as const,
    peakUtc: "2026-08-31T20:00:00.000Z",
    longitude: 157,
    sign: "virgo" as const,
    degreeInSign: 7,
    obscuration: 1,
  };

  it("fires for an eclipse on a natal point inside the window", () => {
    const out = buildNotifications(
      [
        {
          profileId: 5,
          displayName: "Dana",
          events: [],
          eclipses: [{ eclipse, contacts: [{ point: "sun", type: "conjunction", orb: 0.4 }] }],
        },
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Lunar eclipse on natal Sun (0.4°) — Dana");
    expect(out[0].key).toBe("5:eclipse:lunar:sun:2026-08-31T20:00:00.000Z");
    expect(alreadyFired(out[0].key, ["5:eclipse:lunar:sun:2026-08-31T20:00:00.900Z"])).toBe(true);
  });

  it("stays quiet for an eclipse that touches nothing, or falls outside the window", () => {
    const quiet = buildNotifications(
      [
        { profileId: 5, displayName: "Dana", events: [], eclipses: [{ eclipse, contacts: [] }] },
        {
          profileId: 6,
          displayName: "Yoav",
          events: [],
          eclipses: [
            {
              eclipse: { ...eclipse, peakUtc: "2026-09-03T20:00:00.000Z" },
              contacts: [{ point: "moon", type: "opposition", orb: 1 }],
            },
          ],
        },
      ],
      NOW,
    );
    expect(quiet).toEqual([]);
  });
});
