import { beforeEach, describe, expect, it, vi } from "vitest";
import { lifeEventUpdateSchema } from "./validation";

vi.mock("./db", () => ({
  prisma: {
    lifeEvent: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("./pinnedSky", () => ({ skyForDate: vi.fn() }));

import { prisma } from "./db";
import { updateLifeEvent } from "./lifeEvents";
import { skyForDate } from "./pinnedSky";

const mockFind = vi.mocked(prisma.lifeEvent.findFirst);
const mockUpdate = vi.mocked(prisma.lifeEvent.update);
const mockSky = vi.mocked(skyForDate);

const STORED_DATE = new Date(Date.UTC(2011, 5, 3));

beforeEach(() => {
  mockFind.mockReset().mockResolvedValue({
    id: 9,
    eventDate: STORED_DATE,
  } as never);
  mockUpdate.mockReset().mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => ({
    id: 9,
    title: "Moved to Haifa",
    eventDate: STORED_DATE,
    precision: "day",
    category: "relocation",
    notesMd: null,
    skyJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...args.data,
  })) as never);
  mockSky.mockReset().mockResolvedValue(null);
});

describe("updateLifeEvent — the pinned sky", () => {
  it("leaves the sky alone when the form resends the unchanged date", async () => {
    // The edit form sends every field. A retitle used to re-pin the sky.
    await updateLifeEvent(1, 9, {
      title: "Moved to Haifa",
      eventDate: "2011-06-03",
      precision: "day",
      at: "2011-06-03T12:00:00+03:00",
    });
    expect(mockSky).not.toHaveBeenCalled();
    const data = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("skyJson");
    expect(data.title).toBe("Moved to Haifa");
  });

  it("re-pins the sky when the date really moves", async () => {
    await updateLifeEvent(1, 9, {
      eventDate: "2015-06-03",
      precision: "day",
      at: "2015-06-03T12:00:00+03:00",
    });
    expect(mockSky).toHaveBeenCalledWith(1, "2015-06-03", "2015-06-03T12:00:00+03:00");
    expect(mockUpdate.mock.calls[0][0].data).toHaveProperty("skyJson");
  });

  it("returns null for another profile's event", async () => {
    mockFind.mockResolvedValue(null);
    expect(await updateLifeEvent(2, 9, { title: "x" })).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("lifeEventUpdateSchema", () => {
  it("refuses an `at` from a different day than the date it stores", () => {
    const parsed = lifeEventUpdateSchema.safeParse({
      eventDate: "2015-06-03",
      precision: "day",
      at: "2011-06-03T12:00:00+03:00",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a matching `at`", () => {
    expect(
      lifeEventUpdateSchema.safeParse({
        eventDate: "2015-06-03",
        precision: "day",
        at: "2015-06-03T12:00:00+03:00",
      }).success,
    ).toBe(true);
  });
});
