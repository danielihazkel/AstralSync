import { NextRequest, NextResponse } from "next/server";
import { listAllJournalEntries } from "@/lib/journal";
import { journalTimelineQuerySchema } from "@/lib/validation";
import { TIMELINE_PAGE_SIZE } from "@/lib/journalTimeline";

// Journal entries are personal notes — keep them out of shared caches.
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The global journal timeline, cursor-paginated (newest entry date first).
 * The /journal page server-loads the first page and fetches the rest here
 * on "Load more" — the scale guardrail for years of notes.
 */
export async function GET(req: NextRequest) {
  const parsed = journalTimelineQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const limit = parsed.data.limit ?? TIMELINE_PAGE_SIZE;
  const entries = await listAllJournalEntries({
    cursor: parsed.data.cursor,
    limit,
  });
  const nextCursor =
    entries.length === limit ? entries[entries.length - 1].id : null;
  return NextResponse.json({ entries, nextCursor }, { headers: NO_STORE });
}
