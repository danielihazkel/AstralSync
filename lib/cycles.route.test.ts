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
    lunation: {
      phaseDeg: 95,
      phaseName: "Waxing Gibbous",
      waxing: true,
      lastNewMoonUtc: "2018-01-01T00:00:00.000Z",
      nextNewMoonUtc: "2047-06-01T00:00:00.000Z",
      nextFullMoonUtc: "2033-03-01T00:00:00.000Z",
    },
  },
  tertiary: {
    progressedUtc: "1991-06-01T10:30:00.000Z",
    ageMonths: 486.2,
    placements: [],
    crossAspects: [],
  },
  zodiacalReleasing: null,
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
    relocated: false,
  },
  planetaryReturns: [],
  profection: null,
  firdaria: null,
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
        contacts: {},
      },
    });
    expect(mockView).toHaveBeenCalledWith(
      1,
      undefined,
      { orbs: undefined, includeMinors: false },
      undefined,
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
      undefined,
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

  it("passes a lunar-return relocation through and rejects half a pair", async () => {
    const res = await GET(
      request("/api/cycles/1?lrLat=-33.87&lrLng=151.21"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith(
      1,
      undefined,
      { orbs: undefined, includeMinors: false },
      undefined,
      { latitude: -33.87, longitude: 151.21 },
    );

    const half = await GET(request("/api/cycles/1?lrLng=151.21"), params("1"));
    expect(half.status).toBe(400);
    expect((await half.json()).error).toBe("invalid_query");
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
      firdaria: {
        isDay: true,
        secondCycle: false,
        major: { lord: "saturn" },
        sub: null,
        cycle: [],
      } as unknown as CyclesData["firdaria"],
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
    expect(prose.firdaria.title).toBe("A Saturn firdaria");
  });

  it("attaches the natal-pair archetype to contacts, and the sub-lord's prose", async () => {
    const contact = { a: "sun", b: "saturn", type: "square", angle: 90, orb: 0.4 };
    mockView.mockResolvedValue({
      ...canned,
      progressions: { ...canned.progressions, crossAspects: [contact] },
      solarArc: {
        ...canned.solarArc,
        crossAspects: [{ ...contact, a: "moon", b: "moon", type: "conjunction", angle: 0 }],
        angleAspects: [{ planet: "venus", target: "mc", type: "trine", angle: 120, orb: 0.2 }],
      },
      firdaria: {
        isDay: true,
        secondCycle: false,
        major: { lord: "saturn" },
        sub: { lord: "jupiter" },
        cycle: [],
      } as unknown as CyclesData["firdaria"],
    } as unknown as CyclesData);
    const { prose } = await (await GET(request("/api/cycles/1"), params("1"))).json();
    expect(Object.keys(prose.contacts).sort()).toEqual([
      "angle_aspect/venus/mc/trine",
      "aspect/sun/saturn/square",
    ]);
    expect(prose.firdariaSub.title).toMatch(/Jupiter/);
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
