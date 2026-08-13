import { NextRequest, NextResponse } from "next/server";
import {
  getEntry,
  loadContentIndex,
  natalAspectKey,
  transitAspectKey,
} from "@/lib/content";
import { getTransitView } from "@/lib/transits";
import { transitQuerySchema } from "@/lib/validation";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Ephemeral transit read: current placements + cross aspects vs. the
 * profile's latest natal snapshot. Never persisted, never cached (PRD §9).
 * `?at=<ISO instant>` pins the computation instant — a testing hook, not
 * exposed in the UI. Instants far outside ~1700–2200 may exceed the
 * ephemeris' Pluto model and surface as a 500.
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
  const parsed = transitQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const at = parsed.data.at ? new Date(parsed.data.at) : undefined;
  const view = await getTransitView(id, at);
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }

  // Optional per-aspect prose, keyed by the directional transit key: an
  // authored transit_aspect entry when it exists, else the natal archetype
  // (same degradation path as the forecast prompt and synastry page).
  const index = loadContentIndex();
  const prose: Record<string, { title: string; bodyMd: string }> = {};
  for (const c of view.crossAspects) {
    const key = transitAspectKey(c.a, c.b, c.type);
    const entry =
      getEntry(index, key) ?? getEntry(index, natalAspectKey(c.a, c.b, c.type));
    if (entry) prose[key] = { title: entry.title, bodyMd: entry.bodyMd };
  }
  return NextResponse.json({ ...view, prose }, { headers: NO_STORE });
}
