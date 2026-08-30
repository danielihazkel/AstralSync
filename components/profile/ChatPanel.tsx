"use client";

import { useState } from "react";
import Markdown from "@/components/Markdown";
import { useStreamedGeneration } from "@/components/useStreamedGeneration";
import { localNoonIso, todayLocalDate } from "@/components/journal/journalDate";
import styles from "./profile.module.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** The journal note body for one Q&A exchange. */
export function chatExchangeToNote(question: string, answer: string): string {
  return `**Asked:** ${question.trim()}\n\n${answer.trim()}`;
}

/** Mirrors lib/chat.ts CHAT_MAX_TURNS (client hint; the server enforces). */
const MAX_TURNS = 8;

/**
 * "Ask about your chart" — an ephemeral follow-up chat under the stored AI
 * reading. History lives in this component's state and dies on navigation;
 * the server persists nothing. Needs a connection, like everything LLM.
 */
export default function ChatPanel({ profileId }: { profileId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Indices (into `messages`) of assistant turns saved to the journal, and
  // the one currently saving.
  const [saved, setSaved] = useState<Set<number>>(() => new Set());
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const { busy, streamText, generate, reset } = useStreamedGeneration();

  // The chat itself is ephemeral; this is the one bridge to persistence —
  // the exchange becomes a journal note for today, tagged "chat", with the
  // usual sky snapshot.
  async function saveToJournal(index: number) {
    const answer = messages[index];
    const question = messages[index - 1];
    if (!answer || answer.role !== "assistant" || question?.role !== "user") return;
    setSavingIndex(index);
    setError(null);
    const today = todayLocalDate();
    const res = await fetch(`/api/profiles/${profileId}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryDate: today,
        bodyMd: chatExchangeToNote(question.content, answer.content).slice(0, 10_000),
        at: localNoonIso(today),
        tags: ["chat"],
      }),
    }).catch(() => null);
    setSavingIndex(null);
    if (res?.ok) {
      setSaved((s) => new Set(s).add(index));
    } else {
      setError("Could not save that answer to the journal.");
    }
  }

  const turnsUsed = messages.filter((m) => m.role === "user").length;
  const limitReached = turnsUsed >= MAX_TURNS;

  async function send() {
    const question = input.trim();
    if (question === "" || busy || limitReached) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("The chat needs a live connection.");
      return;
    }
    setError(null);
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");

    const result = await generate(`/api/profiles/${profileId}/chat`, {
      question,
      history,
    });
    if (result.ok && result.text) {
      setMessages((m) => [...m, { role: "assistant", content: result.text! }]);
      reset();
      return;
    }
    // Failed turn: roll the question back into the input so nothing is lost.
    setMessages(history);
    setInput(question);
    reset();
    setError(
      result.errorCode === "chat_limit"
        ? "This conversation has reached its question limit."
        : result.errorCode === "chat_rate_limited" || result.status === 429
          ? "That's a lot of questions in one hour — come back in a bit."
          : result.status === 502 || result.errorCode === "llm_unavailable"
            ? "The language model isn't reachable right now — try again once it's running."
            : "Could not send the question.",
    );
  }

  return (
    <section className={styles.chat} aria-label="Ask about your chart">
      <h4 className={styles.sectionTitle}>Ask about your chart</h4>
      <p className={styles.hint}>
        Follow-up questions about this reading — nothing is stored unless you
        save an answer to the journal, and the conversation ends when you
        leave the page ({MAX_TURNS - turnsUsed} of {MAX_TURNS} questions
        left).
      </p>

      {messages.length > 0 && (
        <ol className={styles.chatLog}>
          {messages.map((m, i) => (
            <li
              key={i}
              className={m.role === "user" ? styles.chatUser : styles.chatAssistant}
            >
              {m.role === "user" ? (
                <p>{m.content}</p>
              ) : (
                <>
                  <Markdown md={m.content} />
                  <button
                    type="button"
                    className={styles.saveToJournal}
                    onClick={() => void saveToJournal(i)}
                    disabled={saved.has(i) || savingIndex !== null}
                  >
                    {saved.has(i)
                      ? "Saved to journal"
                      : savingIndex === i
                        ? "Saving…"
                        : "Save to journal"}
                  </button>
                </>
              )}
            </li>
          ))}
          {streamText !== null && (
            <li className={styles.chatAssistant} aria-live="polite">
              <Markdown md={streamText} />
            </li>
          )}
        </ol>
      )}

      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            limitReached
              ? "Question limit reached for this conversation"
              : "e.g. What does my Saturn placement mean for work?"
          }
          maxLength={1000}
          disabled={busy || limitReached}
          aria-label="Your question about this chart"
        />
        <button type="submit" disabled={busy || limitReached || input.trim() === ""}>
          {busy ? "Answering…" : "Ask"}
        </button>
      </form>
      {error && <p className={styles.selectorError}>{error}</p>}
    </section>
  );
}
