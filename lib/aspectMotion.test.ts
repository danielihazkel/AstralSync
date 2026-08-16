import { describe, expect, it } from "vitest";
import { buildAspectMotion, motionKey } from "./aspectMotion";

describe("buildAspectMotion", () => {
  it("keys each row and reports applying vs separating", () => {
    const motion = buildAspectMotion(
      [
        { a: "moon", b: "saturn", type: "square", angle: 90 },
        { a: "sun", b: "mars", type: "trine", angle: 120 },
      ],
      { moon: 85, saturn: 0, sun: 125, mars: 0 },
      { moon: 13, saturn: 0.05, sun: 1, mars: 0.5 },
    );
    // Moon at 85° closing on the square to Saturn at 0°.
    expect(motion[motionKey("moon", "saturn", "square")]).toBe(true);
    // Sun already past the trine and pulling ahead of Mars.
    expect(motion[motionKey("sun", "mars", "trine")]).toBe(false);
  });

  it("skips rows whose bodies lack a longitude or speed", () => {
    const motion = buildAspectMotion(
      [{ a: "sun", b: "pluto", type: "square", angle: 90 }],
      { sun: 85 },
      { sun: 1 },
    );
    expect(motion).toEqual({});
  });
});
