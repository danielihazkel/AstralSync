import { NextResponse } from "next/server";
import { exportAllProfiles } from "@/lib/snapshots";

// Exports are full personal birth data — keep them out of shared caches.
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Every live profile in one bundle (`{ exportVersion: 1, bundle: true,
 * profiles: [...] }`) — each element is the single-profile export shape, so
 * POST /api/profiles/import restores them one by one. (This static segment
 * wins over the [id] route, which only accepts numeric ids anyway.)
 */
export async function GET() {
  const data = await exportAllProfiles();
  const stamp = data.exportedAt.slice(0, 10);
  return NextResponse.json(data, {
    headers: {
      ...NO_STORE,
      "Content-Disposition": `attachment; filename="astralsync-all-profiles-${stamp}.json"`,
    },
  });
}
