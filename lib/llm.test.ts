import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedReading } from "./content";
import type { ResolvedHebrewReading } from "./hebrewReading";
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

describe("buildReadingPrompt", () => {
  it("includes entry titles, bodies, and the element distribution", () => {
    const prompt = buildReadingPrompt(resolved, { isSolarChart: false });
    expect(prompt).toContain("Sun in Leo");
    expect(prompt).toContain("Sun body.");
    expect(prompt).toContain("water 4");
    expect(prompt).toContain("dominant: water");
    expect(prompt).not.toContain("solar chart");
  });

  it("excludes the composed synthesis section from the source material", () => {
    expect(buildReadingPrompt(resolved, { isSolarChart: false })).not.toContain(
      "Composed.",
    );
  });

  it("adds the solar-chart caveat", () => {
    expect(buildReadingPrompt(resolved, { isSolarChart: true })).toContain(
      "solar chart",
    );
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

describe("buildHebrewReadingPrompt", () => {
  it("writes the instructions in Hebrew and asks for Hebrew output", () => {
    const prompt = buildHebrewReadingPrompt(resolvedHebrew);
    expect(prompt).toContain("בעברית בלבד");
    expect(prompt).toContain("300");
    expect(prompt).toContain("400");
    // No English instruction text leaks in from the astro prompt.
    expect(prompt).not.toContain("Address the reader");
    expect(prompt).not.toContain("Element distribution");
  });

  it("includes every section with its title, source, and body", () => {
    const prompt = buildHebrewReadingPrompt(resolvedHebrew);
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
