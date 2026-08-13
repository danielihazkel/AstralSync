import { NextRequest, NextResponse } from "next/server";
import { exportProfile } from "@/lib/snapshots";

// Exports are full personal birth data — keep them out of shared caches.
const NO_STORE = { "Cache-Control": "no-store" };

/** Full JSON export (PRD §4.6): profile, every snapshot version, readings. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: NO_STORE },
    );
  }
  const data = await exportProfile(id);
  if (!data) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json(data, {
    headers: {
      ...NO_STORE,
      "Content-Disposition": `attachment; filename="astralsync-profile-${id}.json"`,
    },
  });
}
