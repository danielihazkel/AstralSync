import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline like the other route tests: the Prisma-backed store is mocked and
// the handlers are called directly.
vi.mock("@/lib/journal", () => ({
  listJournalEntries: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
  skyForEntry: vi.fn(),
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
  skyForEntry,
  updateJournalEntry,
  type EntrySky,
} from "@/lib/journal";

const mockList = vi.mocked(listJournalEntries);
const mockCreate = vi.mocked(createJournalEntry);
const mockUpdate = vi.mocked(updateJournalEntry);
const mockDelete = vi.mocked(deleteJournalEntry);
const mockSky = vi.mocked(skyForEntry);

const sky: EntrySky = {
  computedAt: "2026-08-01T09:00:00.000Z",
  natalVersion: 1,
  engine: { name: "astronomy-engine", version: "2.1.19" },
  placements: [],
  crossAspects: [],
};

const entry = {
  id: 7,
  entryDate: "2026-08-01",
  bodyMd: "Saturn station day — everything felt slow.",
  mood: null,
  tags: [],
  sky,
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
  mockSky.mockResolvedValue(sky);
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

  it("creates an entry with the captured sky", async () => {
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
    expect(mockSky).toHaveBeenCalledWith(1, "2026-08-01", undefined);
    expect(mockCreate).toHaveBeenCalledWith({ profileId: 1, ...body, sky });
  });

  it("threads the client's `at` instant into the sky capture", async () => {
    mockCreate.mockResolvedValue(entry);
    const at = "2026-08-01T12:00:00+03:00";
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify({ ...body, at }),
      }),
      params("1"),
    );
    expect(res.status).toBe(201);
    expect(mockSky).toHaveBeenCalledWith(1, "2026-08-01", at);
  });

  it("rejects an `at` on a different date than entryDate", async () => {
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify({ ...body, at: "2026-08-02T12:00:00+03:00" }),
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("still creates the entry when no sky is available", async () => {
    mockSky.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...entry, sky: null });
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params("1"),
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      profileId: 1,
      ...body,
      sky: null,
    });
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

  it("passes mood and normalized tags through to the store", async () => {
    mockCreate.mockResolvedValue({
      ...entry,
      mood: "high" as const,
      tags: ["work"],
    });
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify({ ...body, mood: "high", tags: [" Work "] }),
      }),
      params("1"),
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      profileId: 1,
      ...body,
      mood: "high",
      tags: ["work"],
      sky,
    });
  });

  it("rejects an unknown mood", async () => {
    const res = await POST(
      request("/api/profiles/1/journal", {
        method: "POST",
        body: JSON.stringify({ ...body, mood: "ecstatic" }),
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
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

  it("updates the note body without recomputing the stored sky", async () => {
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
    expect(mockSky).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(1, 7, { bodyMd: "Edited." });
  });

  it("updates mood alone without touching body, tags or sky", async () => {
    mockUpdate.mockResolvedValue({ ...entry, mood: "high" as const });
    const res = await PUT(
      request("/api/profiles/1/journal/7", {
        method: "PUT",
        body: JSON.stringify({ mood: "high" }),
      }),
      entryParams("1", "7"),
    );
    expect(res.status).toBe(200);
    expect(mockSky).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(1, 7, {
      bodyMd: undefined,
      mood: "high",
      tags: undefined,
    });
  });

  it("clears mood with null and tags with []", async () => {
    mockUpdate.mockResolvedValue(entry);
    const res = await PUT(
      request("/api/profiles/1/journal/7", {
        method: "PUT",
        body: JSON.stringify({ mood: null, tags: [] }),
      }),
      entryParams("1", "7"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(1, 7, {
      bodyMd: undefined,
      mood: null,
      tags: [],
    });
  });

  it("recomputes the sky when the entry moves to another date", async () => {
    mockUpdate.mockResolvedValue({ ...entry, entryDate: "2026-08-05" });
    const res = await PUT(
      request("/api/profiles/1/journal/7", {
        method: "PUT",
        body: JSON.stringify({ entryDate: "2026-08-05" }),
      }),
      entryParams("1", "7"),
    );
    expect(res.status).toBe(200);
    expect(mockSky).toHaveBeenCalledWith(1, "2026-08-05", undefined);
    expect(mockUpdate).toHaveBeenCalledWith(1, 7, {
      entryDate: "2026-08-05",
      bodyMd: undefined,
      sky,
    });
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
