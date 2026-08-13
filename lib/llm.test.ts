import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedReading } from "./content";
import type { ResolvedHebrewReading } from "./hebrewReading";
import type {
  NumeroDerivation,
  StoredHebrewGematria,
  StoredMazal,
  WheelChart,
} from "./view-types";
import {
  buildHebrewReadingPrompt,
  buildReadingPrompt,
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

  it("wraps network failures and error statuses in LlmUnavailableError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(
      ollamaClient("http://localhost:11434", "m").generate("p"),
    ).rejects.toBeInstanceOf(LlmUnavailableError);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(
      ollamaClient("http://localhost:11434", "m").generate("p"),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
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
});
