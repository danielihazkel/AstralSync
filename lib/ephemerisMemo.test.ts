import { describe, expect, it } from "vitest";
import { memoizeByMs } from "./ephemerisMemo";

describe("memoizeByMs", () => {
  it("returns the underlying value and calls the function once per instant", () => {
    let calls = 0;
    const memo = memoizeByMs((t) => {
      calls++;
      return t.getTime() / 1000;
    });
    const a = new Date("2026-08-16T12:00:00.000Z");
    const b = new Date("2026-08-16T13:00:00.000Z");
    expect(memo(a)).toBe(a.getTime() / 1000);
    expect(memo(new Date(a.getTime()))).toBe(a.getTime() / 1000);
    expect(memo(b)).toBe(b.getTime() / 1000);
    expect(memo(a)).toBe(a.getTime() / 1000);
    expect(calls).toBe(2);
  });

  it("distinguishes instants a millisecond apart", () => {
    let calls = 0;
    const memo = memoizeByMs(() => ++calls);
    expect(memo(new Date(1000))).toBe(1);
    expect(memo(new Date(1001))).toBe(2);
    expect(memo(new Date(1000))).toBe(1);
  });
});
