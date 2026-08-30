import { describe, expect, it } from "vitest";
import {
  shouldFilter,
  shouldFilterViaProfile,
  withLiveFilter,
  withLiveProfileFilter,
} from "./softDelete";

describe("withLiveProfileFilter", () => {
  it("narrows snapshot reads to live profiles", () => {
    expect(withLiveProfileFilter({ where: { profileId: 3 } })).toEqual({
      where: { profileId: 3, profile: { deletedAt: null } },
    });
  });

  it("leaves an explicit profile relation filter alone", () => {
    const trash = { where: { profile: { deletedAt: { not: null } } } };
    expect(withLiveProfileFilter(trash)).toBe(trash);
  });

  it("applies to reads on profile-owned models only", () => {
    expect(shouldFilterViaProfile("AstroSnapshot", "findFirst")).toBe(true);
    expect(shouldFilterViaProfile("JournalEntry", "findMany")).toBe(true);
    expect(shouldFilterViaProfile("AstroSnapshot", "create")).toBe(false);
    expect(shouldFilterViaProfile("Profile", "findMany")).toBe(false);
    expect(shouldFilterViaProfile("Reading", "findUnique")).toBe(false);
  });
});

describe("withLiveFilter", () => {
  it("adds deletedAt: null to an existing where", () => {
    const args = { where: { id: 3 }, select: { id: true } };
    expect(withLiveFilter(args)).toEqual({
      where: { id: 3, deletedAt: null },
      select: { id: true },
    });
  });

  it("creates the where when the call had none", () => {
    expect(withLiveFilter({ orderBy: { createdAt: "asc" } })).toEqual({
      orderBy: { createdAt: "asc" },
      where: { deletedAt: null },
    });
    expect(withLiveFilter(undefined)).toEqual({ where: { deletedAt: null } });
  });

  it("leaves an explicit deletedAt filter alone (trash access)", () => {
    const trash = { where: { deletedAt: { not: null } } };
    expect(withLiveFilter(trash)).toBe(trash);
    const explicitLive = { where: { id: 1, deletedAt: null } };
    expect(withLiveFilter(explicitLive)).toBe(explicitLive);
  });

  it("never mutates the input", () => {
    const args = { where: { id: 9 } };
    withLiveFilter(args);
    expect(args).toEqual({ where: { id: 9 } });
  });
});

describe("shouldFilter", () => {
  it("covers reads, updates and deletes on the soft-delete models only", () => {
    expect(shouldFilter("Profile", "findMany")).toBe(true);
    expect(shouldFilter("JournalEntry", "deleteMany")).toBe(true);
    expect(shouldFilter("Profile", "create")).toBe(false);
    expect(shouldFilter("Profile", "upsert")).toBe(false);
    expect(shouldFilter("AstroSnapshot", "findMany")).toBe(false);
    expect(shouldFilter("Reading", "delete")).toBe(false);
  });
});
