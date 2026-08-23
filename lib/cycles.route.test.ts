import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CyclesData } from "./cycles";

// The route pulls in @/lib/cycles, whose Prisma wrapper would otherwise
// need a live DB; mock the module so these tests stay offline like the rest.
vi.mock("@/lib/cycles", () => ({ getCyclesView: vi.fn() }));

import { GET } from "../app/api/cycles/[id]/route";
import { getCyclesView } from "@/lib/cycles";

const mockView = vi.mocked(getCyclesView);

const canned = {
  computedAt: "2026-08-13T12:00:00.000Z",
  natal: { version: 1, isSolarChart: false, moonUncertain: false },
  progressions: {
    progressedUtc: "1990-04-10T10:30:00.000Z",
    ageYears: 36.4,
    placements: [],
    crossAspects: [],
    chart: {} as CyclesData["solarReturn"]["chart"],
  },
  solarArc: {
    arcDegrees: 36.4,
    placements: [],
    crossAspects: [],
    angleAspects: [],
  },
  solarReturn: {
    year: 2026,
    returnUtc: "2026-03-04T18:22:11.000Z",
    chart: {} as CyclesData["solarReturn"]["chart"],
    relocated: false,
  },
  lunarReturn: {
    returnUtc: "2026-07-30T02:11:45.000Z",
    nextReturnUtc: "2026-08-26T09:54:02.000Z",
    chart: {} as CyclesData["solarReturn"]["chart"],
  },
  planetaryReturns: [],
  profection: null,
  engine: { name: "astronomy-engine", version: "2.1.19" },
} satisfies CyclesData;

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/cycles/[id]", () => {
  beforeEach(() => {
    mockView.mockReset();
    mockView.mockResolvedValue(canned);
  });

  it("returns the cycles view with Cache-Control: no-store", async () => {
    const res = await GET(request("/api/cycles/1"), params("1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // The route decorates the view with per-section prose from the real
    // library. The canned view has no profection, progressed placements, or
    // planetary returns, so only the fixed overviews (solar arc, solar and
    // lunar returns) resolve.
    expect(await res.json()).toEqual({
      ...canned,
      prose: {
        solarArc: { title: "Solar arc directions", bodyMd: expect.any(String) },
        solarReturn: { title: "The solar return", bodyMd: expect.any(String) },
        lunarReturn: { title: "The lunar return", bodyMd: expect.any(String) },
      },
    });
    expect(mockView).toHaveBeenCalledWith(
      1,
      undefined,
      { orbs: undefined, includeMinors: false },
      undefined,
    );
  });

  it("passes a solar-return relocation through and rejects half a pair", async () => {
    const res = await GET(
      request("/api/cycles/1?srLat=32.08&srLng=34.78"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith(
      1,
      undefined,
      { orbs: undefined, includeMinors: false },
      { latitude: 32.08, longitude: 34.78 },
    );

    const half = await GET(request("/api/cycles/1?srLat=32.08"), params("1"));
    expect(half.status).toBe(400);
    expect((await half.json()).error).toBe("invalid_query");

    const outOfRange = await GET(
      request("/api/cycles/1?srLat=95&srLng=34.78"),
      params("1"),
    );
    expect(outOfRange.status).toBe(400);
  });

  it("attaches profection, progressed-sign, and return prose when inputs exist", async () => {
    mockView.mockResolvedValue({
      ...canned,
      profection: {
        age: 36,
        profectedHouse: 5,
        profectedSign: "leo",
        yearLord: "sun",
        yearStartUtc: "2026-08-01T00:00:00.000Z",
        yearEndUtc: "2027-08-01T00:00:00.000Z",
      },
      progressions: {
        ...canned.progressions,
        placements: [
          {
            planet: "sun",
            sign: "taurus",
            longitude: 35,
            degreeInSign: 5,
            house: null,
            retrograde: false,
          },
        ],
        chart: {
          bigThree: { sun: "taurus", moon: "cancer", ascendant: "virgo" },
        } as CyclesData["solarReturn"]["chart"],
      },
      planetaryReturns: [
        {
          planet: "jupiter",
          cycleYears: 11.9,
          natalLongitude: 0,
          currentLongitude: 1,
          lastExactUtc: null,
          crossings: [],
          nextExactUtc: null,
          chart: null,
        },
      ],
    });
    const res = await GET(request("/api/cycles/1"), params("1"));
    const { prose } = await res.json();
    expect(prose.profection.title).toBe("A 5th-house year");
    expect(prose.progressedSun.title).toBe("Progressed Sun in Taurus");
    expect(prose.progressedAsc.title).toBe("Progressed Ascendant in Virgo");
    expect(prose.jupiterReturn.title).toBe("The Jupiter return");
    expect(prose.saturnReturn).toBeUndefined();
  });

  it("passes a valid `at` instant through", async () => {
    const res = await GET(
      request("/api/cycles/1?at=2026-08-13T12:00:00Z"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith(
      1,
      new Date("2026-08-13T12:00:00Z"),
      { orbs: undefined, includeMinors: false },
      undefined,
    );
  });

  it("rejects a malformed `at` with 400 invalid_query", async () => {
    const res = await GET(request("/api/cycles/1?at=today"), params("1"));
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).error).toBe("invalid_query");
    expect(mockView).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric id with 400 invalid_id", async () => {
    const res = await GET(request("/api/cycles/abc"), params("abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_id");
  });

  it("returns 404 with no-store when the profile has no snapshot", async () => {
    mockView.mockResolvedValue(null);
    const res = await GET(request("/api/cycles/99"), params("99"));
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
