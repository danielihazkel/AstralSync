import type { ContentEntry, ResolvedReading } from "./content";
import type {
  ForecastKind,
  HebrewPeriodSummary,
  WesternPeriodSummary,
} from "./forecast";
import type { ResolvedHebrewReading } from "./hebrewReading";
import {
  renderChartData,
  renderHebrewPeriodData,
  renderMazalData,
  renderNumerologyData,
  renderWesternPeriodData,
} from "./promptData";
import { LineBuffer, sseData } from "./sse";
import type {
  NumeroDerivation,
  StoredHebrewGematria,
  StoredMazal,
  WheelChart,
} from "./view-types";

/**
 * Optional LLM synthesis hook (PRD §5): a single combined reading per
 * snapshot pair, generated once and stored forever in the `reading` table.
 * OFF by default — the app is fully functional without it. Configured
 * entirely through the environment:
 *
 *   READING_LLM=off | ollama | api | anthropic     unset ⇒ off
 *   READING_LLM_MODEL=<model name>     required when not off
 *   READING_LLM_BASE_URL=<url>         ollama default http://localhost:11434;
 *                                      anthropic default https://api.anthropic.com;
 *                                      required for api
 *   READING_LLM_API_KEY=<key>          api and anthropic modes
 *
 * Suggested anthropic model: claude-opus-5.
 */

export class LlmUnavailableError extends Error {
  /** HTTP status of the provider's final response, when one arrived. */
  status?: number;
  constructor(message: string, cause?: unknown, status?: number) {
    super(message);
    this.name = "LlmUnavailableError";
    this.cause = cause;
    this.status = status;
  }
}

/** One turn of the ephemeral reading chat (lib/chat.ts). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmClient {
  readonly modelName: string;
  generate(prompt: string): Promise<string>;
  /**
   * Optional streaming generation: yields text deltas as the provider emits
   * them. Callers fall back to `generate()` when absent. `signal` aborts the
   * upstream request (e.g. the browser disconnected mid-stream).
   */
  generateStream?(prompt: string, signal?: AbortSignal): AsyncIterable<string>;
  /**
   * Optional streaming multi-turn chat with a system prompt — the reading
   * chat's transport. Replies are capped tighter than readings.
   */
  generateChat?(
    system: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string>;
}

/** Generation knobs, overridable per deployment via the environment. */
export interface LlmTuning {
  /** Wall-clock budget for one call including transient-failure retries. */
  timeoutMs: number;
  /** Readings ask for ~400 words; the cap bounds a runaway completion. */
  maxTokens: number;
  /** Chat answers ask for ~150 words; a tighter cap bounds per-turn spend. */
  chatMaxTokens: number;
  temperature: number;
}

export const DEFAULT_LLM_TUNING: LlmTuning = {
  timeoutMs: 60_000,
  maxTokens: 1_200,
  chatMaxTokens: 600,
  temperature: 0.7,
};

function numFromEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) ? n : fallback;
}

export function llmTuningFromEnv(
  env: Record<string, string | undefined> = process.env,
): LlmTuning {
  return {
    timeoutMs: numFromEnv(env.READING_LLM_TIMEOUT_MS, DEFAULT_LLM_TUNING.timeoutMs),
    maxTokens: numFromEnv(env.READING_LLM_MAX_TOKENS, DEFAULT_LLM_TUNING.maxTokens),
    chatMaxTokens: numFromEnv(
      env.READING_LLM_CHAT_MAX_TOKENS,
      DEFAULT_LLM_TUNING.chatMaxTokens,
    ),
    temperature: numFromEnv(
      env.READING_LLM_TEMPERATURE,
      DEFAULT_LLM_TUNING.temperature,
    ),
  };
}

/** Provider token usage, logged per call — the app's only spend telemetry. */
interface LlmUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

function asCount(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function reportUsage(
  provider: string,
  model: string,
  kind: "generate" | "stream" | "chat",
  usage: LlmUsage,
): void {
  console.log(`[llm] usage ${JSON.stringify({ provider, model, kind, ...usage })}`);
}

// Transient provider failures worth retrying; 4xx (except timeout/rate-limit)
// are deterministic and fail fast — including the 400s the param-adaptation
// flow inspects.
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 529]);
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_AFTER_CAP_MS = 20_000;

/** Parse a Retry-After header (delta-seconds or HTTP-date), capped. */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.min(secs * 1000, RETRY_AFTER_CAP_MS);
  }
  const at = Date.parse(raw);
  if (!Number.isNaN(at)) {
    return Math.min(Math.max(0, at - Date.now()), RETRY_AFTER_CAP_MS);
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * POST with transient-failure retry: network errors and 408/429/5xx get up
 * to two more attempts with Retry-After-aware exponential backoff + jitter.
 * Retries cover only the window up to response headers — a streaming body is
 * never retried mid-read — and `timeoutMs` is the wall-clock budget for all
 * attempts together, preserving the original single-timeout semantics. The
 * caller's own abort (client disconnect) is never retried. The final
 * response is returned as-is; status handling stays with the caller.
 */
async function fetchWithRetry(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(Math.max(1, timeoutMs - (Date.now() - started)));
    let res: Response | null = null;
    let failure: unknown = null;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
    } catch (e) {
      failure = e;
      if (signal?.aborted) {
        throw new LlmUnavailableError(`LLM request to ${url} failed`, e);
      }
    }
    if (res && !RETRYABLE_STATUSES.has(res.status)) return res;

    const delay =
      (res ? retryAfterMs(res) : null) ??
      RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * 250;
    const budgetLeft = timeoutMs - (Date.now() - started);
    if (attempt >= RETRY_MAX_ATTEMPTS - 1 || delay >= budgetLeft) {
      if (res) return res;
      throw new LlmUnavailableError(`LLM request to ${url} failed`, failure);
    }
    res?.body?.cancel().catch(() => {});
    await sleep(delay);
  }
}

/** Throw the caller-facing error for a non-ok provider response. */
async function throwForStatus(url: string, res: Response): Promise<never> {
  // Provider error bodies name the actual problem (bad key, unknown model,
  // quota); a bare status is undiagnosable.
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  throw new LlmUnavailableError(
    `LLM request to ${url} returned ${res.status}${detail ? `: ${detail}` : ""}`,
    undefined,
    res.status,
  );
}

/**
 * POST and yield the response body's complete lines. Errors before the first
 * byte (bad key, unknown model) surface exactly like `post` failures so the
 * openai param-adaptation retry can inspect the message.
 */
async function* postLines(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetchWithRetry(url, body, headers, timeoutMs, signal);
  if (!res.ok) await throwForStatus(url, res);
  if (!res.body) {
    throw new LlmUnavailableError(`LLM request to ${url} returned no body`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const lines = new LineBuffer();
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        throw new LlmUnavailableError(`LLM stream from ${url} failed`, e);
      }
      if (chunk.done) break;
      for (const line of lines.push(decoder.decode(chunk.value, { stream: true }))) {
        yield line;
      }
    }
    const rest = lines.flush();
    if (rest !== null) yield rest;
  } finally {
    reader.releaseLock();
  }
}

async function post(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
) {
  const res = await fetchWithRetry(url, body, headers, timeoutMs);
  if (!res.ok) await throwForStatus(url, res);
  return res.json() as Promise<Record<string, unknown>>;
}

/** Ollama's final NDJSON document carries the call's token counts. */
function ollamaUsage(json: {
  prompt_eval_count?: unknown;
  eval_count?: unknown;
}): LlmUsage {
  return {
    input: asCount(json.prompt_eval_count),
    output: asCount(json.eval_count),
  };
}

/** Ollama native API: POST {base}/api/generate, non-streaming. */
export function ollamaClient(
  baseUrl: string,
  model: string,
  tuning: LlmTuning = DEFAULT_LLM_TUNING,
): LlmClient {
  return {
    modelName: model,
    async generate(prompt) {
      const json = await post(
        `${baseUrl.replace(/\/$/, "")}/api/generate`,
        {
          model,
          prompt,
          stream: false,
          options: { num_predict: tuning.maxTokens, temperature: tuning.temperature },
        },
        {},
        tuning.timeoutMs,
      );
      if (typeof json.response !== "string" || json.response === "") {
        throw new LlmUnavailableError("Ollama returned no response text");
      }
      reportUsage("ollama", model, "generate", ollamaUsage(json));
      return json.response;
    },
    async *generateStream(prompt, signal) {
      // Ollama streams NDJSON: one JSON document per line.
      const lines = postLines(
        `${baseUrl.replace(/\/$/, "")}/api/generate`,
        {
          model,
          prompt,
          stream: true,
          options: { num_predict: tuning.maxTokens, temperature: tuning.temperature },
        },
        {},
        tuning.timeoutMs,
        signal,
      );
      for await (const line of lines) {
        if (line.trim() === "") continue;
        let json: {
          response?: unknown;
          done?: unknown;
          prompt_eval_count?: unknown;
          eval_count?: unknown;
        };
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof json.response === "string" && json.response !== "") {
          yield json.response;
        }
        if (json.done === true) {
          reportUsage("ollama", model, "stream", ollamaUsage(json));
          return;
        }
      }
    },
    async *generateChat(system, messages, signal) {
      // Ollama's chat endpoint: system rides as the first message; NDJSON
      // deltas arrive under message.content.
      const lines = postLines(
        `${baseUrl.replace(/\/$/, "")}/api/chat`,
        {
          model,
          messages: [{ role: "system", content: system }, ...messages],
          stream: true,
          options: {
            num_predict: tuning.chatMaxTokens,
            temperature: tuning.temperature,
          },
        },
        {},
        tuning.timeoutMs,
        signal,
      );
      for await (const line of lines) {
        if (line.trim() === "") continue;
        let json: {
          message?: { content?: unknown };
          done?: unknown;
          prompt_eval_count?: unknown;
          eval_count?: unknown;
        };
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        const content = json.message?.content;
        if (typeof content === "string" && content !== "") yield content;
        if (json.done === true) {
          reportUsage("ollama", model, "chat", ollamaUsage(json));
          return;
        }
      }
    },
  };
}

/**
 * OpenAI's newer models retire the legacy generation params (`max_tokens` →
 * `max_completion_tokens`; `temperature` fixed at the default), while many
 * OpenAI-compatible servers only accept the legacy names. Rather than
 * tracking model families, adapt to the provider's own 400: rename or drop
 * the param it complains about and let the caller retry. Null ⇔ the error
 * isn't a recognizable unsupported-parameter complaint.
 */
function adaptUnsupportedParam(
  body: Record<string, unknown>,
  message: string,
): Record<string, unknown> | null {
  if (!/unsupported/i.test(message)) return null;
  if (message.includes("'max_tokens'") && "max_tokens" in body) {
    const { max_tokens, ...rest } = body;
    return { ...rest, max_completion_tokens: max_tokens };
  }
  if (message.includes("'temperature'") && "temperature" in body) {
    const { temperature, ...rest } = body;
    return rest;
  }
  return null;
}

/** OpenAI-compatible chat API — hosted providers and Ollama's compat mode. */
export function openAiCompatClient(
  baseUrl: string,
  model: string,
  apiKey: string,
  tuning: LlmTuning = DEFAULT_LLM_TUNING,
): LlmClient {
  return {
    modelName: model,
    async generate(prompt) {
      const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
      let body: Record<string, unknown> = {
        model,
        messages: [{ role: "user", content: prompt }],
        // Legacy names first — the broadly compatible baseline; newer OpenAI
        // models get their spelling via the adaptive retry below.
        max_tokens: tuning.maxTokens,
        temperature: tuning.temperature,
      };
      let json: Record<string, unknown>;
      // At most two adaptations (max_tokens rename + temperature drop).
      for (let attempt = 0; ; attempt++) {
        try {
          json = await post(
            url,
            body,
            { authorization: `Bearer ${apiKey}` },
            tuning.timeoutMs,
          );
          break;
        } catch (e) {
          const adapted =
            e instanceof LlmUnavailableError && attempt < 2
              ? adaptUnsupportedParam(body, e.message)
              : null;
          if (!adapted) throw e;
          body = adapted;
        }
      }
      const usage = json.usage as
        | { prompt_tokens?: unknown; completion_tokens?: unknown }
        | undefined;
      if (usage) {
        reportUsage("api", model, "generate", {
          input: asCount(usage.prompt_tokens),
          output: asCount(usage.completion_tokens),
        });
      }
      const choices = json.choices as
        | { message?: { content?: unknown } }[]
        | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content !== "string" || content === "") {
        throw new LlmUnavailableError("LLM API returned no message content");
      }
      return content;
    },
    generateStream(prompt, signal) {
      return openAiSseStream(
        `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
        {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: tuning.maxTokens,
          temperature: tuning.temperature,
          stream: true,
        },
        apiKey,
        tuning,
        "stream",
        signal,
      );
    },
    generateChat(system, messages, signal) {
      return openAiSseStream(
        `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
        {
          model,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: tuning.chatMaxTokens,
          temperature: tuning.temperature,
          stream: true,
        },
        apiKey,
        tuning,
        "chat",
        signal,
      );
    },
  };
}

/**
 * OpenAI-dialect SSE consumption shared by generateStream and generateChat.
 * Param adaptation applies only before the first byte: postLines fails fast
 * on a 400, so nothing has been emitted when we retry. Usage is logged when
 * the server volunteers it in a chunk (many compat servers don't, and
 * `stream_options.include_usage` is deliberately not sent — unknown params
 * 400 on strict compat servers and the adaptation loop only knows two
 * renames).
 */
async function* openAiSseStream(
  url: string,
  initialBody: Record<string, unknown>,
  apiKey: string,
  tuning: LlmTuning,
  kind: "stream" | "chat",
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const model = String(initialBody.model ?? "");
  let usage: LlmUsage | null = null;
  const reportIfPresent = () => {
    if (usage) reportUsage("api", model, kind, usage);
  };
  let body = initialBody;
  for (let attempt = 0; ; attempt++) {
    const iter = postLines(
      url,
      body,
      { authorization: `Bearer ${apiKey}` },
      tuning.timeoutMs,
      signal,
    )[Symbol.asyncIterator]();
    let result: IteratorResult<string>;
    try {
      result = await iter.next();
    } catch (e) {
      const adapted =
        e instanceof LlmUnavailableError && attempt < 2
          ? adaptUnsupportedParam(body, e.message)
          : null;
      if (!adapted) throw e;
      body = adapted;
      continue;
    }
    while (!result.done) {
      const data = sseData(result.value);
      if (data !== null) {
        if (data === "[DONE]") {
          reportIfPresent();
          return;
        }
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: unknown } }[];
            usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
          };
          if (json.usage) {
            usage = {
              input: asCount(json.usage.prompt_tokens),
              output: asCount(json.usage.completion_tokens),
            };
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta !== "") yield delta;
        } catch {
          // Ignore malformed keep-alive/other lines.
        }
      }
      result = await iter.next();
    }
    reportIfPresent();
    return;
  }
}

/**
 * Anthropic Messages API: POST {base}/v1/messages. Current Claude models
 * reject the `temperature` parameter, so it is omitted entirely (the API
 * default applies). Safety classifiers can decline a request with a 200 and
 * `stop_reason: "refusal"` — surfaced as unavailability, matching the other
 * clients' empty-response handling.
 */
export function anthropicClient(
  baseUrl: string,
  model: string,
  apiKey: string,
  tuning: LlmTuning = DEFAULT_LLM_TUNING,
): LlmClient {
  return {
    modelName: model,
    async generate(prompt) {
      const json = await post(
        `${baseUrl.replace(/\/$/, "")}/v1/messages`,
        {
          model,
          max_tokens: tuning.maxTokens,
          messages: [{ role: "user", content: prompt }],
        },
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        tuning.timeoutMs,
      );
      const usage = json.usage as Record<string, unknown> | undefined;
      if (usage) {
        reportUsage("anthropic", model, "generate", anthropicUsage(usage));
      }
      if (json.stop_reason === "refusal") {
        throw new LlmUnavailableError("Anthropic declined the request (refusal)");
      }
      const blocks = json.content as { type?: unknown; text?: unknown }[] | undefined;
      const text = (blocks ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
      if (text === "") {
        throw new LlmUnavailableError("Anthropic returned no text content");
      }
      return text;
    },
    generateStream(prompt, signal) {
      return anthropicSseStream(
        `${baseUrl.replace(/\/$/, "")}/v1/messages`,
        {
          model,
          max_tokens: tuning.maxTokens,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        },
        apiKey,
        tuning,
        "stream",
        signal,
      );
    },
    generateChat(system, messages, signal) {
      return anthropicSseStream(
        `${baseUrl.replace(/\/$/, "")}/v1/messages`,
        {
          model,
          max_tokens: tuning.chatMaxTokens,
          // Cache breakpoint on the system block: every chat turn re-sends
          // the full chart + stored reading, so turn 2+ reads the prefix at
          // the cached-input rate. Below-minimum prompts silently skip
          // caching — never an error.
          system: [
            { type: "text", text: system, cache_control: { type: "ephemeral" } },
          ],
          messages,
          stream: true,
        },
        apiKey,
        tuning,
        "chat",
        signal,
      );
    },
  };
}

/** Map Anthropic's usage field names to the log's compact ones. */
function anthropicUsage(usage: Record<string, unknown>): LlmUsage {
  return {
    input: asCount(usage.input_tokens),
    output: asCount(usage.output_tokens),
    cacheRead: asCount(usage.cache_read_input_tokens),
    cacheWrite: asCount(usage.cache_creation_input_tokens),
  };
}

/** Anthropic-dialect SSE consumption shared by generateStream and generateChat. */
async function* anthropicSseStream(
  url: string,
  body: Record<string, unknown>,
  apiKey: string,
  tuning: LlmTuning,
  kind: "stream" | "chat",
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const model = String(body.model ?? "");
  // message_start carries input/cache counts; message_delta the output count.
  let usage: LlmUsage = {};
  const lines = postLines(
    url,
    body,
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    tuning.timeoutMs,
    signal,
  );
  for await (const line of lines) {
    const data = sseData(line);
    if (data === null) continue;
    let json: {
      type?: unknown;
      message?: { usage?: Record<string, unknown> };
      usage?: Record<string, unknown>;
      delta?: { type?: unknown; text?: unknown; stop_reason?: unknown };
      error?: { message?: unknown };
    };
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    switch (json.type) {
      case "message_start":
        if (json.message?.usage) {
          usage = { ...usage, ...anthropicUsage(json.message.usage) };
        }
        break;
      case "content_block_delta":
        if (
          json.delta?.type === "text_delta" &&
          typeof json.delta.text === "string" &&
          json.delta.text !== ""
        ) {
          yield json.delta.text;
        }
        break;
      case "message_delta":
        if (json.usage) {
          usage.output = asCount(json.usage.output_tokens) ?? usage.output;
        }
        if (json.delta?.stop_reason === "refusal") {
          throw new LlmUnavailableError(
            "Anthropic declined the request (refusal)",
          );
        }
        break;
      case "error":
        throw new LlmUnavailableError(
          `Anthropic stream error: ${String(json.error?.message ?? "unknown")}`,
        );
      case "message_stop":
        reportUsage("anthropic", model, kind, usage);
        return;
    }
  }
}

/** Null ⇔ the hook is off or misconfigured; callers treat both as disabled. */
export function llmClientFromEnv(
  env: Record<string, string | undefined> = process.env,
): LlmClient | null {
  const mode = env.READING_LLM ?? "off";
  const model = env.READING_LLM_MODEL;
  const tuning = llmTuningFromEnv(env);
  if (mode === "ollama" && model) {
    return ollamaClient(
      env.READING_LLM_BASE_URL ?? "http://localhost:11434",
      model,
      tuning,
    );
  }
  if (mode === "api" && model && env.READING_LLM_BASE_URL && env.READING_LLM_API_KEY) {
    return openAiCompatClient(
      env.READING_LLM_BASE_URL,
      model,
      env.READING_LLM_API_KEY,
      tuning,
    );
  }
  if (mode === "anthropic" && model && env.READING_LLM_API_KEY) {
    return anthropicClient(
      env.READING_LLM_BASE_URL ?? "https://api.anthropic.com",
      model,
      env.READING_LLM_API_KEY,
      tuning,
    );
  }
  return null;
}

/**
 * Prompt for the stored synthesis: the complete chart and numerology data
 * plus the already-resolved library entries. Birth details (`chart.input`:
 * instant, coordinates) are never included; the name appears only through
 * the numerology word derivations.
 */
export function buildReadingPrompt(
  resolved: ResolvedReading,
  chart: WheelChart,
  numerology: NumeroDerivation | null,
): string {
  const { dominance } = resolved;
  const counts = Object.entries(dominance.counts)
    .map(([element, n]) => `${element} ${n}`)
    .join(", ");

  const sections = resolved.sections
    .filter((s) => s.slot !== "synthesis")
    .map((s) => `### ${s.title} (${s.source})\n${s.bodyMd}`)
    .join("\n\n");

  const instructions = [
    "You are writing one synthesized natal reading for an astrology and numerology app.",
    "Below are the complete chart and numerology data for this person, followed by the individual interpretation entries that apply.",
    "Ground the reading in the complete data — you may draw on any placement, aspect, or number, not only those covered by the interpretation entries.",
    "Weave everything into a single original reading of roughly 400 words in Markdown",
    "(paragraphs, optional **bold** and *italic*, optional - lists; no headings, no HTML, no links).",
    "Synthesize rather than restate: name the tensions and reinforcements between the placements.",
    "Address the reader as \"you\". Be concrete and even-handed — strengths and friction both.",
    chart.isSolarChart
      ? "Birth time is unknown (solar chart): do not mention houses or a rising sign."
      : "",
    `Element distribution across the ten planets: ${counts} (dominant: ${dominance.dominant}).`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    instructions,
    `## Complete chart data\n${renderChartData(chart)}`,
    numerology
      ? `## Complete numerology data\n${renderNumerologyData(numerology)}`
      : "",
    `## Interpretation entries\n${sections}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Prompt for the Mazal-tab synthesis: the complete Mazal chart, gematria,
 * and numerology data plus the resolveHebrewReading sections. The sections
 * are Hebrew source material, but the instructions ask for an English
 * reading (Hebrew terms transliterated). Like buildReadingPrompt, birth
 * details (`mazal.input`) are never included; the Hebrew name appears via
 * the gematria derivation, as it already does in the name_gematria section.
 * Suppressed data (planetary hour on unknown time, name gematria without a
 * Hebrew name) is simply absent — no caveat flags needed.
 */
export function buildHebrewReadingPrompt(
  resolved: ResolvedHebrewReading,
  mazal: StoredMazal,
  gematria: StoredHebrewGematria,
  numerology: NumeroDerivation | null,
): string {
  const sections = resolved.sections
    .map((s) => `### ${s.title} (${s.source})\n${s.bodyMd}`)
    .join("\n\n");

  const instructions = [
    "You are writing one synthesized reading for the Jewish astrology (Mazal) and gematria tab of an astrology and numerology app.",
    "Below are the complete Mazal chart and numerology data for this person, followed by the interpretation entries that apply.",
    "The interpretation entries are written in Hebrew: draw on their ideas and translate them — do not quote them untranslated.",
    "Write the reading entirely in English. Keep key Hebrew terms transliterated (mazal, Sefer Yetzirah, gematria, mispar katan), with a brief gloss where helpful.",
    "Weave everything into a single original reading of roughly 300 to 400 words in Markdown",
    "(paragraphs, optional **bold** and *italic*; no headings, no HTML, no links).",
    "Synthesize rather than summarize each entry separately: point out the reinforcements and tensions between them.",
    "Address the reader as \"you\", gender-neutrally. Be concrete and even-handed — strengths and friction both. No promises, no fortune-telling.",
  ].join("\n");

  return [
    instructions,
    `## Complete Mazal chart data\n${renderMazalData(mazal, gematria)}`,
    numerology
      ? `## Complete numerology data\n${renderNumerologyData(numerology)}`
      : "",
    `## Interpretation entries (Hebrew source material)\n${sections}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Forecast prose scales with the period; all fit MAX_TOKENS comfortably.
const FORECAST_WORDS: Record<ForecastKind, number> = {
  day: 250,
  week: 350,
  month: 450,
};

const KIND_LABEL: Record<ForecastKind, string> = {
  day: "daily forecast for this day",
  week: "weekly forecast for this Sunday-to-Saturday week",
  month: "monthly forecast for this month",
};

function renderEntrySections(entries: ContentEntry[]): string {
  return entries.map((e) => `### ${e.title}\n${e.bodyMd}`).join("\n\n");
}

/**
 * Prompt for a western transit forecast: the period's sky (positions, Moon
 * spans, ingresses/stations, aspect windows) interpreted against the natal
 * chart. `aspectContext` holds the natal `aspect` library entries for the
 * strongest transiting pairs — archetypal pair prose the model is told to
 * adapt to a transit reading. Like buildReadingPrompt, birth details
 * (`chart.input`) are never included.
 */
export function buildWesternForecastPrompt(
  summary: WesternPeriodSummary,
  chart: WheelChart,
  aspectContext: ContentEntry[],
): string {
  const kind = summary.period.kind;
  const instructions = [
    `You are writing one ${KIND_LABEL[kind]} for an astrology app, based on the current transits over this person's natal chart.`,
    "Below are the period's sky data, the complete natal chart, and interpretation entries for the strongest planetary pairs in play.",
    "The interpretation entries describe each pair archetypally in a natal context — adapt their themes to transits unfolding over this period, do not restate them.",
    "Emphasize the strongest and slowest-moving contacts; treat fast Moon movements as day-to-day texture, not headlines.",
    "Event dates come from daily sampling: phrase timing approximately (\"around\", \"early in the week\"), never as precise moments.",
    `Weave everything into a single original forecast of roughly ${FORECAST_WORDS[kind]} words in Markdown`,
    "(paragraphs, optional **bold** and *italic*, optional - lists; no headings, no HTML, no links).",
    "Address the reader as \"you\", gender-neutrally. Be concrete and even-handed — openings and frictions both. No promises, no fortune-telling: describe climates and invitations, not fixed outcomes.",
    summary.natal.isSolarChart
      ? "Birth time is unknown (solar chart): do not mention houses or a rising sign."
      : "",
    summary.natal.moonUncertain
      ? "The natal Moon sign is uncertain: hedge any claims that depend on contacts to the natal Moon."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    instructions,
    `## Period sky data\n${renderWesternPeriodData(summary)}`,
    `## Complete natal chart data\n${renderChartData(chart)}`,
    aspectContext.length > 0
      ? `## Interpretation entries (natal archetypes for the pairs in play)\n${renderEntrySections(aspectContext)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Prompt for a Hebrew (Mazal) forecast: the period's Hebrew calendar —
 * daytime-mapping dates, month mazal(ot), day planets, date gematria —
 * interpreted against this person's natal Mazal chart. `monthContext` holds
 * the Hebrew library entries in play (mazal_month, plus day_planet /
 * hebrew_date_gematria for daily forecasts). Hebrew sources in, English
 * prose out, matching buildHebrewReadingPrompt; birth details
 * (`mazal.input`) are never included.
 */
export function buildHebrewForecastPrompt(
  summary: HebrewPeriodSummary,
  natalMazal: StoredMazal,
  natalGematria: StoredHebrewGematria,
  monthContext: ContentEntry[],
): string {
  const kind = summary.period.kind;
  const instructions = [
    `You are writing one ${KIND_LABEL[kind]} for the Jewish astrology (Mazal) side of an astrology app, reading the period's Hebrew calendar against this person's natal Mazal chart.`,
    "Below are the period's Hebrew calendar data, the person's complete natal Mazal chart, and the interpretation entries that apply to the period.",
    "The interpretation entries are written in Hebrew: draw on their ideas and translate them — do not quote them untranslated.",
    "Relate the period's energies (month mazal, day planets, date gematria) to the natal chart: where they reinforce the person's natal mazal and where they pull against it.",
    "Hebrew dates use the daytime mapping — after sunset the next Hebrew day has already begun; do not present dates as exact to the hour.",
    "Write the forecast entirely in English. Keep key Hebrew terms transliterated (mazal, Sefer Yetzirah, gematria), with a brief gloss where helpful.",
    `Weave everything into a single original forecast of roughly ${FORECAST_WORDS[kind]} words in Markdown`,
    "(paragraphs, optional **bold** and *italic*, optional - lists; no headings, no HTML, no links).",
    "Address the reader as \"you\", gender-neutrally. Be concrete and even-handed — openings and frictions both. No promises, no fortune-telling: describe climates and invitations, not fixed outcomes.",
  ].join("\n");

  return [
    instructions,
    `## Period Hebrew calendar data\n${renderHebrewPeriodData(summary)}`,
    `## Complete natal Mazal chart data\n${renderMazalData(natalMazal, natalGematria)}`,
    monthContext.length > 0
      ? `## Interpretation entries (Hebrew source material)\n${renderEntrySections(monthContext)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
