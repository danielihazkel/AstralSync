import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline like the other route tests: the Prisma-backed store is mocked and
// the handlers are called directly.
vi.mock("@/lib/lifeEvents", () => ({
  listLifeEvents: vi.fn(),
  createLifeEvent: vi.fn(),
  updateLifeEvent: vi.fn(),
  deleteLifeEvent: vi.fn(),
}));

import { GET, POST } from "../app/api/profiles/[id]/life-events/route";
import {
  DELETE,
  PUT,
} from "../app/api/profiles/[id]/life-events/[eventId]/route";
import {
  createLifeEvent,
  deleteLifeEvent,
  listLifeEvents,
  updateLifeEvent,
} from "@/lib/lifeEvents";

const mockList = vi.mocked(listLifeEvents);
const mockCreate = vi.mocked(createLifeEvent);
const mockUpdate = vi.mocked(updateLifeEvent);
const mockDelete = vi.mocked(deleteLifeEvent);

const event = {
  id: 3,
  title: "Moved abroad",
  eventDate: "2014-03-12",
  precision: "day" as const,
  category: "relocation" as const,
  notesMd: null,
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

function eventParams(id: string, eventId: string) {
  return { params: Promise.resolve({ id, eventId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/profiles/[id]/life-events", () => {
  it("rejects a non-numeric id", async () => {
    const res = await GET(request("/api/profiles/x/life-events"), params("x"));
    expect(res.status).toBe(400);
  });

  it("404s when the profile does not exist", async () => {
    mockList.mockResolvedValue(null);
    const res = await GET(request("/api/profiles/9/life-events"), params("9"));
    expect(res.status).toBe(404);
  });

  it("returns the profile's events", async () => {
    mockList.mockResolvedValue([event]);
    const res = await GET(request("/api/profiles/1/life-events"), params("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventDate).toBe("2014-03-12");
    expect(mockList).toHaveBeenCalledWith(1);
  });
});

describe("POST /api/profiles/[id]/life-events", () => {
  const body = {
    title: "Moved abroad",
    eventDate: "2014-03-12",
    category: "relocation",
  };

  it("creates an event, defaulting precision to day", async () => {
    mockCreate.mockResolvedValue(event);
    const res = await POST(
      request("/api/profiles/1/life-events", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params("1"),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).event.id).toBe(3);
    expect(mockCreate).toHaveBeenCalledWith({
      profileId: 1,
      title: "Moved abroad",
      eventDate: "2014-03-12",
      precision: "day",
      category: "relocation",
      notesMd: undefined,
    });
  });

  it("accepts month and year precision with canonical dates", async () => {
    mockCreate.mockResolvedValue(event);
    for (const [eventDate, precision] of [
      ["2014-03-01", "month"],
      ["2014-01-01", "year"],
    ] as const) {
      const res = await POST(
        request("/api/profiles/1/life-events", {
          method: "POST",
          body: JSON.stringify({ ...body, eventDate, precision }),
        }),
        params("1"),
      );
      expect(res.status).toBe(201);
    }
  });

  it("rejects a non-canonical date for the precision", async () => {
    const res = await POST(
      request("/api/profiles/1/life-events", {
        method: "POST",
        body: JSON.stringify({ ...body, precision: "year" }),
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an impossible calendar date", async () => {
    const res = await POST(
      request("/api/profiles/1/life-events", {
        method: "POST",
        body: JSON.stringify({ ...body, eventDate: "2014-02-30" }),
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown category and an empty title", async () => {
    for (const bad of [
      { ...body, category: "misc" },
      { ...body, title: "   " },
    ]) {
      const res = await POST(
        request("/api/profiles/1/life-events", {
          method: "POST",
          body: JSON.stringify(bad),
        }),
        params("1"),
      );
      expect(res.status).toBe(400);
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("404s when the profile does not exist", async () => {
    mockCreate.mockResolvedValue(null);
    const res = await POST(
      request("/api/profiles/9/life-events", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params("9"),
    );
    expect(res.status).toBe(404);
  });

  it("409s at the per-profile limit", async () => {
    mockCreate.mockResolvedValue("limit");
    const res = await POST(
      request("/api/profiles/1/life-events", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params("1"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("limit_reached");
  });
});

describe("PUT /api/profiles/[id]/life-events/[eventId]", () => {
  it("rejects a non-numeric event id", async () => {
    const res = await PUT(
      request("/api/profiles/1/life-events/x", {
        method: "PUT",
        body: JSON.stringify({ title: "Edited" }),
      }),
      eventParams("1", "x"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty patch", async () => {
    const res = await PUT(
      request("/api/profiles/1/life-events/3", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      eventParams("1", "3"),
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects eventDate without precision (and vice versa)", async () => {
    for (const bad of [{ eventDate: "2014-03-12" }, { precision: "month" }]) {
      const res = await PUT(
        request("/api/profiles/1/life-events/3", {
          method: "PUT",
          body: JSON.stringify(bad),
        }),
        eventParams("1", "3"),
      );
      expect(res.status).toBe(400);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("404s when the event is not the profile's", async () => {
    mockUpdate.mockResolvedValue(null);
    const res = await PUT(
      request("/api/profiles/2/life-events/3", {
        method: "PUT",
        body: JSON.stringify({ title: "Edited" }),
      }),
      eventParams("2", "3"),
    );
    expect(res.status).toBe(404);
  });

  it("updates the event and clears notes with null", async () => {
    mockUpdate.mockResolvedValue({ ...event, title: "Edited" });
    const res = await PUT(
      request("/api/profiles/1/life-events/3", {
        method: "PUT",
        body: JSON.stringify({
          title: "Edited",
          eventDate: "2015-06-01",
          precision: "month",
          category: "career",
          notesMd: null,
        }),
      }),
      eventParams("1", "3"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).event.title).toBe("Edited");
    expect(mockUpdate).toHaveBeenCalledWith(1, 3, {
      title: "Edited",
      eventDate: "2015-06-01",
      precision: "month",
      category: "career",
      notesMd: null,
    });
  });
});

describe("DELETE /api/profiles/[id]/life-events/[eventId]", () => {
  it("404s when the event is not the profile's", async () => {
    mockDelete.mockResolvedValue(false);
    const res = await DELETE(
      request("/api/profiles/2/life-events/3", { method: "DELETE" }),
      eventParams("2", "3"),
    );
    expect(res.status).toBe(404);
  });

  it("soft-deletes the event", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(
      request("/api/profiles/1/life-events/3", { method: "DELETE" }),
      eventParams("1", "3"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(1, 3);
  });
});
