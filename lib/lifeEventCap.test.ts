import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LIFE_EVENTS_PER_PROFILE } from "./lifeEventMeta";

// One fake client serves as both the top-level client and the interactive
// transaction's `tx`; $transaction just runs the callback against it. What
// matters here is the order of operations: lock, count, then write.
const { calls, fake } = vi.hoisted(() => {
  const calls: string[] = [];
  const fake = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(fake)),
    $queryRaw: vi.fn(async () => {
      calls.push("lock");
      return [];
    }),
    profile: { findUnique: vi.fn(async () => ({ id: 1 })) },
    lifeEvent: {
      count: vi.fn(async () => {
        calls.push("count");
        return 0;
      }),
      findFirst: vi.fn(async () => ({ profileId: 1 })),
      updateMany: vi.fn(async () => {
        calls.push("restore");
        return { count: 1 };
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push("create");
        return {
          id: 5,
          title: args.data.title,
          eventDate: args.data.eventDate,
          precision: "day",
          category: "career",
          notesMd: null,
          skyJson: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
    },
  };
  return { calls, fake };
});

vi.mock("./db", () => ({ prisma: fake }));
vi.mock("./pinnedSky", () => ({ skyForDate: vi.fn(async () => null) }));

import { createLifeEvent } from "./lifeEvents";
import { restoreLifeEvent } from "./trash";

const NEW_EVENT = {
  profileId: 1,
  title: "New job",
  eventDate: "2020-03-01",
  precision: "day" as const,
  category: "career" as const,
};

beforeEach(() => {
  calls.length = 0;
  fake.lifeEvent.count.mockClear();
  fake.lifeEvent.findFirst.mockResolvedValue({ profileId: 1 });
});

describe("the life-event cap", () => {
  it("counts under the profile lock, inside the write's transaction", async () => {
    const created = await createLifeEvent(NEW_EVENT);
    expect(created).not.toBe("limit");
    expect(calls).toEqual(["lock", "count", "create"]);
  });

  it("refuses a create at the cap", async () => {
    fake.lifeEvent.count.mockResolvedValueOnce(MAX_LIFE_EVENTS_PER_PROFILE);
    expect(await createLifeEvent(NEW_EVENT)).toBe("limit");
    expect(calls).not.toContain("create");
  });

  it("keeps a trashed event in the Trash when restoring would pass the cap", async () => {
    // Trash one, add one to reach the cap, restore — used to leave cap + 1.
    fake.lifeEvent.count.mockResolvedValueOnce(MAX_LIFE_EVENTS_PER_PROFILE);
    expect(await restoreLifeEvent(9)).toBe("limit");
    expect(calls).not.toContain("restore");
  });

  it("restores below the cap", async () => {
    expect(await restoreLifeEvent(9)).toBe("restored");
    expect(calls).toEqual(["lock", "count", "restore"]);
  });

  it("answers not_found for an event that is not in the Trash", async () => {
    fake.lifeEvent.findFirst.mockResolvedValueOnce(null as never);
    expect(await restoreLifeEvent(9)).toBe("not_found");
  });
});
