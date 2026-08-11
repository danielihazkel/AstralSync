import type { ResolvedReading } from "./content";

/**
 * Optional LLM synthesis hook (PRD §5): a single combined reading per
 * snapshot pair, generated once and stored forever in the `reading` table.
 * OFF by default — the app is fully functional without it. Configured
 * entirely through the environment:
 *
 *   READING_LLM=off | ollama | api     unset ⇒ off
 *   READING_LLM_MODEL=<model name>     required when not off
 *   READING_LLM_BASE_URL=<url>         ollama default http://localhost:11434;
 *                                      required for api
 *   READING_LLM_API_KEY=<key>          api mode only
 */

export class LlmUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LlmUnavailableError";
    this.cause = cause;
  }
}

export interface LlmClient {
  readonly modelName: string;
  generate(prompt: string): Promise<string>;
}

const TIMEOUT_MS = 60_000;

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
    throw new LlmUnavailableError(`LLM request to ${url} returned ${res.status}`);
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
        { model, prompt, stream: false },
        {},
      );
      if (typeof json.response !== "string" || json.response === "") {
        throw new LlmUnavailableError("Ollama returned no response text");
      }
      return json.response;
    },
  };
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
      const json = await post(
        `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
        { model, messages: [{ role: "user", content: prompt }] },
        { authorization: `Bearer ${apiKey}` },
      );
      const choices = json.choices as
        | { message?: { content?: unknown } }[]
        | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content !== "string" || content === "") {
        throw new LlmUnavailableError("LLM API returned no message content");
      }
      return content;
    },
  };
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
  return null;
}

/**
 * Prompt for the stored synthesis. Built only from chart facts and the
 * already-resolved library entries — no names or birth details.
 */
export function buildReadingPrompt(
  resolved: ResolvedReading,
  opts: { isSolarChart: boolean },
): string {
  const { dominance } = resolved;
  const counts = Object.entries(dominance.counts)
    .map(([element, n]) => `${element} ${n}`)
    .join(", ");

  const sections = resolved.sections
    .filter((s) => s.slot !== "synthesis")
    .map((s) => `### ${s.title} (${s.source})\n${s.bodyMd}`)
    .join("\n\n");

  return [
    "You are writing one synthesized natal reading for an astrology and numerology app.",
    "Below are the individual interpretation entries that apply to this chart.",
    "Weave them into a single original reading of roughly 400 words in Markdown",
    "(paragraphs, optional **bold** and *italic*, optional - lists; no headings, no HTML, no links).",
    "Synthesize rather than restate: name the tensions and reinforcements between the placements.",
    "Address the reader as \"you\". Be concrete and even-handed — strengths and friction both.",
    opts.isSolarChart
      ? "Birth time is unknown (solar chart): do not mention houses or a rising sign."
      : "",
    `Element distribution across the ten planets: ${counts} (dominant: ${dominance.dominant}).`,
    "",
    sections,
  ]
    .filter(Boolean)
    .join("\n");
}
