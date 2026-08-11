import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProfileView } from "@/lib/snapshots";
import { resolveHebrewReading } from "@/lib/hebrewReading";
import {
  buildHebrewReadingPrompt,
  llmClientFromEnv,
  LlmUnavailableError,
} from "@/lib/llm";
import { toStoredHebrewGematria, toStoredMazal } from "@/lib/view-types";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Generate the optional LLM synthesis for the Hebrew (Mazal) reading:
 * once per snapshot version, stored forever in `reading` with generator
 * "hebrew_llm", keyed to the astro snapshot id (astro and hebrew snapshots
 * share profileId+version, so the existing unique constraint enforces
 * once-only). Body: `{ version?: number }`. Requires the READING_LLM hook.
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
  if (!view.hebrew) {
    // Historical version computed before the Mazal feature — never backfilled.
    return NextResponse.json({ error: "no_hebrew_snapshot" }, { status: 409 });
  }
  if (view.hebrew.llmReading) {
    return NextResponse.json({ error: "already_generated" }, { status: 409 });
  }

  const resolved = resolveHebrewReading(
    toStoredMazal(view.hebrew),
    toStoredHebrewGematria(view.hebrew),
    view.hebrew.contentVersion,
  );

  let bodyMd: string;
  try {
    bodyMd = await client.generate(buildHebrewReadingPrompt(resolved));
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
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
        // Derived solely from the Hebrew snapshot — honest provenance.
        numeroSnapshotId: null,
        bodyMd,
        generator: "hebrew_llm",
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
