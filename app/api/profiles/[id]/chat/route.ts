import { NextRequest, NextResponse } from "next/server";
import {
  buildChatSystemPrompt,
  chatTurnCount,
  composeChatMessages,
  CHAT_HOURLY_LIMIT,
  CHAT_LIMIT_WINDOW_MS,
  CHAT_MAX_TURNS,
} from "@/lib/chat";
import { createChatLimiter } from "@/lib/chatLimiter";
import { llmClientFromEnv } from "@/lib/llm";
import { getProfileView } from "@/lib/snapshots";
import { streamGenerationResponse } from "@/lib/streamGeneration";
import { chatSchema } from "@/lib/validation";
import {
  toNumeroDerivation,
  toStoredHebrewGematria,
  toStoredMazal,
  toWheelChart,
} from "@/lib/view-types";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

// Module-level singleton: one limiter per server process.
const limiter = createChatLimiter({
  limit: CHAT_HOURLY_LIMIT,
  windowMs: CHAT_LIMIT_WINDOW_MS,
});

/**
 * The ephemeral "ask about your chart" chat: POST { question, history }
 * against the latest snapshot, streamed back as SSE. Nothing is persisted —
 * the conversation lives in the client and dies on navigation. Requires the
 * stored AI reading (the chat answers questions about it) and a provider
 * with chat support; capped at CHAT_MAX_TURNS questions per conversation.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: NO_STORE },
    );
  }

  const client = llmClientFromEnv();
  if (!client?.generateChat) {
    return NextResponse.json(
      { error: "llm_disabled" },
      { status: 409, headers: NO_STORE },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = chatSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const { question, history } = parsed.data;

  if (chatTurnCount(history) >= CHAT_MAX_TURNS) {
    return NextResponse.json(
      { error: "chat_limit" },
      { status: 409, headers: NO_STORE },
    );
  }
  // The turn cap above is per-conversation UX; this is the server-side
  // hourly backstop a cleared history can't reset.
  const verdict = limiter.consume(id);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "chat_rate_limited" },
      {
        status: 429,
        headers: {
          ...NO_STORE,
          "Retry-After": String(Math.ceil(verdict.retryAfterMs / 1000)),
        },
      },
    );
  }
  const messages = composeChatMessages(history, question);
  if (messages === null) {
    return NextResponse.json(
      { error: "invalid_history" },
      { status: 400, headers: NO_STORE },
    );
  }

  const view = await getProfileView(id);
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  if (!view.astro.llmReading) {
    return NextResponse.json(
      { error: "no_reading" },
      { status: 409, headers: NO_STORE },
    );
  }

  const system = buildChatSystemPrompt(
    toWheelChart(view.astro),
    toNumeroDerivation(view.numero),
    view.hebrew
      ? {
          mazal: toStoredMazal(view.hebrew),
          gematria: toStoredHebrewGematria(view.hebrew),
        }
      : null,
    view.astro.llmReading.bodyMd,
  );

  return streamGenerationResponse({
    stream: client.generateChat(system, messages, req.signal),
    signal: req.signal,
    label: "chat",
    // Nothing is stored: "persistence" just echoes the finished reply.
    persist: async (bodyMd) => ({ done: { bodyMd } }),
  });
}
