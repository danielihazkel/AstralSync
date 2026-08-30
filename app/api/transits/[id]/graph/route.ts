import { NextRequest, NextResponse } from "next/server";
import { getTransitGraph } from "@/lib/transitGraph";
import { transitOptionsFromQuery } from "@/lib/transits";
import { transitGraphQuerySchema } from "@/lib/validation";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Ephemeral transit time-graph read: every in-orb window of a transiting
 * contact that touches the civil-date range, grouped by natal target, at
 * the requested (or default transit) orbs. Never persisted, never cached —
 * the /api/transits/[id]/calendar stance.
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
  const parsed = transitGraphQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const from = new Date(`${parsed.data.from}T00:00:00Z`);
  const to = new Date(Date.parse(`${parsed.data.to}T00:00:00Z`) + 86_400_000);
  const view = await getTransitGraph(id, from, to, transitOptionsFromQuery(parsed.data));
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json(view, { headers: NO_STORE });
}
