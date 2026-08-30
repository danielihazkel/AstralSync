import { describe, expect, it } from "vitest";
import { ZR_SIGN_YEARS, zodiacalReleasing } from "../src";

const DAY_MS = 86_400_000;
const YEAR_MS = 360 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

const birth = new Date(Date.UTC(1990, 0, 1));

describe("zodiacalReleasing", () => {
  it("starts L1 at the lot sign and walks the zodiac at 360-day years", () => {
    // Fortune in Capricorn: Cap 27y, Aqu 30y, Pis 12y…
    const at = new Date(birth.getTime() + 28 * YEAR_MS); // inside Aquarius
    const zr = zodiacalReleasing("capricorn", birth, at);
    expect(zr.l1[0]).toMatchObject({
      sign: "capricorn",
      lord: "saturn",
      startUtc: birth.toISOString(),
      angular: "1st",
      loosedBond: false,
    });
    expect(Date.parse(zr.l1[0].endUtc) - birth.getTime()).toBe(27 * YEAR_MS);
    expect(zr.current!.l1.sign).toBe("aquarius");
    expect(zr.l1).toHaveLength(2);
  });

  it("subdivides L2 in 30-day months starting from the L1 sign", () => {
    const at = new Date(birth.getTime() + 1 * YEAR_MS);
    const zr = zodiacalReleasing("capricorn", birth, at);
    expect(zr.l2[0].sign).toBe("capricorn");
    expect(Date.parse(zr.l2[0].endUtc) - Date.parse(zr.l2[0].startUtc)).toBe(
      27 * MONTH_MS,
    );
    expect(zr.l2[1].sign).toBe("aquarius");
    // 360 days into a Cap L1: month 12 of 27 → still the Capricorn L2.
    expect(zr.current!.l2.sign).toBe("capricorn");
  });

  it("looses the bond when the subdivision returns to its start", () => {
    // Aquarius L1 lasts 30y = 360 months; the 12-sign cycle is 211 months,
    // so the sequence returns to Aquarius and must leap to Leo instead.
    const at = new Date(birth.getTime() + 28 * YEAR_MS); // in the Aqu L1
    const zr = zodiacalReleasing("capricorn", birth, at);
    const l2 = zr.l2;
    const cycleMonths = Object.values(ZR_SIGN_YEARS).reduce((a, b) => a + b, 0);
    expect(cycleMonths).toBe(211);
    // The 13th period (index 12) is the leap target: Leo, flagged.
    expect(l2[12].sign).toBe("leo");
    expect(l2[12].loosedBond).toBe(true);
    expect(
      Date.parse(l2[12].startUtc) - Date.parse(l2[0].startUtc),
    ).toBe(cycleMonths * MONTH_MS);
    // Later encounters with Aquarius pass through normally.
    const laterAqu = l2.slice(13).find((p) => p.sign === "aquarius");
    expect(laterAqu).toBeDefined();
    expect(laterAqu!.loosedBond).toBe(false);
    // Everything stays inside the L1 bounds.
    const l1 = zr.current!.l1;
    expect(l2[0].startUtc).toBe(l1.startUtc);
    expect(l2[l2.length - 1].endUtc).toBe(l1.endUtc);
  });

  it("marks angular periods from the lot, with the 10th as the peak sign", () => {
    const at = new Date(birth.getTime() + 1 * YEAR_MS);
    const zr = zodiacalReleasing("capricorn", birth, at);
    const bySign = new Map(zr.l2.map((p) => [p.sign, p.angular]));
    expect(bySign.get("capricorn")).toBe("1st");
    expect(bySign.get("aries")).toBe("4th");
    expect(bySign.get("cancer")).toBe("7th");
    expect(bySign.get("libra")).toBe("10th");
    expect(bySign.get("leo")).toBeNull();
  });

  it("is empty before birth", () => {
    const zr = zodiacalReleasing("aries", birth, new Date(birth.getTime() - 1));
    expect(zr.current).toBeNull();
    expect(zr.l1).toHaveLength(0);
  });
});
