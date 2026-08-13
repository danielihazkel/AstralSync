import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORB_SETTINGS,
  isDefaultOrbSettings,
  orbQuery,
  sanitizeOrbSettings,
} from "./orbSettings";

describe("sanitizeOrbSettings", () => {
  it("passes valid settings through", () => {
    const s = { luminary: 5, default: 4, minor: 1.5, includeMinors: true };
    expect(sanitizeOrbSettings(s)).toEqual(s);
  });

  it("clamps orbs to 0–12", () => {
    const s = sanitizeOrbSettings({ luminary: 99, default: -3, minor: 12.5 });
    expect(s.luminary).toBe(12);
    expect(s.default).toBe(0);
    expect(s.minor).toBe(12);
  });

  it("falls back per-field on junk", () => {
    expect(sanitizeOrbSettings(null)).toEqual(DEFAULT_ORB_SETTINGS);
    expect(sanitizeOrbSettings("garbage")).toEqual(DEFAULT_ORB_SETTINGS);
    expect(
      sanitizeOrbSettings({ luminary: "8", default: NaN, includeMinors: "yes" }),
    ).toEqual(DEFAULT_ORB_SETTINGS);
  });
});

describe("orbQuery", () => {
  it("is empty at defaults so default requests stay unchanged", () => {
    expect(orbQuery(DEFAULT_ORB_SETTINGS)).toBe("");
    expect(isDefaultOrbSettings(DEFAULT_ORB_SETTINGS)).toBe(true);
  });

  it("serializes custom settings including the minors flag", () => {
    const q = orbQuery({ luminary: 5, default: 3, minor: 2, includeMinors: true });
    expect(q).toContain("luminaryOrb=5");
    expect(q).toContain("defaultOrb=3");
    expect(q).toContain("minorOrb=2");
    expect(q).toContain("minors=1");
    expect(q.startsWith("?")).toBe(true);
  });

  it("omits the minors flag when off", () => {
    expect(orbQuery({ ...DEFAULT_ORB_SETTINGS, luminary: 6 })).not.toContain(
      "minors=",
    );
  });
});
