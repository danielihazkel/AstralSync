import { NextRequest, NextResponse } from "next/server";
import { listRelationships, saveRelationship } from "@/lib/relationships";
import { relationshipSaveSchema } from "@/lib/validation";

// Relationship lists name real people — keep them out of shared caches.
const NO_STORE = { "Cache-Control": "no-store" };

/** Every saved relationship between live profiles, newest first. */
export async function GET() {
  return NextResponse.json(
    { relationships: await listRelationships() },
    { headers: NO_STORE },
  );
}

/** Save (create or overwrite — one row per pair) a relationship. */
export async function POST(req: NextRequest) {
  const parsed = relationshipSaveSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const view = await saveRelationship(parsed.data);
  if (!view) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(view, { status: 201, headers: NO_STORE });
}
