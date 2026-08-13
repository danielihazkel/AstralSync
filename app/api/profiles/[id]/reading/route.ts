import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProfileView } from "@/lib/snapshots";
import { resolveReading } from "@/lib/content";
import { buildReadingPrompt, llmClientFromEnv, LlmUnavailableError } from "@/lib/llm";
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

  let bodyMd: string;
  try {
    bodyMd = await client.generate(
      buildReadingPrompt(resolved, chart, toNumeroDerivation(view.numero)),
    );
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
    return NextResponse.json({
      bodyMd: reading.bodyMd,
      modelName: reading.modelName,
      contentVersion: reading.contentVersion,
      createdAt: reading.createdAt,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // A concurrent request generated the reading first; keep that one.
      return NextResponse.json({ error: "already_generated" }, { status: 409 });
    }
    throw e;
  }
}

/**
 * Discard a stored AI reading (`?version=N`, defaulting to the latest
 * snapshot). The freed unique slot lets POST generate a fresh one — the only
 * sanctioned way to replace a bad generation, since readings are otherwise
 * write-once per snapshot.
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
  try {
    await prisma.reading.delete({
      where: {
        astroSnapshotId_generator: {
          astroSnapshotId: view.astro.snapshotId,
          generator: "llm",
        },
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
  return NextResponse.json({ deleted: true });
}
