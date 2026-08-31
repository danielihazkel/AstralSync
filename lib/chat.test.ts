import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import {
  buildChatSystemPrompt,
  chatTurnCount,
  composeChatMessages,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_TURNS,
} from "./chat";
import type { ChatMessage, PersonalContext } from "./llm";
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

// The personal context every personal prompt carries (personal-data
// policy, lib/promptData.ts header).
const personal: PersonalContext = {
  birth: {
    birthDate: "1990-03-04",
    birthTime: "12:30",
    timeCertainty: "exact",
    placeLabel: "Tel Aviv, 05, IL",
    birthLat: 32.109,
    birthLng: 34.855,
    tzIana: "Asia/Jerusalem",
  },
  numerology: numero,
  events: [
    {
      title: "Moved abroad",
      eventDate: "2015-07-01",
      precision: "month",
      category: "relocation",
      notesMd: null,
    },
  ],
};

describe("buildChatSystemPrompt", () => {
  const prompt = buildChatSystemPrompt(chart, personal, null, "Stored reading text.");

  it("carries the chart data, numerology, and the stored reading", () => {
    expect(prompt).toContain("## Complete chart data");
    expect(prompt).toContain("## Complete numerology data");
    expect(prompt).toContain("## The stored reading\nStored reading text.");
    expect(prompt).toContain("Answer questions about this chart");
  });

  it("includes the personal context; never the raw chart input instant", () => {
    // The same personal-data policy as the reading prompts (lib/llm.test.ts).
    expect(prompt).toContain("## Birth data");
    expect(prompt).toContain("Birth date: March 4, 1990");
    expect(prompt).toContain("Birth time: 12:30 (exact)");
    expect(prompt).toContain("Tel Aviv, 05, IL");
    expect(prompt).toContain("## Life events");
    expect(prompt).toContain("Moved abroad");
    // The machine-readable chart input still never renders directly.
    expect(prompt).not.toContain("1990-03-04T10:30");
  });

  it("omits the life-events section when none are recorded", () => {
    const p = buildChatSystemPrompt(
      chart,
      { ...personal, events: [] },
      null,
      "r",
    );
    expect(p).not.toContain("## Life events");
    expect(p).not.toContain("recorded life events are also included");
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
    const p = buildChatSystemPrompt(
      solar,
      { ...personal, numerology: null },
      null,
      "r",
    );
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
