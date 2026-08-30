import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProfileView } from "@/lib/snapshots";
import { resolveReading } from "@/lib/content";
import { buildReadingPrompt, llmClientFromEnv, LlmUnavailableError } from "@/lib/llm";
import { streamGenerationResponse } from "@/lib/streamGeneration";
import { archiveReading } from "@/lib/trash";
import {
  toNumeroDerivation,
  toNumeroReadingInput,
  toWheelChart,
} from "@/lib/view-types";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Generate the optional LLM synthesis for a snapshot pair (PRD §5): once,
 * stored forever in `reading`, never regenerated per view. Body:
 * `{ version?: number }`, defaulting to the latest snapshot. Requires the
 * READING_LLM env hook to be configured — off by default.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const client = llmClientFromEnv();
  if (!client) {
    return NextResponse.json({ error: "llm_disabled" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const versionRaw = (body as { version?: unknown }).version;
  const version = versionRaw === undefined ? undefined : parseId(versionRaw);
  if (version === null) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  const view = await getProfileView(id, version);
  if (!view) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (view.astro.llmReading) {
    return NextResponse.json({ error: "already_generated" }, { status: 409 });
  }

  const chart = toWheelChart(view.astro);
  const resolved = resolveReading(
    chart,
    toNumeroReadingInput(view.numero),
    view.astro.contentVersion,
  );

  const prompt = buildReadingPrompt(resolved, chart, toNumeroDerivation(view.numero));

  // Shared by both paths: persistence semantics are identical.
  const persist = async (bodyMd: string) => {
    try {
      const reading = await prisma.reading.create({
        data: {
          astroSnapshotId: view.astro.snapshotId,
          numeroSnapshotId: view.numero.snapshotId,
          bodyMd,
          generator: "llm",
          modelName: client.modelName,
          contentVersion: resolved.contentVersion,
        },
      });
      return {
        done: {
          bodyMd: reading.bodyMd,
          modelName: reading.modelName,
          contentVersion: reading.contentVersion,
          createdAt: reading.createdAt,
        },
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // A concurrent request generated the reading first; keep that one.
        return { errorCode: "already_generated" };
      }
      throw e;
    }
  };

  if (req.nextUrl.searchParams.get("stream") === "1" && client.generateStream) {
    return streamGenerationResponse({
      stream: client.generateStream(prompt, req.signal),
      signal: req.signal,
      label: "reading",
      persist,
    });
  }

  let bodyMd: string;
  try {
    bodyMd = await client.generate(prompt);
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.error("[api] reading:", e);
      return NextResponse.json(
        { error: "llm_unavailable", message: e.message },
        { status: 502 },
      );
    }
    throw e;
  }

  const outcome = await persist(bodyMd);
  if ("done" in outcome) return NextResponse.json(outcome.done);
  return NextResponse.json({ error: outcome.errorCode }, { status: 409 });
}

/**
 * Discard a stored AI reading (`?version=N`, defaulting to the latest
 * snapshot). The freed unique slot lets POST generate a fresh one — the only
 * sanctioned way to replace a bad generation, since readings are otherwise
 * write-once per snapshot. The text moves to the Trash (`archiveId`), so
 * the discard is undoable until purged.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const versionRaw = req.nextUrl.searchParams.get("version");
  const version = versionRaw === null ? undefined : parseId(versionRaw);
  if (version === null) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }
  const view = await getProfileView(id, version);
  if (!view) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const archiveId = await archiveReading(view.astro.snapshotId, "llm");
  if (archiveId === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, archiveId });
}
