import { LlmUnavailableError } from "./llm";

/**
 * Shared SSE response for the LLM generator routes (reading, hebrew-reading,
 * forecast, chat). Pre-checks stay plain JSON in each route — this runs only
 * once generation is authorized. Wire protocol:
 *
 *   event: delta   data: {"delta": "..."}     — one per provider chunk
 *   event: done    data: <persisted payload>  — after successful persistence
 *   event: error   data: {"error": "...", "message"?: "..."}
 *
 * On upstream failure or client abort nothing is persisted, so the unique
 * slot stays free — the same semantics as the non-streaming 502 path.
 */
export function streamGenerationResponse({
  stream,
  signal,
  label,
  persist,
}: {
  /** Provider deltas (already wired to `signal` for upstream abort). */
  stream: AsyncIterable<string>;
  /** The request's signal: skips persistence when the client disconnects. */
  signal: AbortSignal;
  /** Route name for server-side logging. */
  label: string;
  /**
   * Persist the accumulated text and return the `done` payload, or a known
   * error code (e.g. a concurrent generation won the unique slot). Chat's
   * "persistence" is a no-op that just echoes the final text.
   */
  persist: (
    bodyMd: string,
  ) => Promise<{ done: unknown } | { errorCode: string }>;
}): Response {
  const encoder = new TextEncoder();
  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // The client went away; the abort signal handles the rest.
        }
      };

      let bodyMd = "";
      try {
        for await (const delta of stream) {
          bodyMd += delta;
          send("delta", { delta });
        }
      } catch (e) {
        if (e instanceof LlmUnavailableError) {
          console.error(`[api] ${label} (stream):`, e);
          send("error", { error: "llm_unavailable", message: e.message });
          controller.close();
          return;
        }
        console.error(`[api] ${label} (stream):`, e);
        send("error", { error: "internal" });
        controller.close();
        return;
      }

      if (signal.aborted || bodyMd === "") {
        // Disconnected or empty generation: persist nothing, slot stays free.
        if (!signal.aborted) {
          send("error", { error: "llm_unavailable", message: "empty generation" });
        }
        controller.close();
        return;
      }

      try {
        const outcome = await persist(bodyMd);
        if ("done" in outcome) send("done", outcome.done);
        else send("error", { error: outcome.errorCode });
      } catch (e) {
        console.error(`[api] ${label} (persist):`, e);
        send("error", { error: "internal" });
      }
      controller.close();
    },
  });

  return new Response(sse, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
