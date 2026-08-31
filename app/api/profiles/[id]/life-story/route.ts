import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProfileView } from "@/lib/snapshots";
import { listLifeEvents } from "@/lib/lifeEvents";
import {
  buildLifeStoryPrompt,
  llmClientFromEnv,
  LlmUnavailableError,
} from "@/lib/llm";
import { birthDataFromProfile } from "@/lib/promptData";
import { streamGenerationResponse } from "@/lib/streamGeneration";
import { archiveReading } from "@/lib/trash";
import { toNumeroDerivation, toWheelChart } from "@/lib/view-types";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The Life Story reading: an overall LLM read of the person's life so far,
 * combining the complete chart and numerology data, the recorded life
 * events, and the raw birth date/time/place — the personal context every
 * personal reading/forecast prompt now carries (personal-data policy,
 * lib/promptData.ts). Cached in `reading` under generator "life_story";
 * because it depends on the mutable event list, discard + regenerate is
 * the sanctioned way to fold in new events.
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
  if (view.astro.lifeStoryReading) {
    return NextResponse.json({ error: "already_generated" }, { status: 409 });
  }

  const events = await listLifeEvents(id);
  if (events === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (events.length === 0) {
    return NextResponse.json({ error: "no_events" }, { status: 409 });
  }

  const prompt = buildLifeStoryPrompt(
    birthDataFromProfile(view.profile),
    toWheelChart(view.astro),
    toNumeroDerivation(view.numero),
    events,
  );

  // Shared by both paths: persistence semantics are identical.
  const persist = async (bodyMd: string) => {
    try {
      const reading = await prisma.reading.create({
        data: {
          astroSnapshotId: view.astro.snapshotId,
          numeroSnapshotId: view.numero.snapshotId,
          bodyMd,
          generator: "life_story",
          modelName: client.modelName,
          contentVersion: view.astro.contentVersion,
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
      label: "life-story",
      persist,
    });
  }

  let bodyMd: string;
  try {
    bodyMd = await client.generate(prompt);
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.error("[api] life-story:", e);
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
 * Discard the stored Life Story (`?version=N`, defaulting to the latest
 * snapshot) into the Trash — the sanctioned way to regenerate after
 * recording new events. Undoable until purged or regenerated.
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
  const archiveId = await archiveReading(view.astro.snapshotId, "life_story");
  if (archiveId === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, archiveId });
}
