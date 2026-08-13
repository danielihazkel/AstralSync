import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentEntry, ResolvedReading } from "./content";
import type { HebrewPeriodSummary, WesternPeriodSummary } from "./forecast";
import type { ResolvedHebrewReading } from "./hebrewReading";
import type {
  NumeroDerivation,
  StoredHebrewGematria,
  StoredMazal,
  WheelChart,
} from "./view-types";
import {
  anthropicClient,
  buildHebrewForecastPrompt,
  buildHebrewReadingPrompt,
  buildReadingPrompt,
  buildWesternForecastPrompt,
  llmClientFromEnv,
  LlmUnavailableError,
  ollamaClient,
  openAiCompatClient,
} from "./llm";

describe("llmClientFromEnv", () => {
  it("is off when unset or explicitly off", () => {
    expect(llmClientFromEnv({})).toBeNull();
    expect(llmClientFromEnv({ READING_LLM: "off" })).toBeNull();
    expect(
      llmClientFromEnv({ READING_LLM: "off", READING_LLM_MODEL: "llama3.1" }),
    ).toBeNull();
  });

  it("requires a model name", () => {
    expect(llmClientFromEnv({ READING_LLM: "ollama" })).toBeNull();
  });

  it("builds an ollama client with the default base url", () => {
    const client = llmClientFromEnv({
      READING_LLM: "ollama",
      READING_LLM_MODEL: "llama3.1",
    });
    expect(client?.modelName).toBe("llama3.1");
  });

  it("requires base url and key for api mode", () => {
    const partial = { READING_LLM: "api", READING_LLM_MODEL: "m" };
    expect(llmClientFromEnv(partial)).toBeNull();
    expect(
      llmClientFromEnv({ ...partial, READING_LLM_BASE_URL: "https://x" }),
    ).toBeNull();
    expect(
      llmClientFromEnv({
        ...partial,
        READING_LLM_BASE_URL: "https://x",
        READING_LLM_API_KEY: "k",
      })?.modelName,
    ).toBe("m");
  });

  it("requires a key for anthropic mode, base url defaults", () => {
    const partial = { READING_LLM: "anthropic", READING_LLM_MODEL: "claude-opus-5" };
    expect(llmClientFromEnv(partial)).toBeNull();
    expect(
      llmClientFromEnv({ ...partial, READING_LLM_API_KEY: "k" })?.modelName,
    ).toBe("claude-opus-5");
  });

  it("rejects unknown modes", () => {
    expect(
      llmClientFromEnv({ READING_LLM: "openai", READING_LLM_MODEL: "m" }),
    ).toBeNull();
  });
});

const resolved: ResolvedReading = {
  contentVersion: "1",
  snapshotContentVersion: "1",
  stale: false,
  dominance: {
    counts: { fire: 1, earth: 2, air: 3, water: 4 },
    dominant: "water",
    tied: ["water"],
  },
  modality: {
    counts: { cardinal: 4, fixed: 3, mutable: 3 },
    dominant: "cardinal",
    tied: ["cardinal"],
  },
  sections: [
    {
      slot: "sun",
      key: "planet_in_sign/sun/leo",
      title: "Sun in Leo",
      bodyMd: "Sun body.",
      source: "Sun in Leo — 17°04′",
    },
    {
      slot: "synthesis",
      key: null,
      title: "Putting it together",
      bodyMd: "Composed.",
      source: "Dominant element × Life Path",
    },
  ],
  missingKeys: [],
};

const chart: WheelChart = {
  schemaVersion: 1,
  input: {
    utc: "2000-08-09T10:00:00.000Z",
    latitude: 32.1,
    longitude: 34.8,
    houseSystem: "placidus",
    timeCertainty: "exact",
  },
  isSolarChart: false,
  houses: {
    system: "placidus",
    requestedSystem: "placidus",
    fallbackApplied: false,
    cusps: [222.5, 252, 282, 312, 342, 12, 42.5, 72, 102, 132, 162, 192],
    ascendant: 222.5,
    mc: 132,
  },
  placements: [
    {
      planet: "sun",
      longitude: 137.07,
      sign: "leo",
      degreeInSign: 17.07,
      house: 10,
      retrograde: false,
    },
    {
      planet: "pluto",
      longitude: 245.5,
      sign: "sagittarius",
      degreeInSign: 5.5,
      house: 2,
      retrograde: true,
    },
  ],
  aspects: [
    { a: "sun", b: "moon", type: "trine", angle: 120, orb: 1.05 },
    { a: "sun", b: "pluto", type: "square", angle: 90, orb: 5.2 },
  ],
  bigThree: { sun: "leo", moon: "sagittarius", ascendant: "scorpio" },
  uncertainties: [],
  engine: { name: "test", version: "0" },
  tzWarnings: [],
};

const solarChart: WheelChart = {
  ...chart,
  isSolarChart: true,
  houses: null,
  placements: chart.placements.map((p) => ({ ...p, house: null })),
  bigThree: { ...chart.bigThree, ascendant: null },
};

const numero: NumeroDerivation = {
  lifePath: {
    value: 7,
    isMaster: false,
    derivation: {
      components: [
        { part: "month", raw: 8, steps: [], reduced: 8 },
        { part: "day", raw: 9, steps: [], reduced: 9 },
        { part: "year", raw: 2000, steps: [2], reduced: 2 },
      ],
      total: 19,
      steps: [10, 1],
    },
  },
  destiny: {
    system: "pythagorean",
    value: 11,
    isMaster: true,
    derivation: {
      words: [
        {
          word: "Dana",
          letters: [
            { char: "d", value: 4 },
            { char: "a", value: 1, isVowel: true },
            { char: "n", value: 5 },
            { char: "a", value: 1, isVowel: true },
          ],
          subtotal: 11,
          steps: [],
          reduced: 11,
        },
      ],
      total: 11,
      steps: [],
    },
  },
  soulUrge: null,
  hebrewDestiny: null,
};

describe("buildReadingPrompt", () => {
  it("includes entry titles, bodies, and the element distribution", () => {
    const prompt = buildReadingPrompt(resolved, chart, numero);
    expect(prompt).toContain("Sun in Leo");
    expect(prompt).toContain("Sun body.");
    expect(prompt).toContain("water 4");
    expect(prompt).toContain("dominant: water");
    expect(prompt).not.toContain("solar chart");
  });

  it("includes the complete chart data — outer planets, houses, aspects", () => {
    const prompt = buildReadingPrompt(resolved, chart, numero);
    expect(prompt).toContain("## Complete chart data");
    expect(prompt).toContain("Pluto: Sagittarius 5°30′, 2nd house, retrograde");
    expect(prompt).toContain("Ascendant (rising): Scorpio 12°30′");
    expect(prompt).toContain("7th house cusp: Taurus 12°30′");
    expect(prompt).toContain("Sun square Pluto — orb 5°12′");
  });

  it("includes the lunar nodes as derived positions without leaking the instant", () => {
    const prompt = buildReadingPrompt(resolved, chart, numero);
    expect(prompt).toContain("Points (lunar nodes, true node):");
    expect(prompt).toMatch(/- North Node: [A-Z][a-z]+ \d+°\d{2}′/);
    expect(prompt).toMatch(/- South Node: [A-Z][a-z]+ \d+°\d{2}′/);
    expect(prompt).not.toContain("2000-08-09");
  });

  it("includes the complete numerology data with derivations", () => {
    const prompt = buildReadingPrompt(resolved, chart, numero);
    expect(prompt).toContain("## Complete numerology data");
    expect(prompt).toContain("Life Path: 7");
    expect(prompt).toContain("Destiny (Expression): 11 (master number)");
    expect(prompt).toContain("Dana: d=4 a=1 n=5 a=1; 11");
    expect(buildReadingPrompt(resolved, chart, null)).not.toContain(
      "## Complete numerology data",
    );
  });

  it("excludes the composed synthesis section from the source material", () => {
    expect(buildReadingPrompt(resolved, chart, numero)).not.toContain(
      "Composed.",
    );
  });

  it("adds the solar-chart caveat and suppresses houses in the data block", () => {
    const prompt = buildReadingPrompt(resolved, solarChart, numero);
    expect(prompt).toContain("solar chart");
    expect(prompt).toContain("Pluto: Sagittarius, retrograde");
    expect(prompt).not.toContain("2nd house");
    expect(prompt).not.toContain("house cusp");
    expect(prompt).not.toContain("Ascendant (rising)");
    expect(prompt).not.toContain("orb");
  });
});

const resolvedHebrew: ResolvedHebrewReading = {
  contentVersion: "1",
  snapshotContentVersion: "1",
  stale: false,
  dir: "rtl",
  sections: [
    {
      slot: "hebrew_date",
      key: null,
      title: "התאריך העברי",
      bodyMd: "כ״ד טֵבֵת תש״ס",
      source: "1.1.2000",
    },
    {
      slot: "month_mazal",
      key: "mazal_month/tevet",
      title: "מזל גדי — חודש טבת",
      bodyMd: "גוף הפרק על מזל גדי.",
      source: "חודש טבת — מזל גדי",
    },
  ],
  missingKeys: [],
};

const hebrewDateParts = {
  year: 5760,
  month: 10,
  day: 24,
  monthKey: "tevet" as const,
  monthName: "Tevet",
  weekday: 6,
  renderGematriya: "כ״ד טֵבֵת תש״ס",
};

const mazal: StoredMazal = {
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
  uncertainties: [{ field: "birth_time", reason: "Birth time unknown." }],
  engine: { name: "test", version: "0" },
};

const gematria: StoredHebrewGematria = {
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
};

describe("buildHebrewReadingPrompt", () => {
  it("writes the instructions in English and asks for English output", () => {
    const prompt = buildHebrewReadingPrompt(resolvedHebrew, mazal, gematria, numero);
    expect(prompt).toContain("entirely in English");
    expect(prompt).not.toContain("בעברית בלבד");
    expect(prompt).toContain("300");
    expect(prompt).toContain("400");
    // No instruction text leaks in from the astro prompt.
    expect(prompt).not.toContain("Element distribution");
  });

  it("includes the complete Mazal data, skipping the null planetary hour", () => {
    const prompt = buildHebrewReadingPrompt(resolvedHebrew, mazal, gematria, numero);
    expect(prompt).toContain("## Complete Mazal chart data");
    expect(prompt).toContain("24 Tevet 5760");
    expect(prompt).toContain("Mazal (month sign): Tevet — Gdi (Capricorn)");
    expect(prompt).toContain("Day planet: Saturday — Saturn");
    expect(prompt).toContain("Hebrew date gematria: 5");
    expect(prompt).not.toContain("Planetary hour");
    expect(prompt).not.toContain("Name gematria");
  });

  it("includes the numerology data when available", () => {
    const withNumero = buildHebrewReadingPrompt(resolvedHebrew, mazal, gematria, numero);
    expect(withNumero).toContain("## Complete numerology data");
    expect(withNumero).toContain("Life Path: 7");
    const withoutNumero = buildHebrewReadingPrompt(resolvedHebrew, mazal, gematria, null);
    expect(withoutNumero).not.toContain("## Complete numerology data");
  });

  it("includes every section with its title, source, and body", () => {
    const prompt = buildHebrewReadingPrompt(resolvedHebrew, mazal, gematria, numero);
    expect(prompt).toContain("### התאריך העברי (1.1.2000)");
    expect(prompt).toContain("כ״ד טֵבֵת תש״ס");
    expect(prompt).toContain("### מזל גדי — חודש טבת (חודש טבת — מזל גדי)");
    expect(prompt).toContain("גוף הפרק על מזל גדי.");
  });
});

const westernSummary: WesternPeriodSummary = {
  period: {
    kind: "week",
    start: { year: 2026, month: 8, day: 9 },
    end: { year: 2026, month: 8, day: 15 },
    days: 7,
  },
  startPlacements: chart.placements,
  natal: { version: 2, isSolarChart: false, moonUncertain: false },
  moonBySign: [
    {
      sign: "pisces",
      fromDate: { year: 2026, month: 8, day: 9 },
      toDate: { year: 2026, month: 8, day: 11 },
    },
  ],
  moonNext: null,
  events: [
    {
      type: "station",
      planet: "saturn",
      direction: "retrograde",
      aroundDate: { year: 2026, month: 8, day: 14 },
    },
  ],
  topAspects: [
    {
      a: "saturn",
      b: "sun",
      type: "square",
      minOrb: 0.2,
      closestDate: { year: 2026, month: 8, day: 11 },
      appliedAllPeriod: true,
    },
  ],
};

const aspectEntries = {
  transit: [] as ContentEntry[],
  natalArchetypes: [
    {
      key: "aspect/sun/saturn/square",
      category: "aspect" as const,
      title: "Sun square Saturn",
      essence: null,
      bodyMd: "Pressure meets purpose.",
    },
  ],
};

const NO_ENTRIES = { transit: [], natalArchetypes: [] };

describe("buildWesternForecastPrompt", () => {
  it("frames the kind, word target, and approximate timing", () => {
    const prompt = buildWesternForecastPrompt(westernSummary, chart, aspectEntries);
    expect(prompt).toContain("weekly forecast");
    expect(prompt).toContain("roughly 350 words");
    expect(prompt).toContain("phrase timing approximately");
    expect(prompt).toContain("adapt their themes to transits");
  });

  it("includes the period sky, the natal chart, and the aspect entries", () => {
    const prompt = buildWesternForecastPrompt(westernSummary, chart, aspectEntries);
    expect(prompt).toContain("## Period sky data");
    expect(prompt).toContain("- Saturn stations retrograde around 2026-08-14");
    expect(prompt).toContain("Transiting Saturn square natal Sun");
    expect(prompt).toContain("## Complete natal chart data");
    expect(prompt).toContain("Sun square Pluto — orb 5°12′");
    expect(prompt).toContain("### Sun square Saturn");
    expect(prompt).toContain("Pressure meets purpose.");
  });

  it("separates authored transit prose from natal archetypes", () => {
    const prompt = buildWesternForecastPrompt(westernSummary, chart, {
      transit: [
        {
          key: "transit_aspect/saturn/sun/square",
          category: "transit_aspect",
          title: "Transiting Saturn square natal Sun",
          essence: null,
          bodyMd: "A pruning season.",
        },
      ],
      natalArchetypes: aspectEntries.natalArchetypes,
    });
    expect(prompt).toContain("## Transit interpretations");
    expect(prompt).toContain("A pruning season.");
    expect(prompt).toContain("ground the forecast's headlines in them");
    expect(prompt).toContain("natal archetypes for the pairs in play");
    expect(prompt).toContain("adapt their themes to transits");
  });

  it("drops the adapt instruction when only transit prose is present", () => {
    const prompt = buildWesternForecastPrompt(westernSummary, chart, {
      transit: [
        {
          key: "transit_aspect/saturn/sun/square",
          category: "transit_aspect",
          title: "Transiting Saturn square natal Sun",
          essence: null,
          bodyMd: "A pruning season.",
        },
      ],
      natalArchetypes: [],
    });
    expect(prompt).not.toContain("adapt their themes to transits");
    expect(prompt).not.toContain("natal archetypes");
  });

  it("scales the word target by kind and omits an empty entries section", () => {
    const day = buildWesternForecastPrompt(
      {
        ...westernSummary,
        period: { ...westernSummary.period, kind: "day" },
      },
      chart,
      NO_ENTRIES,
    );
    expect(day).toContain("daily forecast");
    expect(day).toContain("roughly 250 words");
    expect(day).not.toContain("## Interpretation entries");
    expect(day).not.toContain("## Transit interpretations");
  });

  it("adds solar-chart and uncertain-Moon caveats", () => {
    const prompt = buildWesternForecastPrompt(
      {
        ...westernSummary,
        natal: { version: 2, isSolarChart: true, moonUncertain: true },
        startPlacements: solarChart.placements,
      },
      solarChart,
      NO_ENTRIES,
    );
    expect(prompt).toContain("solar chart");
    expect(prompt).toContain("natal Moon sign is uncertain");
  });

  it("never leaks the birth instant or coordinates", () => {
    const prompt = buildWesternForecastPrompt(westernSummary, chart, aspectEntries);
    expect(prompt).not.toContain("2000-08-09");
    expect(prompt).not.toContain("32.1");
    expect(prompt).not.toContain("34.8");
  });
});

const hebrewSummary: HebrewPeriodSummary = {
  period: {
    kind: "day",
    start: { year: 2026, month: 8, day: 13 },
    end: { year: 2026, month: 8, day: 13 },
    days: 1,
  },
  days: [
    {
      civil: { year: 2026, month: 8, day: 13 },
      hebrew: {
        year: 5786,
        month: 5,
        day: 30,
        monthKey: "av",
        monthName: "Av",
        weekday: 4,
        renderGematriya: "ל׳ אָב תשפ״ו",
      },
      dayPlanet: "jupiter",
      dateGematria: {
        value: 6,
        isMaster: false,
        derivation: {
          components: [
            { part: "day", raw: 30, steps: [3], reduced: 3 },
            { part: "year", raw: 5786, steps: [26, 8], reduced: 8 },
          ],
          total: 11,
          steps: [2],
        },
      },
    },
  ],
  months: [
    {
      monthKey: "av",
      monthName: "Av",
      mazal: { month: "av", mazal: "aryeh", hebrew: "אריה", sign: "leo" },
      seferYetzirah: {
        month: "av",
        letter: "ט",
        letterName: "Tet",
        tribe: "shimon",
        tribeHebrew: "שמעון",
        faculty: "hearing",
        facultyHebrew: "שמיעה",
      },
      fromCivil: { year: 2026, month: 8, day: 13 },
      toCivil: { year: 2026, month: 8, day: 13 },
    },
  ],
};

const hebrewEntries: ContentEntry[] = [
  {
    key: "mazal_month/av",
    category: "mazal_month",
    title: "מזל אריה — חודש אב",
    essence: null,
    bodyMd: "גוף הפרק על מזל אריה.",
  },
];

describe("buildHebrewForecastPrompt", () => {
  it("reads the period against the natal Mazal, in English, Hebrew sources in", () => {
    const prompt = buildHebrewForecastPrompt(hebrewSummary, mazal, gematria, hebrewEntries);
    expect(prompt).toContain("daily forecast");
    expect(prompt).toContain("roughly 250 words");
    expect(prompt).toContain("entirely in English");
    expect(prompt).toContain("against this person's natal Mazal chart");
    expect(prompt).toContain("daytime mapping");
    expect(prompt).toContain("## Period Hebrew calendar data");
    expect(prompt).toContain("day planet Jupiter");
    expect(prompt).toContain("## Complete natal Mazal chart data");
    expect(prompt).toContain("Mazal (month sign): Tevet — Gdi (Capricorn)");
    expect(prompt).toContain("### מזל אריה — חודש אב");
    expect(prompt).toContain("גוף הפרק על מזל אריה.");
  });

  it("never leaks the birth instant or coordinates", () => {
    const prompt = buildHebrewForecastPrompt(hebrewSummary, mazal, gematria, hebrewEntries);
    expect(prompt).not.toContain("2000-01-01T10:00");
    expect(prompt).not.toContain("32.1");
    expect(prompt).not.toContain("34.8");
  });
});

/** A Response whose body streams the given chunks. */
function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of iter) out.push(delta);
  return out;
}

describe("clients", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ollamaClient posts to /api/generate and returns response text", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      new Response(JSON.stringify({ response: "generated text" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await ollamaClient("http://localhost:11434/", "m").generate("p");
    expect(out).toBe("generated text");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("openAiCompatClient reads the first choice's content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "chat text" } }] }),
        ),
      ),
    );
    const out = await openAiCompatClient("https://x", "m", "k").generate("p");
    expect(out).toBe("chat text");
  });

  it("renames max_tokens to max_completion_tokens when the model rejects it", async () => {
    // OpenAI's newer models (o-series, gpt-5.x) 400 on the legacy param.
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if ("max_tokens" in body) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
              type: "invalid_request_error",
              param: "max_tokens",
              code: "unsupported_parameter",
            },
          }),
          { status: 400 },
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "adapted" } }] }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await openAiCompatClient("https://x", "m", "k").generate("p");
    expect(out).toBe("adapted");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryBody.max_completion_tokens).toBe(1200);
    expect(retryBody).not.toHaveProperty("max_tokens");
  });

  it("drops temperature when the model rejects it, adapting both params", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if ("max_tokens" in body) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
              param: "max_tokens",
              code: "unsupported_parameter",
            },
          }),
          { status: 400 },
        );
      }
      if ("temperature" in body) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported value: 'temperature' does not support 0.7 with this model.",
              param: "temperature",
              code: "unsupported_value",
            },
          }),
          { status: 400 },
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "fully adapted" } }] }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await openAiCompatClient("https://x", "m", "k").generate("p");
    expect(out).toBe("fully adapted");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const finalBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(finalBody).not.toHaveProperty("temperature");
    expect(finalBody.max_completion_tokens).toBe(1200);
  });

  it("still fails on unsupported-parameter errors it cannot adapt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Unsupported parameter: 'messages' is not supported.",
              param: "messages",
              code: "unsupported_parameter",
            },
          }),
          { status: 400 },
        ),
      ),
    );
    await expect(
      openAiCompatClient("https://x", "m", "k").generate("p"),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("wraps network failures and error statuses in LlmUnavailableError after retries", async () => {
    vi.useFakeTimers();
    try {
      const netFail = vi.fn(async () => {
        throw new TypeError("fetch failed");
      });
      vi.stubGlobal("fetch", netFail);
      const p1 = ollamaClient("http://localhost:11434", "m").generate("p");
      const a1 = expect(p1).rejects.toBeInstanceOf(LlmUnavailableError);
      await vi.runAllTimersAsync();
      await a1;
      expect(netFail).toHaveBeenCalledTimes(3);

      const down = vi.fn(async () => new Response("down", { status: 503 }));
      vi.stubGlobal("fetch", down);
      const p2 = ollamaClient("http://localhost:11434", "m").generate("p");
      const a2 = expect(p2).rejects.toMatchObject({ status: 503 });
      await vi.runAllTimersAsync();
      await a2;
      expect(down).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors Retry-After on a 429 and then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("busy", {
            status: 429,
            headers: { "retry-after": "1" },
          }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ response: "ok" })));
      vi.stubGlobal("fetch", fetchMock);
      const promise = ollamaClient("http://localhost:11434", "m").generate("p");
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2);
      await expect(promise).resolves.toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never retries once the stream body has started", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode('{"response":"x","done":false}\n'),
              );
              controller.error(new Error("connection reset"));
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      collect(ollamaClient("http://localhost:11434", "m").generateStream!("p")),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the upstream error body in the failure message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("model 'x' not found", { status: 404 })),
    );
    await expect(
      ollamaClient("http://localhost:11434", "m").generate("p"),
    ).rejects.toThrow(/404: model 'x' not found/);
  });

  it("sends the token cap and temperature to both APIs", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      new Response(JSON.stringify({ response: "text" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await ollamaClient("http://localhost:11434", "m").generate("p");
    const ollamaBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(ollamaBody.options).toEqual({ num_predict: 1200, temperature: 0.7 });

    const chatMock = vi.fn(async (..._args: unknown[]) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "text" } }] }),
      ),
    );
    vi.stubGlobal("fetch", chatMock);
    await openAiCompatClient("https://x", "m", "k").generate("p");
    const chatBody = JSON.parse(
      (chatMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(chatBody.max_tokens).toBe(1200);
    expect(chatBody.temperature).toBe(0.7);
  });

  it("treats an empty generation as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ response: "" }))),
    );
    await expect(
      ollamaClient("http://localhost:11434", "m").generate("p"),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("anthropicClient posts to /v1/messages with the required headers and no temperature", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "claude text" }],
          stop_reason: "end_turn",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await anthropicClient(
      "https://api.anthropic.com/",
      "claude-opus-5",
      "k",
    ).generate("p");
    expect(out).toBe("claude text");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("claude-opus-5");
    expect(body.max_tokens).toBe(1200);
    expect(body.messages).toEqual([{ role: "user", content: "p" }]);
    // Current Claude models reject temperature — it must be absent.
    expect(body).not.toHaveProperty("temperature");
  });

  it("anthropicClient joins multiple text blocks and skips non-text blocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            content: [
              { type: "thinking", thinking: "" },
              { type: "text", text: "part one " },
              { type: "text", text: "part two" },
            ],
            stop_reason: "end_turn",
          }),
        ),
      ),
    );
    const out = await anthropicClient("https://x", "m", "k").generate("p");
    expect(out).toBe("part one part two");
  });

  it("streams ollama NDJSON deltas until done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          '{"response":"Hel","done":false}\n',
          '{"response":"lo","done":false}\n{"done":true}\n',
        ]),
      ),
    );
    const deltas = await collect(
      ollamaClient("http://localhost:11434", "m").generateStream!("p"),
    );
    expect(deltas).toEqual(["Hel", "lo"]);
  });

  it("streams openai SSE deltas and stops at [DONE]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n',
        ]),
      ),
    );
    const deltas = await collect(
      openAiCompatClient("https://x", "m", "k").generateStream!("p"),
    );
    expect(deltas).toEqual(["Hel", "lo"]);
  });

  it("adapts unsupported params before the stream starts", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if ("max_tokens" in body) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
            },
          }),
          { status: 400 },
        );
      }
      return streamResponse([
        'data: {"choices":[{"delta":{"content":"adapted"}}]}\n\ndata: [DONE]\n\n',
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const deltas = await collect(
      openAiCompatClient("https://x", "m", "k").generateStream!("p"),
    );
    expect(deltas).toEqual(["adapted"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryBody.max_completion_tokens).toBe(1200);
    expect(retryBody.stream).toBe(true);
  });

  it("streams anthropic text_delta events until message_stop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]),
      ),
    );
    const deltas = await collect(
      anthropicClient("https://x", "m", "k").generateStream!("p"),
    );
    expect(deltas).toEqual(["Hel", "lo"]);
  });

  it("throws on an anthropic mid-stream refusal or error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          'data: {"type":"message_delta","delta":{"stop_reason":"refusal"}}\n\n',
        ]),
      ),
    );
    await expect(
      collect(anthropicClient("https://x", "m", "k").generateStream!("p")),
    ).rejects.toThrow(/refusal/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          'data: {"type":"error","error":{"message":"overloaded"}}\n\n',
        ]),
      ),
    );
    await expect(
      collect(anthropicClient("https://x", "m", "k").generateStream!("p")),
    ).rejects.toThrow(/overloaded/);
  });

  it("fails fast when the streaming request is rejected before the first byte", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad key", { status: 401 })),
    );
    await expect(
      collect(anthropicClient("https://x", "m", "k").generateStream!("p")),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("anthropicClient treats a refusal or empty content as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ content: [], stop_reason: "refusal" }),
        ),
      ),
    );
    await expect(
      anthropicClient("https://x", "m", "k").generate("p"),
    ).rejects.toThrow(/refusal/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ content: [], stop_reason: "end_turn" })),
      ),
    );
    await expect(
      anthropicClient("https://x", "m", "k").generate("p"),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("applies env tuning overrides to request bodies", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      new Response(JSON.stringify({ response: "text" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = llmClientFromEnv({
      READING_LLM: "ollama",
      READING_LLM_MODEL: "m",
      READING_LLM_MAX_TOKENS: "555",
      READING_LLM_TEMPERATURE: "0.2",
    })!;
    await client.generate("p");
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.options).toEqual({ num_predict: 555, temperature: 0.2 });
  });

  it("anthropic chat sends the system prompt as a cache_control block", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      streamResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deltas = await collect(
      anthropicClient("https://x", "m", "k").generateChat!("sys", [
        { role: "user", content: "q" },
      ]),
    );
    expect(deltas).toEqual(["hi"]);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.max_tokens).toBe(600);
  });

  it("logs provider usage, including anthropic cache reads", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              content: [{ type: "text", text: "t" }],
              stop_reason: "end_turn",
              usage: {
                input_tokens: 100,
                output_tokens: 50,
                cache_read_input_tokens: 900,
              },
            }),
          ),
        ),
      );
      await anthropicClient("https://x", "m", "k").generate("p");
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          '[llm] usage {"provider":"anthropic","model":"m","kind":"generate","input":100,"output":50,"cacheRead":900}',
        ),
      );

      log.mockClear();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              response: "t",
              prompt_eval_count: 12,
              eval_count: 34,
            }),
          ),
        ),
      );
      await ollamaClient("http://localhost:11434", "m").generate("p");
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('"provider":"ollama","model":"m","kind":"generate","input":12,"output":34'),
      );
    } finally {
      log.mockRestore();
    }
  });

  it("reports anthropic stream usage accumulated across events", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          streamResponse([
            'data: {"type":"message_start","message":{"usage":{"input_tokens":70,"cache_read_input_tokens":600}}}\n\n',
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"t"}}\n\n',
            'data: {"type":"message_delta","usage":{"output_tokens":41}}\n\n',
            'data: {"type":"message_stop"}\n\n',
          ]),
        ),
      );
      await collect(
        anthropicClient("https://x", "m", "k").generateChat!("sys", [
          { role: "user", content: "q" },
        ]),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('"kind":"chat","input":70,"output":41,"cacheRead":600'),
      );
    } finally {
      log.mockRestore();
    }
  });
});
