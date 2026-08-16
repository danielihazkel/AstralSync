import { describe, expect, it } from "vitest";
import { LruMap } from "./lruCache";

describe("LruMap", () => {
  it("evicts the least-recently-used entry at capacity", () => {
    const lru = new LruMap<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("c", 3);
    expect(lru.get("a")).toBeUndefined();
    expect(lru.get("b")).toBe(2);
    expect(lru.get("c")).toBe(3);
    expect(lru.size).toBe(2);
  });

  it("treats reads as recency — a read entry survives the next eviction", () => {
    const lru = new LruMap<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.get("a");
    lru.set("c", 3);
    expect(lru.get("a")).toBe(1);
    expect(lru.get("b")).toBeUndefined();
  });

  it("overwrites in place without evicting", () => {
    const lru = new LruMap<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("a", 9);
    expect(lru.get("a")).toBe(9);
    expect(lru.get("b")).toBe(2);
    expect(lru.size).toBe(2);
  });

  it("rejects a capacity below one", () => {
    expect(() => new LruMap(0)).toThrow(/capacity/);
  });
});
