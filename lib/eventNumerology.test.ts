import { describe, expect, it } from "vitest";
import { eventNumerology } from "./eventNumerology";

// 1990-03-21: first pinnacle (6) ends on the 29th birthday, 2019-03-21.
const BIRTH = "1990-03-21";

describe("eventNumerology", () => {
  it("gives the calendar-year personal year at every precision", () => {
    for (const precision of ["day", "month", "year"] as const) {
      expect(
        eventNumerology(BIRTH, { eventDate: "2026-01-01", precision }).personalYear.value,
      ).toBe(7);
    }
  });

  it("names the pinnacle on either side of the birthday it turns on", () => {
    expect(
      eventNumerology(BIRTH, { eventDate: "2019-03-20", precision: "day" }).pinnacle?.index,
    ).toBe(1);
    expect(
      eventNumerology(BIRTH, { eventDate: "2019-03-21", precision: "day" }).pinnacle?.index,
    ).toBe(2);
  });

  it("withholds the pinnacle when the month or year straddles the change", () => {
    expect(
      eventNumerology(BIRTH, { eventDate: "2019-03-01", precision: "month" }).pinnacle,
    ).toBeNull();
    expect(
      eventNumerology(BIRTH, { eventDate: "2019-01-01", precision: "year" }).pinnacle,
    ).toBeNull();
    expect(
      eventNumerology(BIRTH, { eventDate: "2019-04-01", precision: "month" }).pinnacle?.index,
    ).toBe(2);
  });
});
