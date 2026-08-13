import { NextRequest, NextResponse } from "next/server";
import { importProfile, profileExportSchema } from "@/lib/importProfile";

// Generous for a JSON export (the largest real ones are tens of KB).
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Restore a profile from an export file (the /api/profiles/[id]/export
 * shape). Snapshots and readings are recreated verbatim under a new profile
 * id — no recompute, duplicates allowed. (This static segment wins over the
 * [id] route, which only accepts numeric ids anyway.)
 */
export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body === "object" &&
    "exportVersion" in body &&
    body.exportVersion !== 1
  ) {
    return NextResponse.json(
      { error: "unsupported_export_version" },
      { status: 400 },
    );
  }
  const parsed = profileExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_import", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const id = await importProfile(parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    console.error("[api] profiles import:", e);
    throw e;
  }
}
