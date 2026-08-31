import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelationshipView } from "./relationships";

// The routes pull in @/lib/relationships, whose Prisma wrapper would need a
// live DB; mock the module so these tests stay offline.
vi.mock("@/lib/relationships", () => ({
  listRelationships: vi.fn(),
  saveRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
}));

import { GET, POST } from "../app/api/relationships/route";
import { DELETE } from "../app/api/relationships/[id]/route";
import {
  deleteRelationship,
  listRelationships,
  saveRelationship,
} from "@/lib/relationships";

const canned: RelationshipView = {
  id: 9,
  aId: 1,
  bId: 2,
  aName: "Dana",
  bName: "Noa",
  kind: "partner",
  label: "us",
  note: null,
  createdAt: "2026-08-31T00:00:00.000Z",
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/relationships", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(listRelationships).mockReset().mockResolvedValue([canned]);
  vi.mocked(saveRelationship).mockReset().mockResolvedValue(canned);
  vi.mocked(deleteRelationship).mockReset().mockResolvedValue(true);
});

describe("GET /api/relationships", () => {
  it("returns the list with Cache-Control: no-store", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ relationships: [canned] });
  });
});

describe("POST /api/relationships", () => {
  it("saves a valid pair (order-insensitive server-side)", async () => {
    const res = await POST(post({ a: 2, b: 1, kind: "partner", label: "us" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(canned);
    expect(saveRelationship).toHaveBeenCalledWith({
      a: 2,
      b: 1,
      kind: "partner",
      label: "us",
    });
  });

  it("rejects a self-pair and junk kinds with 400", async () => {
    expect((await POST(post({ a: 3, b: 3, kind: "partner" }))).status).toBe(400);
    expect((await POST(post({ a: 1, b: 2, kind: "situationship" }))).status).toBe(400);
    expect(saveRelationship).not.toHaveBeenCalled();
  });

  it("404s when a profile is missing or trashed", async () => {
    vi.mocked(saveRelationship).mockResolvedValue(null);
    const res = await POST(post({ a: 1, b: 99, kind: "friend" }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/relationships/[id]", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = new NextRequest("http://localhost/api/relationships/9", {
    method: "DELETE",
  });

  it("deletes and reports it", async () => {
    const res = await DELETE(req, params("9"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(deleteRelationship).toHaveBeenCalledWith(9);
  });

  it("400s bad ids and 404s unknown ones", async () => {
    expect((await DELETE(req, params("zero"))).status).toBe(400);
    vi.mocked(deleteRelationship).mockResolvedValue(false);
    expect((await DELETE(req, params("77"))).status).toBe(404);
  });
});
