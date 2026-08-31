import { NextRequest, NextResponse } from "next/server";
import { createLifeEvent, listLifeEvents } from "@/lib/lifeEvents";
import { lifeEventCreateSchema } from "@/lib/validation";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Major life events: dated milestones the user records per profile
 * (marriage, births, moves, losses…), which the Life Story reading feeds to
 * the LLM (see ../life-story). Plain mutable CRUD — nothing here touches
 * the write-once snapshot rules.
 */

/** GET → the profile's events, oldest first. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: NO_STORE },
    );
  }
  const events = await listLifeEvents(id);
  if (events === null) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ events }, { headers: NO_STORE });
}

/** POST { title, eventDate, precision?, category, notesMd? } → the created
 *  event; 409 `limit_reached` at the per-profile cap. */
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
  const parsed = lifeEventCreateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const event = await createLifeEvent({ profileId: id, ...parsed.data });
  if (event === null) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  if (event === "limit") {
    return NextResponse.json(
      { error: "limit_reached" },
      { status: 409, headers: NO_STORE },
    );
  }
  return NextResponse.json({ event }, { status: 201, headers: NO_STORE });
}
