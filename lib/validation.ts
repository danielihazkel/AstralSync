import { z } from "zod";
import type { ProfileBirthData } from "./snapshots";

/**
 * Request validation for the profile API (Phase 1d). Pure — timezone
 * defaulting (lat/lng → IANA zone) is the caller's job so this module
 * stays free of lookups.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const profileInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    fullBirthName: z.string().trim().min(1).max(200).nullish(),
    nameScript: z.enum(["latin", "hebrew", "other"]).default("latin"),
    /** "YYYY-MM-DD" local calendar date. */
    birthDate: z.string().regex(DATE_RE, "expected YYYY-MM-DD"),
    /** "HH:MM" local wall-clock time; null/omitted ⇔ timeCertainty "unknown". */
    birthTime: z.string().regex(TIME_RE, "expected HH:MM").nullish(),
    timeCertainty: z.enum(["exact", "approx", "unknown"]),
    birthCityGeonameId: z.number().int().positive().nullish(),
    birthLat: z.number().min(-90).max(90),
    birthLng: z.number().min(-180).max(180),
    /** Defaults to timezoneFor(birthLat, birthLng) when omitted. */
    tzIana: z.string().min(1).max(64).optional(),
    utcOffsetMinutes: z.number().int().min(-16 * 60).max(16 * 60).optional(),
    offsetOverridden: z.boolean().default(false),
    houseSystem: z.enum(["placidus", "whole_sign", "equal"]).default("placidus"),
  })
  .superRefine((v, ctx) => {
    const [y, m, d] = v.birthDate.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "not a real calendar date",
      });
    }
    if ((v.timeCertainty === "unknown") !== (v.birthTime == null)) {
      ctx.addIssue({
        code: "custom",
        path: ["birthTime"],
        message: 'birthTime must be omitted exactly when timeCertainty is "unknown"',
      });
    }
    if (v.offsetOverridden && v.utcOffsetMinutes == null) {
      ctx.addIssue({
        code: "custom",
        path: ["utcOffsetMinutes"],
        message: "required when offsetOverridden is true",
      });
    }
    if (
      v.nameScript === "hebrew" &&
      v.fullBirthName &&
      !/[֐-׿]/.test(v.fullBirthName)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["fullBirthName"],
        message: "nameScript is hebrew but the name contains no Hebrew letters",
      });
    }
  });

export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Parsed input → the pure computation shape used by lib/snapshots.ts. */
export function toProfileBirthData(
  input: ProfileInput,
  tzIana: string,
): ProfileBirthData {
  const [year, month, day] = input.birthDate.split("-").map(Number);
  return {
    fullBirthName: input.fullBirthName ?? null,
    nameScript: input.nameScript,
    birthDate: { year, month, day },
    birthTime: input.birthTime
      ? {
          hour: Number(input.birthTime.slice(0, 2)),
          minute: Number(input.birthTime.slice(3, 5)),
        }
      : null,
    timeCertainty: input.timeCertainty,
    birthLat: input.birthLat,
    birthLng: input.birthLng,
    tzIana,
    overrideOffsetMinutes: input.offsetOverridden
      ? (input.utcOffsetMinutes as number)
      : null,
  };
}
