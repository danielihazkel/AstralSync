import { describe, expect, it } from "vitest";
import {
  arcScale,
  decadeTicks,
  fractionAt,
  placeBands,
  personalYearBands,
  pinnacleBands,
  placeEvents,
  profectionBands,
  type ArcBand,
  type ArcEvent,
} from "./lifeArc";

const BIRTH = "1990-02-22T12:30:00.000Z";
const NOW = new Date("2026-09-20T00:00:00.000Z");

function event(id: number, eventDate: string): ArcEvent {
  return { id, title: `e${id}`, eventDate, precision: "day", category: "other" };
}

describe("arcScale", () => {
  it("runs from birth to now when every event is in the past", () => {
    const s = arcScale(BIRTH, [event(1, "2011-06-03")], NOW);
    expect(s.startMs).toBe(Date.parse(BIRTH));
    expect(s.endMs).toBeGreaterThan(NOW.getTime());
  });

  it("extends past a future-dated event rather than cropping it", () => {
    const s = arcScale(BIRTH, [event(1, "2040-01-01")], NOW);
    expect(s.endMs).toBeGreaterThan(Date.parse("2040-01-01T12:00:00Z"));
  });

  it("still has a usable window with no events at all", () => {
    const s = arcScale(BIRTH, [], NOW);
    expect(s.endMs).toBeGreaterThan(s.startMs);
  });
});

describe("fractionAt", () => {
  const s = arcScale(BIRTH, [], NOW);

  it("puts birth at 0 and clamps anything before it", () => {
    expect(fractionAt(s, s.startMs)).toBe(0);
    expect(fractionAt(s, s.startMs - 1e10)).toBe(0);
  });

  it("clamps past the end rather than overflowing", () => {
    expect(fractionAt(s, s.endMs + 1e10)).toBe(1);
  });

  it("is monotonic through the window", () => {
    const mid = (s.startMs + s.endMs) / 2;
    expect(fractionAt(s, mid)).toBeGreaterThan(0);
    expect(fractionAt(s, mid)).toBeLessThan(1);
  });

  it("does not divide by zero on a degenerate window", () => {
    expect(fractionAt({ startMs: 5, endMs: 5 }, 5)).toBe(0);
  });
});

describe("placeBands", () => {
  const s = arcScale(BIRTH, [], NOW);

  it("clips a band that outruns the window", () => {
    // The firdaria wheel is 75 years whether or not the person lived it.
    const band: ArcBand = {
      key: "saturn",
      startUtc: "2020-01-01T00:00:00.000Z",
      endUtc: "2090-01-01T00:00:00.000Z",
    };
    const [placed] = placeBands([band], s);
    expect(placed.x + placed.width).toBeCloseTo(1, 10);
  });

  it("drops a band that ended before birth", () => {
    expect(
      placeBands(
        [{ key: "x", startUtc: "1900-01-01T00:00:00.000Z", endUtc: "1950-01-01T00:00:00.000Z" }],
        s,
      ),
    ).toEqual([]);
  });

  it("drops a band starting after the window", () => {
    expect(
      placeBands(
        [{ key: "x", startUtc: "2200-01-01T00:00:00.000Z", endUtc: "2210-01-01T00:00:00.000Z" }],
        s,
      ),
    ).toEqual([]);
  });

  it("ignores unparseable bounds instead of producing NaN geometry", () => {
    expect(placeBands([{ key: "x", startUtc: "nope", endUtc: "also nope" }], s)).toEqual([]);
  });

  it("carries the releasing marks through to the placed band", () => {
    const [placed] = placeBands(
      [{
        key: "aquarius", lord: "saturn", peak: true, loosedBond: true,
        startUtc: "2005-01-01T00:00:00.000Z", endUtc: "2015-01-01T00:00:00.000Z",
      }],
      s,
    );
    expect(placed).toMatchObject({ peak: true, loosedBond: true, lord: "saturn" });
  });
});

describe("placeEvents", () => {
  const s = arcScale(BIRTH, [event(1, "2011-06-03")], NOW);

  it("places an event inside the window", () => {
    const [p] = placeEvents([event(1, "2011-06-03")], s);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(1);
  });

  it("drops an event before birth rather than pinning it at zero", () => {
    // Clamping would put a pin on a date the event does not have.
    expect(placeEvents([event(9, "1980-01-01")], s)).toEqual([]);
  });
});

describe("profectionBands", () => {
  const s = arcScale(BIRTH, [], NOW);
  const bands = profectionBands(BIRTH, s);

  it("starts in the 1st house at birth and cycles twelve", () => {
    expect(bands[0].key).toBe("1");
    expect(bands[11].key).toBe("12");
    expect(bands[12].key).toBe("1");
  });

  it("agrees with (age mod 12) + 1, the engine's own rule", () => {
    for (const age of [0, 5, 11, 12, 21, 36]) {
      expect(bands[age].key).toBe(String((age % 12) + 1));
    }
  });

  it("covers the window without gaps", () => {
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].startUtc).toBe(bands[i - 1].endUtc);
    }
  });

  it("stops once it passes the window rather than running to 120", () => {
    expect(bands.length).toBeLessThan(60);
  });
});

describe("pinnacleBands", () => {
  // 1990-02-22: month 2, day 22 (master, kept), year 1990 → 1; Life Path 7,
  // so the first pinnacle ends at 36 − 7 = 29.
  const birthDate = { year: 1990, month: 2, day: 22 };
  const s = arcScale(BIRTH, [], NOW);
  const bands = pinnacleBands(BIRTH, birthDate, s);

  it("keys each band by its pinnacle and carries its challenge", () => {
    // P1 2+22 = 24 → 6 with challenge |2−4| = 2; P2 22+1 = 23 → 5 with |4−1| = 3
    expect(bands.map((b) => [b.key, b.lord])).toEqual([
      ["6", "2"],
      ["5", "3"],
    ]);
  });

  it("turns at the birthday the age arithmetic names", () => {
    expect(bands[0].startUtc).toBe(BIRTH);
    expect(bands[0].endUtc).toBe("2019-02-22T12:30:00.000Z");
    expect(bands[1].startUtc).toBe(bands[0].endUtc);
  });

  it("drops the pinnacles that start after the window", () => {
    // The third would begin at 38, in 2028 — past NOW.
    expect(bands).toHaveLength(2);
  });
});

describe("personalYearBands", () => {
  const birthDate = { year: 1990, month: 2, day: 22 };
  const s = arcScale(BIRTH, [], NOW);
  const bands = personalYearBands(birthDate, s);

  it("runs calendar year to calendar year from the birth year", () => {
    expect(bands[0].startUtc).toBe("1990-01-01T00:00:00.000Z");
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].startUtc).toBe(bands[i - 1].endUtc);
    }
    // The last band holds the window's end (the arc runs a little past now).
    const last = bands.at(-1)!;
    expect(Date.parse(last.startUtc)).toBeLessThanOrEqual(s.endMs);
    expect(Date.parse(last.endUtc)).toBeGreaterThan(s.endMs);
  });

  it("keys each year by its personal-year number", () => {
    // 2026: 2 + 22 + (2026 → 1) = 25 → 7
    expect(bands.find((b) => b.startUtc.startsWith("2026"))!.key).toBe("7");
  });
});

describe("decadeTicks", () => {
  it("marks each decade of life inside the window", () => {
    const s = arcScale(BIRTH, [], NOW);
    const ticks = decadeTicks(BIRTH, s);
    expect(ticks.map((t) => t.age)).toEqual([10, 20, 30]);
    expect(ticks.every((t) => t.x > 0 && t.x < 1)).toBe(true);
  });
});
