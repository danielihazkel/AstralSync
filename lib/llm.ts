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
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LlmUnavailableError";
    this.cause = cause;
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

const TIMEOUT_MS = 60_000;
// Readings ask for ~400 words; the cap bounds spend on a runaway completion.
const MAX_TOKENS = 1_200;
// Chat answers ask for ~150 words; a tighter cap bounds per-turn spend.
const CHAT_MAX_TOKENS = 600;
const TEMPERATURE = 0.7;

/** The request signal for a streaming call: the 60s cap, plus the caller's
 *  abort when provided. */
function streamSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
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
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: streamSignal(signal),
    });
  } catch (e) {
    throw new LlmUnavailableError(`LLM request to ${url} failed`, e);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmUnavailableError(
      `LLM request to ${url} returned ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }
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

async function post(url: string, body: unknown, headers: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new LlmUnavailableError(`LLM request to ${url} failed`, e);
  }
  if (!res.ok) {
    // Provider error bodies name the actual problem (bad key, unknown model,
    // quota); a bare status is undiagnosable.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmUnavailableError(
      `LLM request to ${url} returned ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** Ollama native API: POST {base}/api/generate, non-streaming. */
export function ollamaClient(baseUrl: string, model: string): LlmClient {
  return {
    modelName: model,
    async generate(prompt) {
      const json = await post(
        `${baseUrl.replace(/\/$/, "")}/api/generate`,
        {
          model,
          prompt,
          stream: false,
          options: { num_predict: MAX_TOKENS, temperature: TEMPERATURE },
        },
        {},
      );
      if (typeof json.response !== "string" || json.response === "") {
        throw new LlmUnavailableError("Ollama returned no response text");
      }
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
          options: { num_predict: MAX_TOKENS, temperature: TEMPERATURE },
        },
        {},
        signal,
      );
      for await (const line of lines) {
        if (line.trim() === "") continue;
        let json: { response?: unknown; done?: unknown };
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof json.response === "string" && json.response !== "") {
          yield json.response;
        }
        if (json.done === true) return;
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
          options: { num_predict: CHAT_MAX_TOKENS, temperature: TEMPERATURE },
        },
        {},
        signal,
      );
      for await (const line of lines) {
        if (line.trim() === "") continue;
        let json: { message?: { content?: unknown }; done?: unknown };
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        const content = json.message?.content;
        if (typeof content === "string" && content !== "") yield content;
        if (json.done === true) return;
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
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      };
      let json: Record<string, unknown>;
      // At most two adaptations (max_tokens rename + temperature drop).
      for (let attempt = 0; ; attempt++) {
        try {
          json = await post(url, body, { authorization: `Bearer ${apiKey}` });
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
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          stream: true,
        },
        apiKey,
        signal,
      );
    },
    generateChat(system, messages, signal) {
      return openAiSseStream(
        `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
        {
          model,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: CHAT_MAX_TOKENS,
          temperature: TEMPERATURE,
          stream: true,
        },
        apiKey,
        signal,
      );
    },
  };
}

/**
 * OpenAI-dialect SSE consumption shared by generateStream and generateChat.
 * Param adaptation applies only before the first byte: postLines fails fast
 * on a 400, so nothing has been emitted when we retry.
 */
async function* openAiSseStream(
  url: string,
  initialBody: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let body = initialBody;
  for (let attempt = 0; ; attempt++) {
    const iter = postLines(url, body, { authorization: `Bearer ${apiKey}` }, signal)[
      Symbol.asyncIterator
    ]();
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
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: unknown } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta !== "") yield delta;
        } catch {
          // Ignore malformed keep-alive/other lines.
        }
      }
      result = await iter.next();
    }
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
): LlmClient {
  return {
    modelName: model,
    async generate(prompt) {
      const json = await post(
        `${baseUrl.replace(/\/$/, "")}/v1/messages`,
        {
          model,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
        },
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      );
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
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        },
        apiKey,
        signal,
      );
    },
    generateChat(system, messages, signal) {
      return anthropicSseStream(
        `${baseUrl.replace(/\/$/, "")}/v1/messages`,
        {
          model,
          max_tokens: CHAT_MAX_TOKENS,
          system,
          messages,
          stream: true,
        },
        apiKey,
        signal,
      );
    },
  };
}

/** Anthropic-dialect SSE consumption shared by generateStream and generateChat. */
async function* anthropicSseStream(
  url: string,
  body: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const lines = postLines(
    url,
    body,
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal,
  );
  for await (const line of lines) {
    const data = sseData(line);
    if (data === null) continue;
    let json: {
      type?: unknown;
      delta?: { type?: unknown; text?: unknown; stop_reason?: unknown };
      error?: { message?: unknown };
    };
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    switch (json.type) {
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
  if (mode === "ollama" && model) {
    return ollamaClient(env.READING_LLM_BASE_URL ?? "http://localhost:11434", model);
  }
  if (mode === "api" && model && env.READING_LLM_BASE_URL && env.READING_LLM_API_KEY) {
    return openAiCompatClient(env.READING_LLM_BASE_URL, model, env.READING_LLM_API_KEY);
  }
  if (mode === "anthropic" && model && env.READING_LLM_API_KEY) {
    return anthropicClient(
      env.READING_LLM_BASE_URL ?? "https://api.anthropic.com",
      model,
      env.READING_LLM_API_KEY,
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
