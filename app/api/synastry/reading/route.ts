import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { loadContentIndex } from "@/lib/content";
import { prisma } from "@/lib/db";
import {
  buildSynastryReadingPrompt,
  llmClientFromEnv,
  LlmUnavailableError,
} from "@/lib/llm";
import { streamGenerationResponse } from "@/lib/streamGeneration";
import {
  getSynastryReading,
  getSynastryView,
  normalizePair,
  resolveSynastryAngleEntries,
  resolveSynastryEntries,
} from "@/lib/synastry";
import { synastryQuerySchema } from "@/lib/validation";

const NO_STORE = { "Cache-Control": "no-store" };

function parsePair(req: NextRequest) {
  return synastryQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
}

/**
 * The AI synastry/composite reading: one cached slot per profile pair
 * (order-insensitive), with Forecast semantics — generate once, discard to
 * regenerate, snapshot versions stored as staleness flags. Note: like the
 * natal reading, the prompt sent to an external provider includes both
 * display names and full chart data (never the birth instant/coordinates).
 */
export async function GET(req: NextRequest) {
  const parsed = parsePair(req);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_pair", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const { a, b } = parsed.data;
  const view = await getSynastryView(a, b);
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  const reading = await getSynastryReading(a, b);
  const [pairA] = normalizePair(a, b);
  // Stored versions follow the sorted pair; view sides follow query order.
  const currentA = view.a.profileId === pairA ? view.a.version : view.b.version;
  const currentB = view.a.profileId === pairA ? view.b.version : view.a.version;
  return NextResponse.json(
    {
      reading,
      stale:
        reading !== null &&
        (reading.aVersion !== currentA || reading.bVersion !== currentB),
    },
    { headers: NO_STORE },
  );
}

/** Generate (POST ?a=&b=&stream=1). 409 llm_disabled / already_generated. */
export async function POST(req: NextRequest) {
  const parsed = parsePair(req);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_pair", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const client = llmClientFromEnv();
  if (!client) {
    return NextResponse.json(
      { error: "llm_disabled" },
      { status: 409, headers: NO_STORE },
    );
  }
  const { a, b } = parsed.data;
  const view = await getSynastryView(a, b);
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  if (await getSynastryReading(a, b)) {
    return NextResponse.json(
      { error: "already_generated" },
      { status: 409, headers: NO_STORE },
    );
  }

  const index = loadContentIndex();
  const prompt = buildSynastryReadingPrompt(view, [
    ...resolveSynastryEntries(view.aspects, index),
    // The tightest angle contacts join the same context list — authored
    // synastry_angle_aspect entries or their natal angle archetypes.
    ...resolveSynastryAngleEntries(view.angleContacts, index),
  ]);
  const [pairA, pairB] = normalizePair(a, b);
  const versionOf = (profileId: number) =>
    view.a.profileId === profileId ? view.a.version : view.b.version;

  const persist = async (bodyMd: string) => {
    try {
      const row = await prisma.synastryReading.create({
        data: {
          profileAId: pairA,
          profileBId: pairB,
          aVersion: versionOf(pairA),
          bVersion: versionOf(pairB),
          bodyMd,
          modelName: client.modelName,
          contentVersion: index.version,
        },
      });
      return {
        done: {
          bodyMd: row.bodyMd,
          modelName: row.modelName,
          contentVersion: row.contentVersion,
          createdAt: row.createdAt,
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
      label: "synastry-reading",
      persist,
    });
  }

  let bodyMd: string;
  try {
    bodyMd = await client.generate(prompt);
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.error("[api] synastry-reading:", e);
      return NextResponse.json(
        { error: "llm_unavailable", message: e.message },
        { status: 502, headers: NO_STORE },
      );
    }
    throw e;
  }
  const outcome = await persist(bodyMd);
  if ("done" in outcome) {
    return NextResponse.json(outcome.done, { headers: NO_STORE });
  }
  return NextResponse.json(
    { error: outcome.errorCode },
    { status: 409, headers: NO_STORE },
  );
}

/** Discard the pair's stored reading, freeing the slot for a regenerate. */
export async function DELETE(req: NextRequest) {
  const parsed = parsePair(req);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_pair", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const [pairA, pairB] = normalizePair(parsed.data.a, parsed.data.b);
  try {
    await prisma.synastryReading.delete({
      where: {
        profileAId_profileBId: { profileAId: pairA, profileBId: pairB },
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: NO_STORE },
      );
    }
    throw e;
  }
  return NextResponse.json({ deleted: true }, { headers: NO_STORE });
}
