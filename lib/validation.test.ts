import { describe, expect, it } from "vitest";
import {
  profileInputSchema,
  toProfileBirthData,
  transitQuerySchema,
} from "./validation";

const valid = {
  displayName: "Albert",
  fullBirthName: "Albert Einstein",
  birthDate: "1879-03-14",
  birthTime: "11:30",
  timeCertainty: "approx",
  birthLat: 48.4,
  birthLng: 9.98,
};

describe("profileInputSchema", () => {
  it("accepts a minimal valid input and applies defaults", () => {
    const p = profileInputSchema.parse(valid);
    expect(p.nameScript).toBe("latin");
    expect(p.houseSystem).toBe("placidus");
    expect(p.offsetOverridden).toBe(false);
  });

  it("requires birthTime to be absent exactly when time is unknown", () => {
    expect(
      profileInputSchema.safeParse({ ...valid, timeCertainty: "unknown" })
        .success,
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({ ...valid, birthTime: null }).success,
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({
        ...valid,
        birthTime: null,
        timeCertainty: "unknown",
      }).success,
    ).toBe(true);
  });

  it("accepts a manual-location payload (no geoname id, explicit zone)", () => {
    const p = profileInputSchema.parse({
      ...valid,
      birthCityGeonameId: null,
      tzIana: "Europe/Berlin",
    });
    expect(p.birthCityGeonameId).toBeNull();
    expect(p.tzIana).toBe("Europe/Berlin");
  });

  it("rejects a timezone the IANA database does not know", () => {
    const r = profileInputSchema.safeParse({ ...valid, tzIana: "Not/AZone" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["tzIana"]);
    }
  });

  it("requires an offset when offsetOverridden is set", () => {
    expect(
      profileInputSchema.safeParse({ ...valid, offsetOverridden: true })
        .success,
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({
        ...valid,
        offsetOverridden: true,
        utcOffsetMinutes: 53,
      }).success,
    ).toBe(true);
  });

  it("rejects impossible calendar dates and malformed times", () => {
    expect(
      profileInputSchema.safeParse({ ...valid, birthDate: "2001-02-30" })
        .success,
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({ ...valid, birthTime: "24:00" }).success,
    ).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(
      profileInputSchema.safeParse({ ...valid, birthLat: 91 }).success,
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({ ...valid, birthLng: -181 }).success,
    ).toBe(false);
  });

  it("rejects a hebrew nameScript with no Hebrew letters in the name", () => {
    expect(
      profileInputSchema.safeParse({ ...valid, nameScript: "hebrew" }).success,
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({
        ...valid,
        nameScript: "hebrew",
        fullBirthName: "דוד כהן",
      }).success,
    ).toBe(true);
  });

  it("normalizes legacy hebrew-script payloads into hebrewBirthName", () => {
    const p = profileInputSchema.parse({
      ...valid,
      nameScript: "hebrew",
      fullBirthName: "דוד כהן",
    });
    expect(p.fullBirthName).toBeNull();
    expect(p.hebrewBirthName).toBe("דוד כהן");
    expect(p.nameScript).toBe("latin");
  });

  it("accepts both name fields together, each in its own script", () => {
    const p = profileInputSchema.parse({
      ...valid,
      hebrewBirthName: "דוד כהן",
    });
    expect(p.fullBirthName).toBe("Albert Einstein");
    expect(p.hebrewBirthName).toBe("דוד כהן");
  });

  it("rejects a hebrewBirthName without Hebrew letters", () => {
    expect(
      profileInputSchema.safeParse({ ...valid, hebrewBirthName: "David" })
        .success,
    ).toBe(false);
  });
});

describe("toProfileBirthData", () => {
  it("parses date and time strings into numeric structs", () => {
    const d = toProfileBirthData(profileInputSchema.parse(valid), "Europe/Berlin");
    expect(d.birthDate).toEqual({ year: 1879, month: 3, day: 14 });
    expect(d.birthTime).toEqual({ hour: 11, minute: 30 });
    expect(d.tzIana).toBe("Europe/Berlin");
    expect(d.overrideOffsetMinutes).toBeNull();
  });

  it("carries an overridden offset through", () => {
    const d = toProfileBirthData(
      profileInputSchema.parse({
        ...valid,
        offsetOverridden: true,
        utcOffsetMinutes: 53,
      }),
      "Europe/Berlin",
    );
    expect(d.overrideOffsetMinutes).toBe(53);
  });

  it("carries the Hebrew name through", () => {
    const d = toProfileBirthData(
      profileInputSchema.parse({ ...valid, hebrewBirthName: "דוד כהן" }),
      "Europe/Berlin",
    );
    expect(d.hebrewBirthName).toBe("דוד כהן");
    expect(
      toProfileBirthData(profileInputSchema.parse(valid), "Europe/Berlin")
        .hebrewBirthName,
    ).toBeNull();
  });
});

describe("transitQuerySchema", () => {
  it("accepts an absent `at` and full ISO instants with Z or offset", () => {
    expect(transitQuerySchema.safeParse({}).success).toBe(true);
    expect(
      transitQuerySchema.safeParse({ at: "2026-08-11T12:00:00Z" }).success,
    ).toBe(true);
    expect(
      transitQuerySchema.safeParse({ at: "2026-08-11T12:00:00+03:00" }).success,
    ).toBe(true);
  });

  it("rejects non-ISO and date-only values", () => {
    expect(transitQuerySchema.safeParse({ at: "today" }).success).toBe(false);
    expect(transitQuerySchema.safeParse({ at: "2026-08-11" }).success).toBe(
      false,
    );
  });
});
