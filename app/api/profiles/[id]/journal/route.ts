import { NextRequest, NextResponse } from "next/server";
import { createJournalEntry, listJournalEntries } from "@/lib/journal";
import { journalCreateSchema, journalListQuerySchema } from "@/lib/validation";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Journal entries: user notes pinned to a civil date (Phase 3g). Plain
 * mutable CRUD — nothing here touches the write-once snapshot rules, and the
 * date's sky is recomputed via /api/transits/[id]?at=, never stored.
 */

/** GET ?from?=&to?= → the profile's entries, newest entry date first. */
export async function GET(
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
  const parsed = journalListQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const entries = await listJournalEntries(id, parsed.data);
  if (entries === null) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ entries }, { headers: NO_STORE });
}

/** POST { entryDate, bodyMd } → the created entry. */
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
  const parsed = journalCreateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const entry = await createJournalEntry({ profileId: id, ...parsed.data });
  if (entry === null) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ entry }, { status: 201, headers: NO_STORE });
}
