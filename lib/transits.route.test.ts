import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransitData } from "./transits";

// The route pulls in @/lib/transits, whose Prisma wrapper would otherwise
// need a live DB; mock the module so these tests stay offline like the rest.
vi.mock("@/lib/transits", () => ({ getTransitView: vi.fn() }));

import { GET } from "../app/api/transits/[id]/route";
import { getTransitView } from "@/lib/transits";

const mockView = vi.mocked(getTransitView);

const canned: TransitData = {
  computedAt: "2026-08-11T12:00:00.000Z",
  natal: { version: 1, isSolarChart: false, moonUncertain: false },
  placements: [],
  crossAspects: [],
  engine: { name: "astronomy-engine", version: "2.1.19" },
};

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/transits/[id]", () => {
  beforeEach(() => {
    mockView.mockReset();
    mockView.mockResolvedValue(canned);
  });

  it("returns the transit view with Cache-Control: no-store", async () => {
    const res = await GET(request("/api/transits/1"), params("1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(canned);
    expect(mockView).toHaveBeenCalledWith(1, undefined);
  });

  it("passes a valid `at` instant through", async () => {
    const res = await GET(
      request("/api/transits/1?at=2026-08-11T12:00:00Z"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith(
      1,
      new Date("2026-08-11T12:00:00Z"),
    );
  });

  it("rejects a malformed `at` with 400 invalid_query", async () => {
    const res = await GET(request("/api/transits/1?at=today"), params("1"));
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).error).toBe("invalid_query");
    expect(mockView).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric id with 400 invalid_id", async () => {
    const res = await GET(request("/api/transits/abc"), params("abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_id");
  });

  it("returns 404 with no-store when the profile has no snapshot", async () => {
    mockView.mockResolvedValue(null);
    const res = await GET(request("/api/transits/99"), params("99"));
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
