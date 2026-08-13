import { describe, expect, it } from "vitest";
import { createChatLimiter } from "./chatLimiter";

function fixedClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createChatLimiter", () => {
  it("allows up to the limit inside the window, then rejects", () => {
    const clock = fixedClock();
    const limiter = createChatLimiter({ limit: 3, windowMs: 1000, now: clock.now });
    expect(limiter.consume(1).allowed).toBe(true);
    expect(limiter.consume(1).allowed).toBe(true);
    expect(limiter.consume(1).allowed).toBe(true);
    const rejected = limiter.consume(1);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs).toBe(1000);
  });

  it("frees a slot when the oldest question ages out of the window", () => {
    const clock = fixedClock();
    const limiter = createChatLimiter({ limit: 2, windowMs: 1000, now: clock.now });
    limiter.consume(1);
    clock.advance(600);
    limiter.consume(1);
    expect(limiter.consume(1).allowed).toBe(false);
    clock.advance(500); // first question is now 1100ms old
    expect(limiter.consume(1).allowed).toBe(true);
    expect(limiter.consume(1).allowed).toBe(false);
  });

  it("reports how long until the window frees a slot", () => {
    const clock = fixedClock(10_000);
    const limiter = createChatLimiter({ limit: 1, windowMs: 1000, now: clock.now });
    limiter.consume(1);
    clock.advance(250);
    expect(limiter.consume(1).retryAfterMs).toBe(750);
  });

  it("tracks profiles independently", () => {
    const clock = fixedClock();
    const limiter = createChatLimiter({ limit: 1, windowMs: 1000, now: clock.now });
    expect(limiter.consume(1).allowed).toBe(true);
    expect(limiter.consume(2).allowed).toBe(true);
    expect(limiter.consume(1).allowed).toBe(false);
  });

  it("survives a fully expired window without leaking state", () => {
    const clock = fixedClock();
    const limiter = createChatLimiter({ limit: 1, windowMs: 1000, now: clock.now });
    limiter.consume(1);
    limiter.consume(2);
    clock.advance(2000);
    // Both windows expired; both profiles start fresh.
    expect(limiter.consume(1).allowed).toBe(true);
    expect(limiter.consume(2).allowed).toBe(true);
  });
});
