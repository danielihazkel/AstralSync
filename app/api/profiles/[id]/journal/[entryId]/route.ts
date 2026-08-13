import { NextRequest, NextResponse } from "next/server";
import { deleteJournalEntry, updateJournalEntry } from "@/lib/journal";
import { journalUpdateSchema } from "@/lib/validation";

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string; entryId: string }> };

/** Both ids parsed together; null → 400. The store guards that the entry
 *  belongs to the profile, so a mismatched pair 404s rather than leaking. */
async function parseIds(
  params: Params["params"],
): Promise<{ id: number; entryId: number } | null> {
  const raw = await params;
  const id = parseId(raw.id);
  const entryId = parseId(raw.entryId);
  return id !== null && entryId !== null ? { id, entryId } : null;
}

/** PUT { entryDate?, bodyMd? } → the updated entry. */
export async function PUT(req: NextRequest, { params }: Params) {
  const ids = await parseIds(params);
  if (ids === null) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: NO_STORE },
    );
  }
  const parsed = journalUpdateSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const entry = await updateJournalEntry(ids.id, ids.entryId, parsed.data);
  if (entry === null) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ entry }, { headers: NO_STORE });
}

/** DELETE → { deleted: true }, or 404 when the entry isn't the profile's. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const ids = await parseIds(params);
  if (ids === null) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: NO_STORE },
    );
  }
  const deleted = await deleteJournalEntry(ids.id, ids.entryId);
  if (!deleted) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ deleted: true }, { headers: NO_STORE });
}
