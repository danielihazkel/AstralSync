import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BUILD_ID_PLACEHOLDER, renderServiceWorker } from "./swTemplate";

// The service worker is plain JS with no imports; evaluate it (after the
// same build-id substitution app/sw.js/route.ts performs) against a stub
// `self` to reach the pure helpers it exposes on `self.__testables`.

const ORIGIN = "http://localhost:3000";
const TEST_BUILD_ID = "testbuild123";

type Testables = {
  classifyRequest: (req: {
    method: string;
    mode: string;
    url: string;
    isRSC: boolean;
  }) => string;
  rscCacheKey: (url: string) => string;
  trimCache: (cache: unknown, max: number) => Promise<void>;
  dueNotifications: (
    digest: unknown,
    nowMs: number,
    windowMs?: number,
    graceMs?: number,
  ) => Array<{ key: string; atUtc: string }>;
  VERSION: string;
};

let testables: Testables;
let listeners: string[];

beforeAll(() => {
  const src = renderServiceWorker(
    readFileSync(path.resolve(__dirname, "sw.src.js"), "utf8"),
    TEST_BUILD_ID
  );
  listeners = [];
  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: (name: string) => listeners.push(name),
  };
  new Function("self", "caches", src)(self, undefined);
  testables = self.__testables as Testables;
});

const get = (url: string, extra: Partial<Parameters<Testables["classifyRequest"]>[0]> = {}) =>
  testables.classifyRequest({
    method: "GET",
    mode: "no-cors",
    url,
    isRSC: false,
    ...extra,
  });

describe("classifyRequest", () => {
  it("passes through non-GET, cross-origin, and API requests", () => {
    expect(get(`${ORIGIN}/profiles/1`, { method: "POST" })).toBe("passthrough");
    expect(get("https://example.com/x.js")).toBe("passthrough");
    expect(get(`${ORIGIN}/api/cities?q=lond`)).toBe("passthrough");
    expect(get(`${ORIGIN}/api/profiles/3/reading`)).toBe("passthrough");
  });

  it("classifies navigations as documents", () => {
    expect(get(`${ORIGIN}/profiles/7?version=2`, { mode: "navigate" })).toBe(
      "document"
    );
  });

  it("classifies RSC payloads by header or _rsc param", () => {
    expect(get(`${ORIGIN}/profiles/7`, { isRSC: true })).toBe("rsc");
    expect(get(`${ORIGIN}/profiles/7?_rsc=1a2b`)).toBe("rsc");
  });

  it("classifies build assets and other same-origin GETs", () => {
    expect(get(`${ORIGIN}/_next/static/chunks/main.js`)).toBe("static");
    expect(get(`${ORIGIN}/icons/icon-192.png`)).toBe("asset");
  });
});

describe("rscCacheKey", () => {
  it("strips _rsc but preserves version history params", () => {
    expect(testables.rscCacheKey(`${ORIGIN}/profiles/7?version=2&_rsc=1a2b`)).toBe(
      `${ORIGIN}/profiles/7?version=2`
    );
    expect(testables.rscCacheKey(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
  });
});

describe("trimCache", () => {
  it("evicts oldest entries beyond the limit", async () => {
    const deleted: string[] = [];
    const cache = {
      keys: async () => ["a", "b", "c", "d"],
      delete: async (k: string) => void deleted.push(k),
    };
    await testables.trimCache(cache, 2);
    expect(deleted).toEqual(["a", "b"]);
  });

  it("is a no-op under the limit", async () => {
    const deleted: string[] = [];
    const cache = {
      keys: async () => ["a"],
      delete: async (k: string) => void deleted.push(k),
    };
    await testables.trimCache(cache, 50);
    expect(deleted).toEqual([]);
  });
});

describe("lifecycle", () => {
  it("registers install, activate, and fetch listeners", () => {
    expect(listeners).toEqual([
      "notificationclick",
      "periodicsync",
      "install",
      "activate",
      "fetch",
    ]);
  });

  it("exposes the substituted build id as its version", () => {
    expect(testables.VERSION).toBe(TEST_BUILD_ID);
  });
});

describe("renderServiceWorker", () => {
  it("replaces the placeholder and strips unsafe characters", () => {
    const src = `const VERSION = "${BUILD_ID_PLACEHOLDER}";`;
    expect(renderServiceWorker(src, 'ab"c;1')).toBe('const VERSION = "abc1";');
  });

  it("falls back to a fixed id when nothing survives sanitizing", () => {
    const src = `cache-${BUILD_ID_PLACEHOLDER}`;
    expect(renderServiceWorker(src, '";')).toBe("cache-unknown");
  });
});

describe("dueNotifications", () => {
  const NOW = Date.parse("2026-08-31T12:00:00Z");
  const digest = {
    notifications: [
      { key: "past-old", atUtc: "2026-08-31T09:00:00.000Z" },
      { key: "recent", atUtc: "2026-08-31T11:30:00.000Z" },
      { key: "soon", atUtc: "2026-08-31T20:00:00.000Z" },
      { key: "tomorrow", atUtc: "2026-09-01T11:00:00.000Z" },
      { key: "far", atUtc: "2026-09-02T13:00:00.000Z" },
      { key: "fired", atUtc: "2026-08-31T18:00:00.000Z" },
    ],
    fired: ["fired"],
  };

  it("fires hits inside the window, skipping old, far and already-fired", () => {
    expect(testables.dueNotifications(digest, NOW).map((n) => n.key)).toEqual([
      "recent",
      "soon",
      "tomorrow",
    ]);
  });

  it("tolerates a malformed digest", () => {
    expect(testables.dueNotifications(null, NOW)).toEqual([]);
    expect(testables.dueNotifications({}, NOW)).toEqual([]);
    expect(
      testables.dueNotifications(
        { notifications: [{ key: "x", atUtc: "nope" }] },
        NOW,
      ),
    ).toEqual([]);
  });
});
