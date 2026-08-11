import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// The service worker is plain JS with no imports; evaluate it against a stub
// `self` to reach the pure helpers it exposes on `self.__testables`.

const ORIGIN = "http://localhost:3000";

type Testables = {
  classifyRequest: (req: {
    method: string;
    mode: string;
    url: string;
    isRSC: boolean;
  }) => string;
  rscCacheKey: (url: string) => string;
  trimCache: (cache: unknown, max: number) => Promise<void>;
  VERSION: string;
};

let testables: Testables;
let listeners: string[];

beforeAll(() => {
  const src = readFileSync(
    path.resolve(__dirname, "..", "..", "public", "sw.js"),
    "utf8"
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
    expect(listeners).toEqual(["install", "activate", "fetch"]);
  });

  it("exposes a version for cache busting", () => {
    expect(testables.VERSION).toMatch(/^v\d+$/);
  });
});
