// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCATION_KEY,
  loadHomeLocation,
  saveHomeLocation,
} from "./homeLocation";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const NYC = {
  label: "New York",
  lat: 40.7128,
  lng: -74.006,
  tzIana: "America/New_York",
};

describe("home location storage", () => {
  afterEach(() => store.clear());

  it("round-trips a saved location", () => {
    saveHomeLocation(NYC);
    expect(loadHomeLocation()).toEqual(NYC);
  });

  it("returns null when nothing is stored", () => {
    expect(loadHomeLocation()).toBeNull();
  });

  it("rejects malformed stored values", () => {
    store.set(LOCATION_KEY, JSON.stringify({ lat: "not-a-number" }));
    expect(loadHomeLocation()).toBeNull();
    store.set(LOCATION_KEY, "not json");
    expect(loadHomeLocation()).toBeNull();
  });

  it("keeps the historical storage key TodayDashboard used", () => {
    expect(LOCATION_KEY).toBe("today.homeLocation");
  });
});
