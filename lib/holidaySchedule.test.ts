import { describe, expect, it } from "vitest";
import { resolveIsraelSchedule, sanitizeHolidaySchedule } from "./holidaySchedule";

describe("holiday schedule", () => {
  it("falls back to auto for anything unrecognised", () => {
    expect(sanitizeHolidaySchedule("israel")).toBe("israel");
    expect(sanitizeHolidaySchedule("mars")).toBe("auto");
    expect(sanitizeHolidaySchedule(null)).toBe("auto");
  });

  it("honours a pinned choice whatever the zone", () => {
    expect(resolveIsraelSchedule("israel", "America/New_York", null)).toBe(true);
    expect(resolveIsraelSchedule("diaspora", "Asia/Jerusalem", null)).toBe(false);
  });

  it("on auto, follows the home location before the browser", () => {
    expect(resolveIsraelSchedule("auto", "Asia/Jerusalem", "Europe/London")).toBe(true);
    expect(resolveIsraelSchedule("auto", "Europe/London", "Asia/Jerusalem")).toBe(false);
    expect(resolveIsraelSchedule("auto", null, "Asia/Tel_Aviv")).toBe(true);
    expect(resolveIsraelSchedule("auto", null, null)).toBe(false);
  });
});
