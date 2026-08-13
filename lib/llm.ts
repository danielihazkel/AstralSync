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
// Readings ask for ~400 words; the cap bounds spend on a runaway completion.
const MAX_TOKENS = 1_200;
const TEMPERATURE = 0.7;

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
        {
          model,
          messages: [{ role: "user", content: prompt }],
          // max_tokens (not max_completion_tokens) for broad compatibility
          // across OpenAI-compatible providers.
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
        },
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
