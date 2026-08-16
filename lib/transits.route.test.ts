import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransitData } from "./transits";

// The route pulls in @/lib/transits, whose Prisma wrapper would otherwise
// need a live DB; mock only that wrapper (transitOptionsFromQuery is pure)
// so these tests stay offline like the rest.
vi.mock("@/lib/transits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transits")>()),
  getTransitView: vi.fn(),
}));

import { GET } from "../app/api/transits/[id]/route";
import { getTransitView } from "@/lib/transits";

const mockView = vi.mocked(getTransitView);

const canned: TransitData = {
  computedAt: "2026-08-11T12:00:00.000Z",
  natal: { version: 1, isSolarChart: false, moonUncertain: false },
  placements: [],
  crossAspects: [],
  angleAspects: [],
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
    // The route decorates the view with per-aspect prose (empty here — the
    // canned view has no cross aspects).
    expect(await res.json()).toEqual({ ...canned, prose: {} });
    expect(mockView).toHaveBeenCalledWith(1, undefined, {
      orbs: undefined,
      includeMinors: false,
    });
  });

  it("attaches transit prose for aspects the library covers", async () => {
    mockView.mockResolvedValue({
      ...canned,
      crossAspects: [
        { a: "saturn", b: "sun", type: "square", angle: 90, orb: 1.1, applying: true },
        // No transit entry and no natal fallback for this pair/type combo:
        // moon-moon square exists in neither library.
        { a: "moon", b: "moon", type: "square", angle: 90, orb: 0.5, applying: false },
      ],
    });
    const res = await GET(request("/api/transits/1"), params("1"));
    const body = await res.json();
    expect(body.prose["transit_aspect/saturn/sun/square"].title).toBe(
      "Transiting Saturn square natal Sun",
    );
    expect(body.prose["transit_aspect/moon/moon/square"]).toBeUndefined();
  });

  it("attaches angle prose, falling back to the natal angle archetype", async () => {
    mockView.mockResolvedValue({
      ...canned,
      angleAspects: [
        // Authored directly: a slow transiter over an angle.
        { planet: "saturn", target: "mc", type: "square", angle: 90, orb: 0.8, applying: true },
        // Fast mover — no transit_angle_aspect entry; the natal angle_aspect
        // archetype serves instead, keyed by the transit key.
        { planet: "venus", target: "ascendant", type: "conjunction", angle: 0, orb: 1.2, applying: false },
      ],
    });
    const res = await GET(request("/api/transits/1"), params("1"));
    const body = await res.json();
    expect(body.prose["transit_angle_aspect/saturn/mc/square"].title).toBe(
      "Transiting Saturn square natal Midheaven",
    );
    expect(body.prose["transit_angle_aspect/venus/ascendant/conjunction"].title).toBe(
      "Venus conjunct Ascendant",
    );
  });

  it("passes a valid `at` instant through", async () => {
    const res = await GET(
      request("/api/transits/1?at=2026-08-11T12:00:00Z"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith(1, new Date("2026-08-11T12:00:00Z"), {
      orbs: undefined,
      includeMinors: false,
    });
  });

  it("threads orb query params into the view options", async () => {
    const res = await GET(
      request("/api/transits/1?luminaryOrb=5&defaultOrb=3&minorOrb=1&minors=1"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith(1, undefined, {
      orbs: { luminary: 5, default: 3, minor: 1 },
      includeMinors: true,
    });
  });

  it("rejects an out-of-range orb with 400 invalid_query", async () => {
    const res = await GET(request("/api/transits/1?defaultOrb=99"), params("1"));
    expect(res.status).toBe(400);
    expect(mockView).not.toHaveBeenCalled();
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
