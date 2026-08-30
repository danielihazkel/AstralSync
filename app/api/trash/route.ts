import { NextRequest, NextResponse } from "next/server";
import {
  emptyTrash,
  listTrash,
  purgeJournalEntry,
  purgeProfile,
  purgeReading,
  restoreJournalEntry,
  restoreProfile,
  restoreReading,
} from "@/lib/trash";
import { trashActionSchema } from "@/lib/validation";

// Trash contents are personal data — never cache.
const NO_STORE = { "Cache-Control": "no-store" };

/** Everything restorable: trashed profiles, trashed notes, discarded readings. */
export async function GET() {
  return NextResponse.json(await listTrash(), { headers: NO_STORE });
}

/**
 * `{ action: "restore" | "purge", kind: "profile" | "journal" | "reading", id }`.
 * Restore puts the item back where it was; purge is the irreversible hard
 * delete. A reading whose slot has been regenerated meanwhile answers 409
 * `slot_taken` and stays in the Trash.
 */
export async function POST(req: NextRequest) {
  const parsed = trashActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const { action, kind, id } = parsed.data;

  if (kind === "reading" && action === "restore") {
    const result = await restoreReading(id);
    if (result === "not_found") {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: NO_STORE },
      );
    }
    if (result === "slot_taken") {
      return NextResponse.json(
        { error: "slot_taken" },
        { status: 409, headers: NO_STORE },
      );
    }
    return NextResponse.json({ restored: true }, { headers: NO_STORE });
  }

  const ok =
    kind === "profile"
      ? action === "restore"
        ? await restoreProfile(id)
        : await purgeProfile(id)
      : kind === "journal"
        ? action === "restore"
          ? await restoreJournalEntry(id)
          : await purgeJournalEntry(id)
        : await purgeReading(id);
  if (!ok) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    action === "restore" ? { restored: true } : { purged: true },
    { headers: NO_STORE },
  );
}

/** Empty the Trash — hard-deletes everything in it. */
export async function DELETE() {
  return NextResponse.json(
    { purged: await emptyTrash() },
    { headers: NO_STORE },
  );
}
