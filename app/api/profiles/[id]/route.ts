import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteProfile,
  editProfile,
  getProfileView,
  setPrimaryProfile,
  setProfileTags,
  UnknownCityError,
} from "@/lib/snapshots";
import { profileInputSchema, profilePatchSchema } from "@/lib/validation";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Profile views carry personal birth data — keep them out of shared caches.
const NO_STORE = { "Cache-Control": "no-store" };

/** View a profile with its latest snapshot pair, or `?version=N` for history. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const versionRaw = req.nextUrl.searchParams.get("version");
  const version = versionRaw === null ? undefined : parseId(versionRaw);
  if (version === null) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }
  const view = await getProfileView(id, version);
  if (!view) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json(view, { headers: NO_STORE });
}

/**
 * Edit a profile. Changing birth data (or house system) recomputes once and
 * writes snapshot version N+1 — existing snapshots are never touched
 * (write-once, PRD §4.4). Presentational edits update the profile row only.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const view = await editProfile(id, parsed.data);
    if (!view) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(view);
  } catch (e) {
    if (e instanceof UnknownCityError) {
      console.error("[api] profiles PUT:", e);
      return NextResponse.json(
        { error: "unknown_city", message: e.message },
        { status: 400 },
      );
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // A concurrent edit already claimed this version number.
      console.error("[api] profiles PUT version conflict:", e);
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    throw e;
  }
}

/**
 * Installation-level metadata: `{ isPrimary }` marks this profile as "me"
 * (any other primary is cleared) or clears it; `{ tags }` replaces the
 * free-form tags. Never recomputes or versions.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const parsed = profilePatchSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const patch = parsed.data;
  if (patch.isPrimary !== undefined) {
    const ok = await setPrimaryProfile(id, patch.isPrimary);
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }
  if (patch.tags !== undefined) {
    const ok = await setProfileTags(id, patch.tags);
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }
  return NextResponse.json({ id, ...patch });
}

/**
 * Delete (PRD §4.6) — into the Trash. The profile, its versions, readings
 * and notes stay restorable from Settings → Trash until purged there;
 * `restorable: true` tells the client to offer Undo.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const deleted = await deleteProfile(id);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, restorable: true });
}
