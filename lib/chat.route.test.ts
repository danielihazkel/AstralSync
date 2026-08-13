import { buildChart } from "@astralsync/astro-core";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmClient } from "./llm";

// The route reads the profile via Prisma-backed snapshots and the LLM from
// the environment; mock both so these tests stay offline like the rest.
vi.mock("@/lib/snapshots", () => ({ getProfileView: vi.fn() }));
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  llmClientFromEnv: vi.fn(),
}));

import { POST } from "../app/api/profiles/[id]/chat/route";
import { llmClientFromEnv } from "@/lib/llm";
import { getProfileView } from "@/lib/snapshots";

const mockClient = vi.mocked(llmClientFromEnv);
const mockView = vi.mocked(getProfileView);

const chart = buildChart({
  utc: new Date(Date.UTC(1990, 2, 4, 10, 30, 0)),
  latitude: 32.1,
  longitude: 34.8,
});

const view = {
  astro: {
    chart: { ...chart, tzWarnings: [] },
    aspects: chart.aspects,
    llmReading: { bodyMd: "Stored reading." },
    version: 1,
  },
  numero: {
    derivation: {
      lifePath: {
        value: 7,
        isMaster: false,
        derivation: { components: [], total: 7, steps: [] },
      },
      destiny: null,
      soulUrge: null,
    },
  },
  hebrew: null,
} as unknown as Awaited<ReturnType<typeof getProfileView>>;

const chattyClient: LlmClient = {
  modelName: "m",
  generate: async () => "unused",
  async *generateChat() {
    yield "Answer ";
    yield "text.";
  },
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/profiles/1/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/profiles/[id]/chat", () => {
  beforeEach(() => {
    mockClient.mockReset();
    mockView.mockReset();
    mockClient.mockReturnValue(chattyClient);
    mockView.mockResolvedValue(view);
  });

  it("streams the reply and finishes with the full text (nothing persisted)", async () => {
    const res = await POST(request({ question: "What about my Sun?" }), params("1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain('event: delta\ndata: {"delta":"Answer "}');
    expect(text).toContain('event: delta\ndata: {"delta":"text."}');
    expect(text).toContain('event: done\ndata: {"bodyMd":"Answer text."}');
  });

  it("409 llm_disabled without a chat-capable client", async () => {
    mockClient.mockReturnValue(null);
    let res = await POST(request({ question: "q" }), params("1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("llm_disabled");

    mockClient.mockReturnValue({ modelName: "m", generate: async () => "x" });
    res = await POST(request({ question: "q" }), params("1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("llm_disabled");
  });

  it("400 invalid_body on a missing or empty question", async () => {
    const res = await POST(request({ question: "   " }), params("1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
  });

  it("400 invalid_id on a non-numeric id", async () => {
    const res = await POST(request({ question: "q" }), params("abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_id");
  });

  it("409 chat_limit once the history holds the maximum user turns", async () => {
    const history = Array.from({ length: 8 }, (_, i) => [
      { role: "user", content: `q${i}` },
      { role: "assistant", content: `a${i}` },
    ]).flat();
    const res = await POST(request({ question: "one more", history }), params("1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("chat_limit");
  });

  it("400 invalid_history when the history does not alternate", async () => {
    const res = await POST(
      request({
        question: "q",
        history: [
          { role: "assistant", content: "a" },
          { role: "user", content: "q" },
        ],
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_history");
  });

  it("404 when the profile has no snapshot", async () => {
    mockView.mockResolvedValue(null);
    const res = await POST(request({ question: "q" }), params("9"));
    expect(res.status).toBe(404);
  });

  it("409 no_reading before an AI reading has been generated", async () => {
    mockView.mockResolvedValue({
      ...(view as object),
      astro: { ...(view as { astro: object }).astro, llmReading: null },
    } as typeof view);
    const res = await POST(request({ question: "q" }), params("1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_reading");
  });
});
