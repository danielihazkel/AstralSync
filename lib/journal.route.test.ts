import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline like the other route tests: the Prisma-backed store is mocked and
// the handlers are called directly.
vi.mock("@/lib/journal", () => ({
  listJournalEntries: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));

import { GET, POST } from "../app/api/profiles/[id]/journal/route";
import {
  DELETE,
  PUT,
} from "../app/api/profiles/[id]/journal/[entryId]/route";
import {
  createJournalEntry,
  deleteJournalEntry,
  listJournalEntries,
  updateJournalEntry,
} from "@/lib/journal";

const mockList = vi.mocked(listJournalEntries);
const mockCreate = vi.mocked(createJournalEntry);
const mockUpdate = vi.mocked(updateJournalEntry);
const mockDelete = vi.mocked(deleteJournalEntry);

const entry = {
  id: 7,
  entryDate: "2026-08-01",
  bodyMd: "Saturn station day — everything felt slow.",
  createdAt: new Date("2026-08-01T20:00:00.000Z"),
  updatedAt: new Date("2026-08-01T20:00:00.000Z"),
};

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`http://localhost${path}`, init);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function entryParams(id: string, entryId: string) {
  return { params: Promise.resolve({ id, entryId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/profiles/[id]/journal", () => {
  it("rejects a non-numeric id", async () => {
    const res = await GET(request("/api/profiles/x/journal"), params("x"));
    expect(res.status).toBe(400);
  });

  it("404s when the profile does not exist", async () => {
    mockList.mockResolvedValue(null);
    const res = await GET(request("/api/profiles/9/journal"), params("9"));
    expect(res.status).toBe(404);
  });

  it("returns the profile's entries", async () => {
    mockList.mockResolvedValue([entry]);
    const res = await GET(request("/api/profiles/1/journal"), params("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].entryDate).toBe("2026-08-01");
    expect(mockList).toHaveBeenCalledWith(1, {});
  });

  it("passes the date range through to the store", async () => {
    mockList.mockResolvedValue([]);
    const res = await GET(
      request("/api/profiles/1/journal?from=2026-01-01&to=2026-06-30"),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, {
      from: "2026-01-01",
      to: "2026-06-30",
    });
  });

  it("rejects an inverted range", async () => {
    const res = await GET(
      request("/api/profiles/1/journal?from=2026-06-30&to=2026-01-01"),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("rejects a malformed date", async () => {
    const res = await GET(
      request("/api/profiles/1/journal?from=2026-02-30"),
      params("1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/profiles/[id]/journal", () => {
  const body = { entryDate: "2026-08-01", bodyMd: "A note." };

  it("creates an entry", async () => {
    mockCreate.mockResolvedValue(entry);
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params("1"),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).entry.id).toBe(7);
    expect(mockCreate).toHaveBeenCalledWith({ profileId: 1, ...body });
  });

  it("404s when the profile does not exist", async () => {
    mockCreate.mockResolvedValue(null);
    const res = await POST(
      request("/api/profiles/9/journal", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params("9"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects an empty note", async () => {
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify({ entryDate: "2026-08-01", bodyMd: "   " }),
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an impossible calendar date", async () => {
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify({ entryDate: "2026-02-30", bodyMd: "A note." }),
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(
      request("/api/profiles/1/journal", { method: "POST", body: "nope" }),
      params("1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/profiles/[id]/journal/[entryId]", () => {
  it("rejects a non-numeric entry id", async () => {
    const res = await PUT(
      request("/api/profiles/1/journal/x", {
        method: "PUT",
        body: JSON.stringify({ bodyMd: "Edited." }),
      }),
      entryParams("1", "x"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty patch", async () => {
    const res = await PUT(
      request("/api/profiles/1/journal/7", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      entryParams("1", "7"),
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("404s when the entry is not the profile's", async () => {
    mockUpdate.mockResolvedValue(null);
    const res = await PUT(
      request("/api/profiles/2/journal/7", {
        method: "PUT",
        body: JSON.stringify({ bodyMd: "Edited." }),
      }),
      entryParams("2", "7"),
    );
    expect(res.status).toBe(404);
  });

  it("updates the note", async () => {
    mockUpdate.mockResolvedValue({ ...entry, bodyMd: "Edited." });
    const res = await PUT(
      request("/api/profiles/1/journal/7", {
        method: "PUT",
        body: JSON.stringify({ bodyMd: "Edited." }),
      }),
      entryParams("1", "7"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).entry.bodyMd).toBe("Edited.");
    expect(mockUpdate).toHaveBeenCalledWith(1, 7, { bodyMd: "Edited." });
  });
});

describe("DELETE /api/profiles/[id]/journal/[entryId]", () => {
  it("404s when the entry is not the profile's", async () => {
    mockDelete.mockResolvedValue(false);
    const res = await DELETE(
      request("/api/profiles/2/journal/7", { method: "DELETE" }),
      entryParams("2", "7"),
    );
    expect(res.status).toBe(404);
  });

  it("deletes the note", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(
      request("/api/profiles/1/journal/7", { method: "DELETE" }),
      entryParams("1", "7"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(1, 7);
  });
});
