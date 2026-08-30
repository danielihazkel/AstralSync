import { z } from "zod";
import {
  JOURNAL_MOODS,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  normalizeTags,
} from "./journalMeta";
import type { AspectType, Planet } from "@astralsync/astro-core";
import type { ProfileBirthData } from "./snapshots";
import { isValidTimeZone } from "./tzValidate";

/**
 * Request validation for the profile API (Phase 1d). Pure — timezone
 * defaulting (lat/lng → IANA zone) is the caller's job so this module
 * stays free of lookups. (`isValidTimeZone` is a client-safe Intl probe,
 * not a lookup — it keeps a client-supplied zone from reaching offset
 * math. It must come from tzValidate, never tz, which loads geo-tz.)
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
    houseSystem: z
      .enum([
        "placidus",
        "whole_sign",
        "equal",
        "porphyry",
        "koch",
        "regiomontanus",
        "campanus",
        "alcabitius",
      ])
      .default("placidus"),
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
    if (v.tzIana !== undefined && !isValidTimeZone(v.tzIana)) {
      ctx.addIssue({
        code: "custom",
        path: ["tzIana"],
        message: "not a recognized IANA timezone",
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

/** PATCH /api/profiles/[id] body: installation-level flags that never touch
 *  the chart (no recompute, no new version). Only the primary flag so far. */
export const profilePatchSchema = z.object({
  isPrimary: z.boolean(),
});

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

/** POST /api/trash body: restore or purge one trashed item. */
export const trashActionSchema = z.object({
  action: z.enum(["restore", "purge"]),
  kind: z.enum(["profile", "journal", "reading"]),
  id: z.number().int().positive(),
});

export type TrashAction = z.infer<typeof trashActionSchema>;

/** Orb query param: degrees, clamped to the settings UI's 0–12 range. */
const orbParam = z.coerce.number().min(0).max(12);

/** GET /api/transits/[id] (and /api/cycles/[id]) query. `at` pins the
 *  computation instant — the Journal tab's "sky on date X" view (and a
 *  testing hook); defaults to now when absent. The orb params override
 *  DEFAULT_TRANSIT_ORBS for this read only (per-browser settings — nothing
 *  stored server-side); `minors=1` adds minor aspects. */
export const transitQuerySchema = z.object({
  at: z.iso.datetime({ offset: true }).optional(),
  luminaryOrb: orbParam.optional(),
  defaultOrb: orbParam.optional(),
  minorOrb: orbParam.optional(),
  minors: z.enum(["1", "0"]).optional(),
});

export type TransitQuery = z.infer<typeof transitQuerySchema>;

/** GET /api/cycles/[id] query: the transit query plus optional solar and
 *  lunar return relocations — each pair both coordinates or neither.
 *  Cycles-only; the transits route keeps the base schema. */
export const cyclesQuerySchema = transitQuerySchema
  .extend({
    srLat: z.coerce.number().min(-90).max(90).optional(),
    srLng: z.coerce.number().min(-180).max(180).optional(),
    lrLat: z.coerce.number().min(-90).max(90).optional(),
    lrLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((v) => (v.srLat === undefined) === (v.srLng === undefined), {
    message: "srLat and srLng must be provided together",
  })
  .refine((v) => (v.lrLat === undefined) === (v.lrLng === undefined), {
    message: "lrLat and lrLng must be provided together",
  });

export type CyclesQuery = z.infer<typeof cyclesQuerySchema>;

/** "YYYY-MM-DD" that is a real calendar date. */
const civilDateString = z
  .string()
  .regex(DATE_RE, "expected YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, "not a real calendar date");

/** The instant the entry's sky snapshot is computed for — the client sends
 *  its local noon of entryDate so the stored sky matches what the Journal
 *  tab shows. The wall-clock date inside the string must equal entryDate
 *  (the offset makes the local date the literal first ten characters). */
const journalAt = z.iso.datetime({ offset: true });

function atMatchesEntryDate(v: { at?: string; entryDate?: string }): boolean {
  if (!v.at || !v.entryDate) return true;
  return v.at.slice(0, 10) === v.entryDate;
}

const journalMood = z.enum(JOURNAL_MOODS);

/** Normalized tag list. Limits are checked after normalization and reject
 *  (400) rather than truncate — the user should see why input was refused,
 *  not silently lose tags. */
const journalTags = z
  .array(z.string().max(MAX_TAG_LENGTH * 2))
  .max(50)
  .transform(normalizeTags)
  .refine((t) => t.length <= MAX_TAGS, {
    message: `at most ${MAX_TAGS} tags`,
  })
  .refine((t) => t.every((s) => s.length <= MAX_TAG_LENGTH), {
    message: `tags must be at most ${MAX_TAG_LENGTH} characters`,
  });

/** POST /api/profiles/[id]/journal body. */
export const journalCreateSchema = z
  .object({
    entryDate: civilDateString,
    bodyMd: z.string().trim().min(1).max(10_000),
    at: journalAt.optional(),
    mood: journalMood.optional(),
    tags: journalTags.optional(),
  })
  .refine(atMatchesEntryDate, { message: "at must fall on entryDate" });

export type JournalCreateInput = z.infer<typeof journalCreateSchema>;

/** PUT /api/profiles/[id]/journal/[entryId] body — at least one field.
 *  `at` is only meaningful alongside an entryDate change. `mood: null`
 *  clears the mood; `tags: []` clears the tags (one clearing idiom per
 *  field type). */
export const journalUpdateSchema = z
  .object({
    entryDate: civilDateString.optional(),
    bodyMd: z.string().trim().min(1).max(10_000).optional(),
    at: journalAt.optional(),
    mood: journalMood.nullable().optional(),
    tags: journalTags.optional(),
  })
  .refine(
    (v) =>
      v.entryDate !== undefined ||
      v.bodyMd !== undefined ||
      v.mood !== undefined ||
      v.tags !== undefined,
    { message: "nothing to update" },
  )
  .refine(atMatchesEntryDate, { message: "at must fall on entryDate" });

export type JournalUpdateInput = z.infer<typeof journalUpdateSchema>;

/** GET /api/profiles/[id]/journal query — optional inclusive date range. */
export const journalListQuerySchema = z
  .object({
    from: civilDateString.optional(),
    to: civilDateString.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "from must not be after to",
  });

export type JournalListQuery = z.infer<typeof journalListQuerySchema>;

/** GET /api/transits/[id]/calendar query: an inclusive civil-date range,
 *  capped at 93 days (one quarter) — the scan cost is linear in the span —
 *  and kept inside ~1700–2200 where the ephemeris' Pluto model holds. */
export const transitCalendarQuerySchema = z
  .object({
    from: civilDateString,
    to: civilDateString,
    minors: z.enum(["1", "0"]).optional(),
  })
  .refine((v) => v.from <= v.to, { message: "from must not be after to" })
  .refine(
    (v) =>
      Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`) <=
      93 * 86_400_000,
    { message: "range must not exceed 93 days" },
  )
  .refine(
    (v) => v.from >= "1700-01-01" && v.to <= "2200-12-31",
    { message: "range must fall within 1700–2200" },
  );

export type TransitCalendarQuery = z.infer<typeof transitCalendarQuerySchema>;

/** GET /api/transits/[id]/graph query: the calendar range plus the orb
 *  params of the transit query (in-orb windows need orbs, unlike the exact
 *  hits of the calendar). */
export const transitGraphQuerySchema = z
  .object({
    from: civilDateString,
    to: civilDateString,
    minors: z.enum(["1", "0"]).optional(),
    luminaryOrb: orbParam.optional(),
    defaultOrb: orbParam.optional(),
    minorOrb: orbParam.optional(),
  })
  .refine((v) => v.from <= v.to, { message: "from must not be after to" })
  .refine(
    (v) =>
      Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`) <=
      93 * 86_400_000,
    { message: "range must not exceed 93 days" },
  )
  .refine(
    (v) => v.from >= "1700-01-01" && v.to <= "2200-12-31",
    { message: "range must fall within 1700–2200" },
  );

export type TransitGraphQuery = z.infer<typeof transitGraphQuerySchema>;

/** Literal copies of the astro-core vocabularies (this module is imported
 *  client-side, so no value imports of the ephemeris-bearing package); the
 *  `satisfies` clauses keep them honest against the real types. */
const SEARCH_PLANETS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const satisfies readonly Planet[];

const SEARCH_ASPECTS = [
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition",
  // Minors: a perfection search has no orb, so they are as well-defined as
  // majors; the UI offers them behind the minor-aspect opt-in.
  "semisextile",
  "semisquare",
  "quintile",
  "sesquiquadrate",
  "quincunx",
] as const satisfies readonly AspectType[];

/** GET /api/transits/[id]/search query: one (transiting planet, major
 *  or minor aspect, natal target) triple and how many exact hits to return. `from`
 *  pins the search start (defaults to now); the scan itself is clamped to
 *  the ephemeris' 1700–2200 validity window. */
export const transitSearchQuerySchema = z.object({
  planet: z.enum(SEARCH_PLANETS),
  target: z.enum([...SEARCH_PLANETS, "ascendant", "mc"] as const),
  aspect: z.enum(SEARCH_ASPECTS),
  count: z.coerce.number().int().min(1).max(10).default(5),
  from: z.iso.datetime({ offset: true }).optional(),
});

export type TransitSearchQuery = z.infer<typeof transitSearchQuerySchema>;

/** /api/profiles/[id]/forecast query/body: which forecast cell. `date` is a
 *  testing hook ("compute the period containing this civil date"), defaulting
 *  to server-local today; not exposed in the UI. */
export const forecastParamsSchema = z
  .object({
    mode: z.enum(["western", "hebrew"]),
    kind: z.enum(["day", "week", "month"]),
    date: z.string().regex(DATE_RE, "expected YYYY-MM-DD").optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.date) return;
    const [y, m, d] = v.date.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "not a real calendar date",
      });
    }
  });

export type ForecastParams = z.infer<typeof forecastParamsSchema>;

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

/** POST /api/profiles/[id]/chat body. History is client-held (nothing is
 *  persisted); the server clamps and re-validates it regardless. */
export const chatSchema = z.object({
  question: z.string().trim().min(1).max(1_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4_000),
      }),
    )
    .max(16)
    .default([]),
});

export type ChatInput = z.infer<typeof chatSchema>;

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
