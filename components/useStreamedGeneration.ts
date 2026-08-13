"use client";

import { useCallback, useState } from "react";
import { LineBuffer, sseData } from "@/lib/sse";

export interface StreamOutcome {
  /** True when generation completed and was persisted. */
  ok: boolean;
  /** HTTP status for non-streaming (pre-check / fallback) responses. */
  status?: number;
  /** Error code from an SSE `error` event (e.g. "llm_unavailable"). */
  errorCode?: string;
  /** The full generated text on success (what `streamText` accumulated). */
  text?: string;
}

/**
 * Progressive LLM generation against the `?stream=1` generator routes.
 * `streamText` grows as deltas arrive (null when idle); when the server
 * doesn't stream (no provider support, or a pre-check rejection), the plain
 * JSON response is surfaced via `status` and the caller's existing
 * non-streaming handling applies unchanged.
 */
export function useStreamedGeneration() {
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);

  const generate = useCallback(
    async (url: string, body: unknown): Promise<StreamOutcome> => {
      setBusy(true);
      setStreamText(null);
      try {
        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch {
          return { ok: false };
        }
        const isSse = res.headers
          .get("content-type")
          ?.includes("text/event-stream");
        if (!res.ok || !isSse || !res.body) {
          // Pre-check rejection, or a provider without streaming — the route
          // answered with plain JSON and the caller's status handling applies.
          return { ok: res.ok, status: res.status };
        }

        setStreamText("");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const lines = new LineBuffer();
        let event = "";
        let acc = "";
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch {
            return { ok: false };
          }
          if (chunk.done) break;
          for (const line of lines.push(decoder.decode(chunk.value, { stream: true }))) {
            if (line.startsWith("event:")) {
              event = line.slice(6).trim();
              continue;
            }
            const data = sseData(line);
            if (data === null) continue;
            let json: { delta?: unknown; error?: unknown };
            try {
              json = JSON.parse(data);
            } catch {
              continue;
            }
            if (event === "delta" && typeof json.delta === "string") {
              const delta = json.delta;
              acc += delta;
              setStreamText((t) => (t ?? "") + delta);
            } else if (event === "done") {
              return { ok: true, text: acc };
            } else if (event === "error") {
              return {
                ok: false,
                errorCode: typeof json.error === "string" ? json.error : undefined,
              };
            }
          }
        }
        // Stream ended without a terminal event — treat as failure.
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /** Clear the streamed preview (after the stored result is on screen). */
  const reset = useCallback(() => setStreamText(null), []);

  return { busy, streamText, generate, reset };
}
