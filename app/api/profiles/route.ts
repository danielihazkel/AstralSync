import { NextRequest, NextResponse } from "next/server";
import {
  createProfile,
  listProfiles,
  UnknownCityError,
} from "@/lib/snapshots";
import { profileInputSchema } from "@/lib/validation";

// Profile lists carry personal birth data — keep them out of shared caches.
const NO_STORE = { "Cache-Control": "no-store" };

/** Multi-profile list (PRD §4.6). */
export async function GET() {
  return NextResponse.json(
    { profiles: await listProfiles() },
    { headers: NO_STORE },
  );
}

/**
 * Create a profile. This is the compute-once moment: the chart and
 * numerology are calculated here, stored as snapshot version 1, and read
 * from the database forever after.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const view = await createProfile(parsed.data);
    return NextResponse.json(view, { status: 201 });
  } catch (e) {
    if (e instanceof UnknownCityError) {
      console.error("[api] profiles POST:", e);
      return NextResponse.json(
        { error: "unknown_city", message: e.message },
        { status: 400 },
      );
    }
    throw e;
  }
}
