import { NextRequest, NextResponse } from "next/server";
import {
  UnsupportedExportVersion,
  findExistingProfiles,
  importBundle,
  importProfile,
  isBundle,
  profileBundleSchema,
  profileExportSchema,
  upgradeExport,
} from "@/lib/importProfile";

// Generous for a JSON export; a whole-installation bundle scales with the
// profile count, and every journal note now carries its pinned sky snapshot
// (placements + cross-aspects), so real files are larger than they once were.
const MAX_BODY_BYTES = 50 * 1024 * 1024;

/**
 * Restore from an export file — one profile (the /api/profiles/[id]/export
 * shape → `{ id }`) or an "Export all" bundle (→ `{ ids, skipped }`).
 * Snapshots and readings are recreated verbatim under new profile ids — no
 * recompute. A profile that is already here (same name and birth data) is
 * not silently duplicated: without `?duplicates=skip|keep` the route answers
 * 409 `duplicates` with the matches, and the client asks which. A bundle's
 * optional `settings` block is the client's business (browser preferences
 * never reach the server). (This static segment wins over the [id] route,
 * which only accepts numeric ids anyway.)
 */
export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const mode = req.nextUrl.searchParams.get("duplicates");
  if (mode !== null && mode !== "skip" && mode !== "keep") {
    return NextResponse.json({ error: "invalid_duplicates_mode" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // One place decides what an older file means (lib/importProfile).
  let body: unknown;
  try {
    body = upgradeExport(raw);
  } catch (e) {
    if (e instanceof UnsupportedExportVersion) {
      return NextResponse.json(
        { error: "unsupported_export_version" },
        { status: 400 },
      );
    }
    throw e;
  }

  if (isBundle(body)) {
    const parsed = profileBundleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_import", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const matches =
      mode === "keep" ? [] : await findExistingProfiles(parsed.data.profiles);
    if (matches.length > 0 && mode === null) {
      return NextResponse.json(
        { error: "duplicates", duplicates: matches, total: parsed.data.profiles.length },
        { status: 409 },
      );
    }
    try {
      // One transaction for the whole bundle: a failure partway through used
      // to leave the earlier profiles imported, 500, and return no ids at
      // all, so the user could not tell what had landed.
      const ids = await importBundle(
        parsed.data,
        new Map(matches.map((m) => [m.index, m.existingId])),
      );
      return NextResponse.json({ ids, skipped: matches.length }, { status: 201 });
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

  if (mode !== "keep") {
    const [match] = await findExistingProfiles([parsed.data]);
    if (match && mode === null) {
      return NextResponse.json(
        { error: "duplicates", duplicates: [match], total: 1 },
        { status: 409 },
      );
    }
    if (match) {
      return NextResponse.json({ id: match.existingId, skipped: true }, { status: 200 });
    }
  }

  try {
    const id = await importProfile(parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    console.error("[api] profiles import:", e);
    throw e;
  }
}
