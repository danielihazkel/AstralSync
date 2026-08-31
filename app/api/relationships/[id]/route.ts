import { NextRequest, NextResponse } from "next/server";
import { deleteRelationship } from "@/lib/relationships";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Remove a saved relationship. The pair's cached synastry reading and the
 *  profiles themselves are untouched — this deletes only the label. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const deleted = await deleteRelationship(id);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
