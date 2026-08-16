import { NextRequest, NextResponse } from "next/server";
import { getAspectSearch } from "@/lib/aspectSearch";
import { transitSearchQuerySchema } from "@/lib/validation";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Ephemeral "next N exact hits" search: one (transiting planet, aspect,
 * natal target) triple against the profile's latest natal snapshot. Never
 * persisted, never cached — same stance as /api/transits/[id]. An angle
 * target on a houseless (solar) chart is a 400: the query can never succeed
 * for that profile, not a missing resource.
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
  const parsed = transitSearchQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const q = parsed.data;
  const view = await getAspectSearch(id, {
    planet: q.planet,
    target: q.target,
    aspect: q.aspect,
    count: q.count,
    from: q.from ? new Date(q.from) : new Date(),
  });
  if (view === "no_snapshot") {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  if (view === "no_angles") {
    return NextResponse.json(
      { error: "no_angles" },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json(view, { headers: NO_STORE });
}
