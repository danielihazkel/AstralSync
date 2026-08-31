import { describe, expect, it } from "vitest";
import {
  lifeEventCreateSchema,
  lifeEventUpdateSchema,
  profileInputSchema,
  toProfileBirthData,
  transitQuerySchema,
  trashActionSchema,
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

  it("coerces orb params from query strings and bounds them to 0–12", () => {
    const parsed = transitQuerySchema.parse({
      luminaryOrb: "5",
      defaultOrb: "3.5",
      minorOrb: "2",
      minors: "1",
    });
    expect(parsed.luminaryOrb).toBe(5);
    expect(parsed.defaultOrb).toBe(3.5);
    expect(parsed.minorOrb).toBe(2);
    expect(parsed.minors).toBe("1");
    expect(transitQuerySchema.safeParse({ luminaryOrb: "13" }).success).toBe(
      false,
    );
    expect(transitQuerySchema.safeParse({ defaultOrb: "-1" }).success).toBe(
      false,
    );
    expect(transitQuerySchema.safeParse({ minors: "yes" }).success).toBe(false);
  });
});

describe("lifeEventCreateSchema", () => {
  const valid = {
    title: "Moved abroad",
    eventDate: "2014-03-12",
    category: "relocation",
  };

  it("accepts a day-precision event and defaults precision", () => {
    const parsed = lifeEventCreateSchema.parse(valid);
    expect(parsed.precision).toBe("day");
    expect(parsed.title).toBe("Moved abroad");
  });

  it("requires canonical dates for month and year precision", () => {
    const ok = (v: object) => lifeEventCreateSchema.safeParse(v).success;
    expect(ok({ ...valid, precision: "month", eventDate: "2014-03-01" })).toBe(
      true,
    );
    expect(ok({ ...valid, precision: "month" })).toBe(false);
    expect(ok({ ...valid, precision: "year", eventDate: "2014-01-01" })).toBe(
      true,
    );
    expect(ok({ ...valid, precision: "year", eventDate: "2014-03-01" })).toBe(
      false,
    );
  });

  it("rejects impossible dates, empty titles, unknown categories", () => {
    const ok = (v: object) => lifeEventCreateSchema.safeParse(v).success;
    expect(ok({ ...valid, eventDate: "2014-02-30" })).toBe(false);
    expect(ok({ ...valid, title: "   " })).toBe(false);
    expect(ok({ ...valid, category: "misc" })).toBe(false);
  });

  it("trims and bounds the optional notes", () => {
    expect(
      lifeEventCreateSchema.parse({ ...valid, notesMd: "  note  " }).notesMd,
    ).toBe("note");
    expect(
      lifeEventCreateSchema.safeParse({
        ...valid,
        notesMd: "x".repeat(5_001),
      }).success,
    ).toBe(false);
  });
});

describe("lifeEventUpdateSchema", () => {
  it("rejects an empty patch", () => {
    expect(lifeEventUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("requires eventDate and precision together, canonical", () => {
    const ok = (v: object) => lifeEventUpdateSchema.safeParse(v).success;
    expect(ok({ eventDate: "2014-03-01" })).toBe(false);
    expect(ok({ precision: "month" })).toBe(false);
    expect(ok({ eventDate: "2014-03-01", precision: "month" })).toBe(true);
    expect(ok({ eventDate: "2014-03-12", precision: "month" })).toBe(false);
  });

  it("clears notes with null and accepts a lone title", () => {
    expect(lifeEventUpdateSchema.parse({ notesMd: null }).notesMd).toBeNull();
    expect(lifeEventUpdateSchema.safeParse({ title: "New title" }).success).toBe(
      true,
    );
  });
});

describe("trashActionSchema", () => {
  it("accepts the event kind and rejects unknown kinds", () => {
    expect(
      trashActionSchema.safeParse({ action: "restore", kind: "event", id: 3 })
        .success,
    ).toBe(true);
    expect(
      trashActionSchema.safeParse({ action: "purge", kind: "banana", id: 3 })
        .success,
    ).toBe(false);
  });
});
