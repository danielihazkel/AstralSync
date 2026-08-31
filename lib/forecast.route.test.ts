import { buildChart } from "@astralsync/astro-core";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WheelChart } from "./view-types";

// Offline like the other route tests: the Prisma-backed store and snapshot
// modules are mocked; the pure engine, content library, and prompt builders
// run for real.
vi.mock("@/lib/forecastStore", () => ({
  getForecast: vi.fn(),
  createForecast: vi.fn(),
  deleteForecast: vi.fn(),
  getLatestNatal: vi.fn(),
}));
vi.mock("@/lib/snapshots", () => ({
  ensureHebrewSnapshot: vi.fn(),
  getProfileView: vi.fn(),
}));
vi.mock("@/lib/lifeEvents", () => ({
  listLifeEvents: vi.fn(),
}));
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  llmClientFromEnv: vi.fn(),
}));

import { DELETE, GET, POST } from "../app/api/profiles/[id]/forecast/route";
import {
  createForecast,
  deleteForecast,
  getForecast,
  getLatestNatal,
} from "@/lib/forecastStore";
import { listLifeEvents } from "@/lib/lifeEvents";
import { llmClientFromEnv, LlmUnavailableError } from "@/lib/llm";
import { ensureHebrewSnapshot, getProfileView } from "@/lib/snapshots";

const mockGetForecast = vi.mocked(getForecast);
const mockCreateForecast = vi.mocked(createForecast);
const mockDeleteForecast = vi.mocked(deleteForecast);
const mockGetLatestNatal = vi.mocked(getLatestNatal);
const mockClientFromEnv = vi.mocked(llmClientFromEnv);
const mockEnsureHebrew = vi.mocked(ensureHebrewSnapshot);
const mockGetProfileView = vi.mocked(getProfileView);
const mockListLifeEvents = vi.mocked(listLifeEvents);

function natalChart(): WheelChart {
  const chart = buildChart({
    utc: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    latitude: 51.48,
    longitude: 0,
    timeCertainty: "exact",
  });
  return { ...chart, tzWarnings: [] };
}

const stored = {
  bodyMd: "A stored forecast.",
  modelName: "test-model",
  contentVersion: "1",
  createdAt: new Date("2026-08-13T06:00:00.000Z"),
  natalVersion: 2,
};

const hebrewDateParts = {
  year: 5760,
  month: 10,
  day: 24,
  monthKey: "tevet",
  monthName: "Tevet",
  weekday: 6,
  renderGematriya: "כ״ד טֵבֵת תש״ס",
};

// POST reads the whole view: profile (birth data), astro (natal chart +
// version), numero (derivation), hebrew (mazal/gematria JSON) — a partial
// shape cast keeps the fixture honest-sized.
const { aspects: natalAspects, ...storedNatal } = natalChart();
const profileView = {
  profile: {
    birthDate: "2000-01-01",
    birthTime: "12:00",
    timeCertainty: "exact",
    birthCity: {
      geonameId: 1,
      name: "Tel Aviv",
      admin1: "05",
      countryCode: "IL",
    },
    birthLat: 32.1,
    birthLng: 34.8,
    tzIana: "Asia/Jerusalem",
  },
  astro: { version: 2, chart: storedNatal, aspects: natalAspects },
  numero: {
    derivation: {
      lifePath: {
        value: 4,
        isMaster: false,
        derivation: {
          components: [
            { part: "month", raw: 1, steps: [], reduced: 1 },
            { part: "day", raw: 1, steps: [], reduced: 1 },
            { part: "year", raw: 2000, steps: [2], reduced: 2 },
          ],
          total: 4,
          steps: [],
        },
      },
      destiny: null,
      soulUrge: null,
      hebrewDestiny: null,
    },
  },
  hebrew: {
    mazal: {
      schemaVersion: 1,
      input: {
        civilDate: { year: 2000, month: 1, day: 1 },
        utc: "2000-01-01T10:00:00.000Z",
        latitude: 32.1,
        longitude: 34.8,
        tzId: "Asia/Jerusalem",
        timeCertainty: "unknown",
      },
      hebrewDate: {
        civil: hebrewDateParts,
        effective: hebrewDateParts,
        afterSunset: false,
        sunsetUtc: null,
        ambiguity: "unknown_time",
      },
      mazal: { month: "tevet", mazal: "gdi", hebrew: "גדי", sign: "capricorn" },
      seferYetzirah: {
        month: "tevet",
        letter: "ע",
        letterName: "Ayin",
        tribe: "dan",
        tribeHebrew: "דן",
        faculty: "anger",
        facultyHebrew: "רוגז",
      },
      dayPlanet: { weekday: 6, planet: "saturn", ambiguous: true },
      planetaryHour: null,
      uncertainties: [],
      engine: { name: "test", version: "0" },
    },
    gematria: {
      dateGematria: {
        value: 5,
        isMaster: false,
        derivation: {
          components: [
            { part: "day", raw: 24, steps: [6], reduced: 6 },
            { part: "year", raw: 5760, steps: [18, 9], reduced: 9 },
          ],
          total: 15,
          steps: [6],
        },
      },
      katanName: null,
    },
  },
} as unknown as Awaited<ReturnType<typeof getProfileView>>;

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`http://localhost${path}`, init);
}

function post(body: unknown) {
  return request("/api/profiles/1/forecast", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLatestNatal.mockResolvedValue({ chart: natalChart(), version: 2 });
  mockGetForecast.mockResolvedValue(null);
  mockCreateForecast.mockResolvedValue(stored);
  mockDeleteForecast.mockResolvedValue(true);
  mockGetProfileView.mockResolvedValue(profileView);
  mockEnsureHebrew.mockResolvedValue(undefined);
  mockListLifeEvents.mockResolvedValue([]);
  mockClientFromEnv.mockReturnValue({
    modelName: "test-model",
    generate: vi.fn(async () => "A stored forecast."),
  });
});

describe("GET /api/profiles/[id]/forecast", () => {
  it("returns the period, current natal version, and null when nothing stored", async () => {
    const res = await GET(
      request("/api/profiles/1/forecast?mode=western&kind=week&date=2026-08-13"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = await res.json();
    expect(json.period.start).toEqual({ year: 2026, month: 8, day: 9 });
    expect(json.period.end).toEqual({ year: 2026, month: 8, day: 15 });
    expect(json.natalVersion).toBe(2);
    expect(json.forecast).toBeNull();
    expect(mockGetForecast).toHaveBeenCalledWith(1, "western", "week", {
      year: 2026,
      month: 8,
      day: 9,
    });
  });

  it("returns a stored forecast", async () => {
    mockGetForecast.mockResolvedValue(stored);
    const res = await GET(
      request("/api/profiles/1/forecast?mode=western&kind=day&date=2026-08-13"),
      params("1"),
    );
    const json = await res.json();
    expect(json.forecast.bodyMd).toBe("A stored forecast.");
    expect(json.forecast.natalVersion).toBe(2);
  });

  it("400 on bad params, 404 without a natal snapshot", async () => {
    const bad = await GET(
      request("/api/profiles/1/forecast?mode=weird&kind=day"),
      params("1"),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("invalid_query");

    const badDate = await GET(
      request("/api/profiles/1/forecast?mode=western&kind=day&date=2026-02-30"),
      params("1"),
    );
    expect(badDate.status).toBe(400);

    mockGetLatestNatal.mockResolvedValue(null);
    const missing = await GET(
      request("/api/profiles/9/forecast?mode=western&kind=day"),
      params("9"),
    );
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/profiles/[id]/forecast", () => {
  it("generates and stores a western forecast keyed to the period start", async () => {
    const res = await POST(
      post({ mode: "western", kind: "week", date: "2026-08-13" }),
      params("1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.forecast.bodyMd).toBe("A stored forecast.");
    expect(mockCreateForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 1,
        mode: "western",
        kind: "week",
        periodStart: { year: 2026, month: 8, day: 9 },
        natalVersion: 2,
        bodyMd: "A stored forecast.",
        modelName: "test-model",
      }),
    );
  });

  it("sends the model a western prompt with period sky and natal data", async () => {
    const generate = vi.fn(async (_prompt: string) => "ok");
    mockClientFromEnv.mockReturnValue({ modelName: "m", generate });
    await POST(
      post({ mode: "western", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    const prompt = generate.mock.calls[0][0];
    expect(prompt).toContain("## Period sky data");
    expect(prompt).toContain("Period: day, 2026-08-13");
    expect(prompt).toContain("## Complete natal chart data");
    expect(prompt).toContain("daily forecast");
    // The personal context (personal-data policy, lib/promptData.ts).
    expect(prompt).toContain("## Birth data");
    expect(prompt).toContain("Tel Aviv, 05, IL");
    expect(prompt).toContain("## Complete numerology data");
    expect(prompt).toContain("Life Path: 4");
    // No events recorded → no section, and generation still succeeds.
    expect(prompt).not.toContain("## Life events");
  });

  it("includes recorded life events in both modes' prompts", async () => {
    mockListLifeEvents.mockResolvedValue([
      {
        id: 1,
        title: "Moved abroad",
        eventDate: "2021-03-12",
        precision: "day",
        category: "relocation",
        notesMd: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);
    const generate = vi.fn(async (_prompt: string) => "ok");
    mockClientFromEnv.mockReturnValue({ modelName: "m", generate });
    await POST(
      post({ mode: "western", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    await POST(
      post({ mode: "hebrew", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    for (const call of generate.mock.calls) {
      expect(call[0]).toContain("## Life events");
      expect(call[0]).toContain("Moved abroad");
    }
  });

  it("404 when the profile has no snapshots", async () => {
    mockGetProfileView.mockResolvedValue(null);
    const res = await POST(
      post({ mode: "western", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("generates a hebrew forecast against the natal Mazal", async () => {
    const generate = vi.fn(async (_prompt: string) => "ok");
    mockClientFromEnv.mockReturnValue({ modelName: "m", generate });
    const res = await POST(
      post({ mode: "hebrew", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockEnsureHebrew).toHaveBeenCalledWith(1);
    const prompt = generate.mock.calls[0][0];
    expect(prompt).toContain("## Period Hebrew calendar data");
    expect(prompt).toContain("## Complete natal Mazal chart data");
    expect(prompt).toContain("Mazal (month sign): Tevet — Gdi (Capricorn)");
    expect(prompt).toContain("## Birth data");
    expect(prompt).toContain("## Complete numerology data");
    expect(mockCreateForecast).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "hebrew", natalVersion: 2 }),
    );
  });

  it("409 when the LLM hook is off", async () => {
    mockClientFromEnv.mockReturnValue(null);
    const res = await POST(post({ mode: "western", kind: "day" }), params("1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("llm_disabled");
  });

  it("409 when the period is already generated (pre-check)", async () => {
    mockGetForecast.mockResolvedValue(stored);
    const res = await POST(
      post({ mode: "western", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_generated");
    expect(mockCreateForecast).not.toHaveBeenCalled();
  });

  it("409 on a concurrent create losing the P2002 race", async () => {
    mockCreateForecast.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const res = await POST(
      post({ mode: "western", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_generated");
  });

  it("409 no_hebrew_snapshot when the latest version lacks one", async () => {
    mockGetProfileView.mockResolvedValue({
      ...(profileView as object),
      hebrew: null,
    } as Awaited<ReturnType<typeof getProfileView>>);
    const res = await POST(
      post({ mode: "hebrew", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_hebrew_snapshot");
  });

  it("502 when the model is unreachable, storing nothing", async () => {
    mockClientFromEnv.mockReturnValue({
      modelName: "m",
      generate: vi.fn(async () => {
        throw new LlmUnavailableError("down");
      }),
    });
    const res = await POST(
      post({ mode: "western", kind: "day", date: "2026-08-13" }),
      params("1"),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("llm_unavailable");
    expect(mockCreateForecast).not.toHaveBeenCalled();
  });

  it("400 on an invalid calendar date in the body", async () => {
    const res = await POST(
      post({ mode: "western", kind: "day", date: "2026-02-30" }),
      params("1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/profiles/[id]/forecast", () => {
  it("deletes the period's forecast", async () => {
    const res = await DELETE(
      request(
        "/api/profiles/1/forecast?mode=hebrew&kind=month&date=2026-08-13",
        { method: "DELETE" },
      ),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    // Hebrew month containing 2026-08-13 starts on its own Hebrew day 1.
    expect(mockDeleteForecast).toHaveBeenCalledWith(
      1,
      "hebrew",
      "month",
      expect.objectContaining({ year: 2026 }),
    );
  });

  it("404 when nothing was stored for the period", async () => {
    mockDeleteForecast.mockResolvedValue(false);
    const res = await DELETE(
      request("/api/profiles/1/forecast?mode=western&kind=day", {
        method: "DELETE",
      }),
      params("1"),
    );
    expect(res.status).toBe(404);
  });
});
