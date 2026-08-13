import { buildChart } from "@astralsync/astro-core";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmClient } from "./llm";
import { computeSynastry, type SynastryInputSide } from "./synastry";
import type { WheelChart } from "./view-types";

// The route reads the pair view + stored reading via Prisma-backed helpers
// and the LLM from the environment; mock all three so these tests stay
// offline like the rest. The pure helpers keep their real implementations.
vi.mock("@/lib/db", () => ({
  prisma: {
    synastryReading: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/synastry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/synastry")>()),
  getSynastryView: vi.fn(),
  getSynastryReading: vi.fn(),
}));
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  llmClientFromEnv: vi.fn(),
}));

import { DELETE, GET, POST } from "../app/api/synastry/reading/route";
import { prisma } from "@/lib/db";
import { llmClientFromEnv } from "@/lib/llm";
import { getSynastryReading, getSynastryView } from "@/lib/synastry";

const mockView = vi.mocked(getSynastryView);
const mockReading = vi.mocked(getSynastryReading);
const mockClient = vi.mocked(llmClientFromEnv);
const mockCreate = vi.mocked(prisma.synastryReading.create);
const mockDelete = vi.mocked(prisma.synastryReading.delete);

function chartOf(utc: Date): WheelChart {
  const chart = buildChart({ utc, latitude: 51.48, longitude: 0 });
  return { ...chart, tzWarnings: [] };
}

function side(
  profileId: number,
  displayName: string,
  version = 1,
): SynastryInputSide {
  return {
    profileId,
    displayName,
    version,
    chart: chartOf(new Date(Date.UTC(1990 + profileId, 0, 1, 12, 0, 0))),
  };
}

const VIEW = computeSynastry(side(1, "Alice"), side(2, "Ben"));

const STORED = {
  bodyMd: "A stored relationship reading.",
  modelName: "m",
  contentVersion: "1",
  createdAt: new Date("2026-08-13T10:00:00Z"),
  aVersion: 1,
  bVersion: 1,
};

const client: LlmClient = {
  modelName: "m",
  generate: async () => "Fresh reading text.",
};

function request(query: string, method = "GET") {
  return new NextRequest(`http://localhost/api/synastry/reading${query}`, {
    method,
  });
}

beforeEach(() => {
  mockView.mockReset().mockResolvedValue(VIEW);
  mockReading.mockReset().mockResolvedValue(null);
  mockClient.mockReset().mockReturnValue(client);
  mockCreate.mockReset();
  mockDelete.mockReset();
});

describe("GET /api/synastry/reading", () => {
  it("400 on a missing or self pair", async () => {
    expect((await GET(request("?a=1"))).status).toBe(400);
    expect((await GET(request("?a=3&b=3"))).status).toBe(400);
  });

  it("404 when either profile is missing", async () => {
    mockView.mockResolvedValue(null);
    expect((await GET(request("?a=1&b=2"))).status).toBe(404);
  });

  it("returns null with no stored reading", async () => {
    const res = await GET(request("?a=1&b=2"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ reading: null, stale: false });
  });

  it("returns the stored reading, fresh when versions match", async () => {
    mockReading.mockResolvedValue(STORED);
    const body = await (await GET(request("?a=1&b=2"))).json();
    expect(body.reading.bodyMd).toBe("A stored relationship reading.");
    expect(body.stale).toBe(false);
  });

  it("flags staleness when either chart gained a version", async () => {
    mockReading.mockResolvedValue(STORED);
    mockView.mockResolvedValue(computeSynastry(side(1, "Alice", 2), side(2, "Ben")));
    const body = await (await GET(request("?a=1&b=2"))).json();
    expect(body.stale).toBe(true);
  });

  it("maps versions through the sorted pair for reversed query order", async () => {
    mockReading.mockResolvedValue(STORED);
    // Query b-first: view sides arrive reversed relative to the stored pair.
    mockView.mockResolvedValue(computeSynastry(side(2, "Ben"), side(1, "Alice")));
    const body = await (await GET(request("?a=2&b=1"))).json();
    expect(body.stale).toBe(false);
  });
});

describe("POST /api/synastry/reading", () => {
  it("409 llm_disabled without a client", async () => {
    mockClient.mockReturnValue(null);
    const res = await POST(request("?a=1&b=2", "POST"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("llm_disabled");
  });

  it("409 already_generated when the slot is taken", async () => {
    mockReading.mockResolvedValue(STORED);
    const res = await POST(request("?a=1&b=2", "POST"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_generated");
  });

  it("generates and persists under the sorted pair with per-side versions", async () => {
    mockView.mockResolvedValue(computeSynastry(side(2, "Ben", 5), side(1, "Alice", 3)));
    mockCreate.mockImplementation((async (args: {
      data: Record<string, unknown>;
    }) => ({
      ...args.data,
      id: 1,
      createdAt: new Date("2026-08-13T10:00:00Z"),
    })) as never);
    const res = await POST(request("?a=2&b=1", "POST"));
    expect(res.status).toBe(200);
    expect((await res.json()).bodyMd).toBe("Fresh reading text.");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        profileAId: 1,
        profileBId: 2,
        aVersion: 3,
        bVersion: 5,
        bodyMd: "Fresh reading text.",
        modelName: "m",
      }),
    });
  });
});

describe("DELETE /api/synastry/reading", () => {
  it("frees the slot", async () => {
    mockDelete.mockResolvedValue(STORED as never);
    const res = await DELETE(request("?a=2&b=1", "DELETE"));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({
      where: { profileAId_profileBId: { profileAId: 1, profileBId: 2 } },
    });
  });

  it("404 when nothing is stored", async () => {
    const { Prisma } = await import("@prisma/client");
    mockDelete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("gone", {
        code: "P2025",
        clientVersion: "test",
      }),
    );
    const res = await DELETE(request("?a=1&b=2", "DELETE"));
    expect(res.status).toBe(404);
  });
});
