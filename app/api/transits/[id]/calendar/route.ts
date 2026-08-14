import { NextRequest, NextResponse } from "next/server";
import { getTransitCalendar } from "@/lib/transitCalendar";
import { transitCalendarQuerySchema } from "@/lib/validation";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Ephemeral transit-calendar read: exact aspect hits, ingresses, stations
 * and eclipses across a civil-date range, against the profile's latest
 * natal snapshot. Never persisted, never cached — same stance as
 * /api/transits/[id]. Day boundaries are UTC; a hit near local midnight may
 * render under the adjacent local day.
 */
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
  const parsed = transitCalendarQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const from = new Date(`${parsed.data.from}T00:00:00Z`);
  // Inclusive range: scan through the end of the `to` day.
  const to = new Date(Date.parse(`${parsed.data.to}T00:00:00Z`) + 86_400_000);
  const view = await getTransitCalendar(id, from, to, {
    includeMinors: parsed.data.minors === "1",
  });
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json(view, { headers: NO_STORE });
}
