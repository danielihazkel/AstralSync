import { describe, expect, it } from "vitest";
import type { CalendarAspectEvent } from "./transitCalendarCore";
import {
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
