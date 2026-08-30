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
import { streamGenerationResponse } from "@/lib/streamGeneration";
import { archiveReading } from "@/lib/trash";
import {
  toNumeroDerivation,
  toStoredHebrewGematria,
  toStoredMazal,
} from "@/lib/view-types";

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

  const mazal = toStoredMazal(view.hebrew);
  const gematria = toStoredHebrewGematria(view.hebrew);
  const resolved = resolveHebrewReading(
    mazal,
    gematria,
    view.hebrew.contentVersion,
  );

  const prompt = buildHebrewReadingPrompt(
    resolved,
    mazal,
    gematria,
    toNumeroDerivation(view.numero),
  );

  // Shared by both paths: persistence semantics are identical.
  const persist = async (bodyMd: string) => {
    try {
      const reading = await prisma.reading.create({
        data: {
          astroSnapshotId: view.astro.snapshotId,
          // The prompt now draws on the numero snapshot too — honest provenance.
          numeroSnapshotId: view.numero.snapshotId,
          bodyMd,
          generator: "hebrew_llm",
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
      label: "hebrew-reading",
      persist,
    });
  }

  let bodyMd: string;
  try {
    bodyMd = await client.generate(prompt);
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.error("[api] hebrew-reading:", e);
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
 * Discard a stored Mazal AI reading (`?version=N`, defaulting to the latest
 * snapshot). Frees the unique slot so POST can generate a replacement.
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
  // Into the Trash (undoable) rather than gone — see the natal route.
  const archiveId = await archiveReading(view.astro.snapshotId, "hebrew_llm");
  if (archiveId === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, archiveId });
}
