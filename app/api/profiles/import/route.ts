import { NextRequest, NextResponse } from "next/server";
import {
  importProfile,
  isBundle,
  profileBundleSchema,
  profileExportSchema,
} from "@/lib/importProfile";

// Generous for a JSON export (the largest real ones are tens of KB); a
// whole-installation bundle scales with the profile count.
const MAX_BODY_BYTES = 50 * 1024 * 1024;

/**
 * Restore from an export file — one profile (the /api/profiles/[id]/export
 * shape → `{ id }`) or an "Export all" bundle (→ `{ ids }`). Snapshots and
 * readings are recreated verbatim under new profile ids — no recompute,
 * duplicates allowed. A bundle's optional `settings` block is the client's
 * business (browser preferences never reach the server). (This static
 * segment wins over the [id] route, which only accepts numeric ids anyway.)
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

  if (isBundle(body)) {
    const parsed = profileBundleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_import", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    try {
      const ids: number[] = [];
      for (const p of parsed.data.profiles) ids.push(await importProfile(p));
      return NextResponse.json({ ids }, { status: 201 });
    } catch (e) {
      console.error("[api] profiles import (bundle):", e);
      throw e;
    }
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
