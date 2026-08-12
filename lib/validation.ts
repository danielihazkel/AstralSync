import { z } from "zod";
import type { ProfileBirthData } from "./snapshots";

/**
 * Request validation for the profile API (Phase 1d). Pure — timezone
 * defaulting (lat/lng → IANA zone) is the caller's job so this module
 * stays free of lookups.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Field-level schema without cross-field rules — exported so the onboarding
 * wizard can validate individual steps client-side. The full cross-field
 * validation lives in `profileInputSchema` below.
 */
export const profileInputBase = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    /** Latin/transliterated name — Pythagorean numerology. */
    fullBirthName: z.string().trim().min(1).max(200).nullish(),
    /** Hebrew name — gematria destiny + mispar-katan Mazal reading. May
     *  coexist with fullBirthName; either may be null. */
    hebrewBirthName: z.string().trim().min(1).max(200).nullish(),
    /** Vestigial: the UI only sends "latin" since the two-field name split;
     *  "hebrew" is accepted for legacy payloads and normalized below. */
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
  });

export const profileInputSchema = profileInputBase
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
    // Pythagorean numerology needs Latin letters (numero-core throws
    // otherwise) — non-Latin names must go through the transliteration path.
    if (
      v.nameScript !== "hebrew" &&
      v.fullBirthName &&
      !/[A-Za-z]/.test(v.fullBirthName)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["fullBirthName"],
        message:
          "name contains no Latin letters — provide a Latin transliteration for Pythagorean numerology",
      });
    }
    if (v.hebrewBirthName && !/[֐-׿]/.test(v.hebrewBirthName)) {
      ctx.addIssue({
        code: "custom",
        path: ["hebrewBirthName"],
        message: "hebrewBirthName must contain Hebrew letters",
      });
    }
  })
  // Legacy payload normalization: before the two-field split, a Hebrew name
  // arrived as fullBirthName + nameScript "hebrew". Route it to the dedicated
  // column so downstream code holds a single invariant — Hebrew lives only in
  // hebrewBirthName, and fullBirthName is always Latin-compatible.
  .transform((v) =>
    v.nameScript === "hebrew" && v.fullBirthName
      ? {
          ...v,
          hebrewBirthName: v.hebrewBirthName ?? v.fullBirthName,
          fullBirthName: null,
          nameScript: "latin" as const,
        }
      : v,
  );

export type ProfileInput = z.infer<typeof profileInputSchema>;

/** GET /api/transits/[id] query. `at` is a testing hook (fixed-instant
 *  transits), not exposed in the UI; defaults to now when absent. */
export const transitQuerySchema = z.object({
  at: z.iso.datetime({ offset: true }).optional(),
});

export type TransitQuery = z.infer<typeof transitQuerySchema>;

/** /synastry?a=<id>&b=<id> query — two distinct profile ids. */
export const synastryQuerySchema = z
  .object({
    a: z.coerce.number().int().positive(),
    b: z.coerce.number().int().positive(),
  })
  .refine((v) => v.a !== v.b, {
    message: "synastry needs two different profiles",
  });

export type SynastryQuery = z.infer<typeof synastryQuerySchema>;

/** Parsed input → the pure computation shape used by lib/snapshots.ts. */
export function toProfileBirthData(
  input: ProfileInput,
  tzIana: string,
): ProfileBirthData {
  const [year, month, day] = input.birthDate.split("-").map(Number);
  return {
    fullBirthName: input.fullBirthName ?? null,
    hebrewBirthName: input.hebrewBirthName ?? null,
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
