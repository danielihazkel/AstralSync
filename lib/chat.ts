import type { ChatMessage } from "./llm";
import {
  renderChartData,
  renderMazalData,
  renderNumerologyData,
} from "./promptData";
import type {
  NumeroDerivation,
  StoredHebrewGematria,
  StoredMazal,
  WheelChart,
} from "./view-types";

/**
 * The ephemeral "ask about your chart" chat (PRD §5 extension). Nothing is
 * ever persisted — history lives in the client and rides along with each
 * request, bounded server-side so a hostile client can't inflate prompts.
 * The privacy contract of the reading prompts carries over verbatim: the
 * system prompt is composed ONLY from the promptData renderers (which never
 * render the birth instant or coordinates) plus the stored reading text.
 */

/** Max user turns per conversation — the 9th question is rejected. */
export const CHAT_MAX_TURNS = 8;
/** Max characters per history message after server-side clamping. */
export const CHAT_MAX_MESSAGE_CHARS = 1_000;

/** System prompt for the chat: instructions + the same data blocks the
 *  stored reading was generated from, plus that reading. */
export function buildChatSystemPrompt(
  chart: WheelChart,
  numerology: NumeroDerivation | null,
  hebrew: { mazal: StoredMazal; gematria: StoredHebrewGematria } | null,
  readingBodyMd: string,
): string {
  const instructions = [
    "You are the follow-up chat for one person's natal reading in an astrology and numerology app.",
    "Below are the complete chart data and the stored AI reading you are answering questions about.",
    "Answer questions about this chart, its numerology, and the reading only. For anything else, briefly decline and steer back to the chart.",
    "Keep answers to roughly 150 words in Markdown (paragraphs, optional **bold** and *italic*; no headings, no HTML, no links).",
    "Address the reader as \"you\", gender-neutrally. Be concrete and even-handed. No promises, no fortune-telling: describe tendencies and invitations, not fixed outcomes.",
    chart.isSolarChart
      ? "Birth time is unknown (solar chart): do not mention houses or a rising sign."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    instructions,
    `## Complete chart data\n${renderChartData(chart)}`,
    numerology
      ? `## Complete numerology data\n${renderNumerologyData(numerology)}`
      : "",
    hebrew
      ? `## Complete Mazal chart data\n${renderMazalData(hebrew.mazal, hebrew.gematria)}`
      : "",
    `## The stored reading\n${readingBodyMd}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** User turns already spent in this conversation. */
export function chatTurnCount(history: ChatMessage[]): number {
  return history.filter((m) => m.role === "user").length;
}

/**
 * Server-side history sanitation: clamp every message to the character cap.
 * Returns the messages to send — history plus the new question — or null
 * when the history doesn't alternate user/assistant starting with "user"
 * (which the Anthropic API requires and a well-behaved client always sends).
 */
export function composeChatMessages(
  history: ChatMessage[],
  question: string,
): ChatMessage[] | null {
  for (const [i, m] of history.entries()) {
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (m.role !== expected) return null;
  }
  // A complete history ends on an assistant turn before the new question.
  if (history.length % 2 !== 0) return null;
  const clamp = (s: string) => s.slice(0, CHAT_MAX_MESSAGE_CHARS);
  return [
    ...history.map((m) => ({ role: m.role, content: clamp(m.content) })),
    { role: "user" as const, content: clamp(question) },
  ];
}
