import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import {
  buildChatSystemPrompt,
  chatTurnCount,
  composeChatMessages,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_TURNS,
} from "./chat";
import type { ChatMessage } from "./llm";
import type { NumeroDerivation, WheelChart } from "./view-types";

const BIRTH_UTC = new Date(Date.UTC(1990, 2, 4, 10, 30, 0));
const chart: WheelChart = {
  ...buildChart({ utc: BIRTH_UTC, latitude: 32.109, longitude: 34.855 }),
  tzWarnings: [],
};

const numero = {
  lifePath: {
    value: 7,
    isMaster: false,
    derivation: {
      components: [{ part: "year", raw: 1990, steps: [19, 10, 1] }],
      total: 7,
      steps: [],
    },
  },
  destiny: null,
  soulUrge: null,
} as unknown as NumeroDerivation;

describe("buildChatSystemPrompt", () => {
  const prompt = buildChatSystemPrompt(chart, numero, null, "Stored reading text.");

  it("carries the chart data, numerology, and the stored reading", () => {
    expect(prompt).toContain("## Complete chart data");
    expect(prompt).toContain("## Complete numerology data");
    expect(prompt).toContain("## The stored reading\nStored reading text.");
    expect(prompt).toContain("Answer questions about this chart");
  });

  it("never leaks the birth instant or coordinates", () => {
    // The same privacy contract as the reading prompts (lib/llm.test.ts).
    expect(prompt).not.toContain("1990-03-04");
    expect(prompt).not.toContain("32.109");
    expect(prompt).not.toContain("34.855");
  });

  it("suppresses houses guidance on solar charts", () => {
    const solar: WheelChart = {
      ...buildChart({
        utc: BIRTH_UTC,
        latitude: 32.109,
        longitude: 34.855,
        timeCertainty: "unknown",
      }),
      tzWarnings: [],
    };
    const p = buildChatSystemPrompt(solar, null, null, "r");
    expect(p).toContain("Birth time is unknown");
    expect(p).not.toContain("## Complete numerology data");
  });
});

describe("chatTurnCount", () => {
  it("counts only user turns", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
    ];
    expect(chatTurnCount(history)).toBe(2);
    expect(chatTurnCount([])).toBe(0);
    expect(CHAT_MAX_TURNS).toBe(8);
  });
});

describe("composeChatMessages", () => {
  it("appends the question to a well-formed history", () => {
    const messages = composeChatMessages(
      [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
      ],
      "q2",
    );
    expect(messages).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
  });

  it("clamps every message to the character cap", () => {
    const long = "x".repeat(CHAT_MAX_MESSAGE_CHARS + 500);
    const messages = composeChatMessages(
      [
        { role: "user", content: long },
        { role: "assistant", content: long },
      ],
      long,
    )!;
    for (const m of messages) {
      expect(m.content).toHaveLength(CHAT_MAX_MESSAGE_CHARS);
    }
  });

  it("rejects histories that do not alternate user-first", () => {
    expect(
      composeChatMessages([{ role: "assistant", content: "a" }, { role: "user", content: "q" }], "q2"),
    ).toBeNull();
    expect(
      composeChatMessages(
        [
          { role: "user", content: "q" },
          { role: "user", content: "q again" },
        ],
        "q2",
      ),
    ).toBeNull();
    // A dangling user turn (no assistant reply yet) is malformed too.
    expect(
      composeChatMessages([{ role: "user", content: "q" }], "q2"),
    ).toBeNull();
  });
});
