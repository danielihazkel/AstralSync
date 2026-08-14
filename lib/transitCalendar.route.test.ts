import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransitCalendarData } from "./transitCalendar";

// Mock only the Prisma wrapper so the route tests stay offline.
vi.mock("@/lib/transitCalendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transitCalendar")>()),
  getTransitCalendar: vi.fn(),
}));

import { GET } from "../app/api/transits/[id]/calendar/route";
import { getTransitCalendar } from "@/lib/transitCalendar";

const mockCalendar = vi.mocked(getTransitCalendar);

const canned: TransitCalendarData = {
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  natal: { version: 1, isSolarChart: false, moonUncertain: false },
  events: [],
  engine: { name: "astronomy-engine", version: "2.1.19" },
};

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/transits/[id]/calendar", () => {
  beforeEach(() => {
    mockCalendar.mockReset();
    mockCalendar.mockResolvedValue(canned);
  });

  it("returns the calendar with no-store and an inclusive end boundary", async () => {
    const res = await GET(
      request("/api/transits/1/calendar?from=2026-08-01&to=2026-08-31"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(canned);
    expect(mockCalendar).toHaveBeenCalledWith(
      1,
      new Date("2026-08-01T00:00:00Z"),
      // Through the end of Aug 31.
      new Date("2026-09-01T00:00:00Z"),
      { includeMinors: false },
    );
  });

  it("threads minors=1 through", async () => {
    await GET(
      request("/api/transits/1/calendar?from=2026-08-01&to=2026-08-31&minors=1"),
      params("1"),
    );
    expect(mockCalendar).toHaveBeenCalledWith(
      1,
      expect.any(Date),
      expect.any(Date),
      { includeMinors: true },
    );
  });

  it("rejects a reversed range with 400", async () => {
    const res = await GET(
      request("/api/transits/1/calendar?from=2026-08-31&to=2026-08-01"),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_query");
    expect(mockCalendar).not.toHaveBeenCalled();
  });

  it("rejects a span over 93 days with 400", async () => {
    const res = await GET(
      request("/api/transits/1/calendar?from=2026-01-01&to=2026-06-01"),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(mockCalendar).not.toHaveBeenCalled();
  });

  it("rejects dates outside the ephemeris window with 400", async () => {
    const res = await GET(
      request("/api/transits/1/calendar?from=1650-01-01&to=1650-01-31"),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(mockCalendar).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric id with 400 invalid_id", async () => {
    const res = await GET(request("/api/transits/abc/calendar"), params("abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_id");
  });

  it("returns 404 with no-store when the profile has no snapshot", async () => {
    mockCalendar.mockResolvedValue(null);
    const res = await GET(
      request("/api/transits/99/calendar?from=2026-08-01&to=2026-08-31"),
      params("99"),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
