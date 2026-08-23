import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AspectSearchData } from "./aspectSearch";

// The route pulls in @/lib/aspectSearch, whose Prisma wrapper would
// otherwise need a live DB; mock the module so these tests stay offline.
vi.mock("@/lib/aspectSearch", () => ({ getAspectSearch: vi.fn() }));

import { GET } from "../app/api/transits/[id]/search/route";
import { getAspectSearch } from "@/lib/aspectSearch";

const mockSearch = vi.mocked(getAspectSearch);

const canned = {
  from: "2026-08-13T12:00:00.000Z",
  planet: "saturn",
  target: "sun",
  aspect: "square",
  count: 5,
  natal: { version: 1, isSolarChart: false, moonUncertain: false },
  hits: [
    {
      utc: "2027-01-02T03:04:05.000Z",
      retrograde: false,
      ascending: true,
    },
  ],
  truncated: false,
  engine: { name: "astronomy-engine", version: "2.1.19" },
} satisfies AspectSearchData;

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/transits/[id]/search", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearch.mockResolvedValue(canned);
  });

  it("returns the search view with Cache-Control: no-store", async () => {
    const res = await GET(
      request("/api/transits/1/search?planet=saturn&target=sun&aspect=square"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(canned);
    expect(mockSearch).toHaveBeenCalledWith(1, {
      planet: "saturn",
      target: "sun",
      aspect: "square",
      count: 5,
      from: expect.any(Date),
    });
  });

  it("passes count and a pinned `from` through", async () => {
    const res = await GET(
      request(
        "/api/transits/1/search?planet=moon&target=mc&aspect=trine&count=3&from=2026-08-13T12:00:00Z",
      ),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledWith(1, {
      planet: "moon",
      target: "mc",
      aspect: "trine",
      count: 3,
      from: new Date("2026-08-13T12:00:00Z"),
    });
  });

  it("rejects an unknown planet or aspect with 400 invalid_query", async () => {
    for (const q of [
      "planet=vulcan&target=sun&aspect=square",
      "planet=saturn&target=sun&aspect=novile",
      "planet=saturn&target=sun&aspect=square&count=99",
    ]) {
      const res = await GET(request(`/api/transits/1/search?${q}`), params("1"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_query");
    }
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("accepts a minor aspect", async () => {
    const res = await GET(
      request("/api/transits/1/search?planet=saturn&target=sun&aspect=quincunx"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ aspect: "quincunx" }),
    );
  });

  it("rejects a non-numeric id with 400 invalid_id", async () => {
    const res = await GET(
      request("/api/transits/abc/search?planet=saturn&target=sun&aspect=square"),
      params("abc"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_id");
  });

  it("maps the no_angles sentinel to 400", async () => {
    mockSearch.mockResolvedValue("no_angles");
    const res = await GET(
      request("/api/transits/1/search?planet=sun&target=mc&aspect=conjunction"),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).error).toBe("no_angles");
  });

  it("maps the no_snapshot sentinel to 404", async () => {
    mockSearch.mockResolvedValue("no_snapshot");
    const res = await GET(
      request("/api/transits/99/search?planet=saturn&target=sun&aspect=square"),
      params("99"),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
