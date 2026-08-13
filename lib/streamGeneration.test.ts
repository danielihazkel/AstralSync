import { describe, expect, it, vi } from "vitest";
import { LlmUnavailableError } from "./llm";
import { streamGenerationResponse } from "./streamGeneration";

function streamOf(gen: () => AsyncIterable<string>): AsyncIterable<string> {
  return gen();
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

async function readEvents(res: Response): Promise<SseEvent[]> {
  const text = await res.text();
  const events: SseEvent[] = [];
  for (const block of text.split("\n\n")) {
    if (block.trim() === "") continue;
    const lines = block.split("\n");
    const event = lines
      .find((l) => l.startsWith("event:"))!
      .slice(6)
      .trim();
    const data = JSON.parse(
      lines.find((l) => l.startsWith("data:"))!.slice(5).trim(),
    );
    events.push({ event, data });
  }
  return events;
}

describe("streamGenerationResponse", () => {
  it("streams deltas, persists the accumulated text once, then emits done", async () => {
    const persist = vi.fn(async (bodyMd: string) => ({
      done: { bodyMd, modelName: "test-model" },
    }));
    const res = streamGenerationResponse({
      stream: streamOf(async function* () {
        yield "Hello ";
        yield "world";
      }),
      signal: new AbortController().signal,
      label: "test",
      persist,
    });

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const events = await readEvents(res);
    expect(events).toEqual([
      { event: "delta", data: { delta: "Hello " } },
      { event: "delta", data: { delta: "world" } },
      {
        event: "done",
        data: { bodyMd: "Hello world", modelName: "test-model" },
      },
    ]);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("Hello world");
  });

  it("emits an error and persists nothing when the provider fails mid-stream", async () => {
    const persist = vi.fn();
    const res = streamGenerationResponse({
      stream: streamOf(async function* () {
        yield "partial";
        throw new LlmUnavailableError("model went away");
      }),
      signal: new AbortController().signal,
      label: "test",
      persist,
    });

    const events = await readEvents(res);
    expect(events[0]).toEqual({ event: "delta", data: { delta: "partial" } });
    expect(events[1].event).toBe("error");
    expect(events[1].data.error).toBe("llm_unavailable");
    expect(persist).not.toHaveBeenCalled();
  });

  it("surfaces a persistence conflict as an error event", async () => {
    const res = streamGenerationResponse({
      stream: streamOf(async function* () {
        yield "text";
      }),
      signal: new AbortController().signal,
      label: "test",
      persist: async () => ({ errorCode: "already_generated" }),
    });

    const events = await readEvents(res);
    expect(events.at(-1)).toEqual({
      event: "error",
      data: { error: "already_generated" },
    });
  });

  it("skips persistence when the client disconnected", async () => {
    const controller = new AbortController();
    const persist = vi.fn();
    const res = streamGenerationResponse({
      stream: streamOf(async function* () {
        yield "some";
        controller.abort();
        yield " more";
      }),
      signal: controller.signal,
      label: "test",
      persist,
    });

    await readEvents(res);
    expect(persist).not.toHaveBeenCalled();
  });

  it("treats an empty generation as unavailability, persisting nothing", async () => {
    const persist = vi.fn();
    const res = streamGenerationResponse({
      stream: streamOf(async function* () {}),
      signal: new AbortController().signal,
      label: "test",
      persist,
    });

    const events = await readEvents(res);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("error");
    expect(events[0].data.error).toBe("llm_unavailable");
    expect(persist).not.toHaveBeenCalled();
  });
});

