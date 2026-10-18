import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";

/**
 * Restore a profile from an export file (the exportProfile shape): profile
 * row, every snapshot version, and readings, recreated verbatim under a new
 * profile id. This is a restore, not re-entry — snapshot JSON is stored as
 * exported with no recompute or content re-validation, and the schema is
 * deliberately independent of profileInputSchema (whose normalizing rules
 * would reject legacy rows the database legitimately holds, e.g.
 * nameScript "hebrew"). Only create operations are used, so the write-once
 * guard in lib/db.ts is untouched.
 */

/**
 * Current export-file format version, stamped by exportProfile /
 * exportAllProfiles and required by the schemas below.
 *
 * Forward compatibility has exactly one home: upgradeExport(). Today every
 * accepted file is already current, so it is a pass-through — but when the
 * format does change, the choice is "upgrade the old shape here" rather than
 * "orphan every export file a user has on disk", and this is where that
 * upgrade goes. Fields have so far only ever been *added*, which zod's
 * nullish defaults absorb without a version bump at all; bump only on a
 * change that an old file cannot satisfy.
 */
export const EXPORT_VERSION = 1;

/** Raised when a file is too new (or too old) to be understood at all. */
export class UnsupportedExportVersion extends Error {
  constructor(readonly found: unknown) {
    super(`unsupported export version: ${String(found)}`);
    this.name = "UnsupportedExportVersion";
  }
}

/**
 * Bring an export file up to EXPORT_VERSION, or reject it. Call before
 * parsing; the schemas assume the current shape.
 */
export function upgradeExport(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const found = (body as { exportVersion?: unknown }).exportVersion;
  // Absent version: pre-versioning file, treated as v1 (the schemas will
  // reject it if it is something else entirely).
  if (found === undefined || found === EXPORT_VERSION) return body;
  throw new UnsupportedExportVersion(found);
}

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "not a valid date string");

const jsonValue = z.unknown();

export const profileSchema = z.object({
  // The exported id. Never written (rows are recreated under fresh ids) —
  // it exists so a bundle can remap relationship endpoints onto the new
  // rows. Optional: single-profile imports and older bundles may lack it.
  id: z.number().int().optional(),
  displayName: z.string().min(1).max(100),
  fullBirthName: z.string().max(200).nullish(),
  hebrewBirthName: z.string().max(200).nullish(),
  nameScript: z.enum(["latin", "hebrew", "other"]).default("latin"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish(),
  timeCertainty: z.enum(["exact", "approx", "unknown"]),
  birthCityGeonameId: z.number().int().nullish(),
  birthLat: z.number().min(-90).max(90),
  birthLng: z.number().min(-180).max(180),
  tzIana: z.string().min(1).max(64),
  utcOffsetMinutes: z.number().int(),
  offsetOverridden: z.boolean().default(false),
  // Installation-level metadata, exported since Batch P. Nullish so
  // pre-tags exports still validate.
  tagsJson: z.array(z.string()).nullish(),
  createdAt: isoDate,
});

const birthCitySchema = z.object({
  geonameId: z.number().int(),
  name: z.string().max(200),
  asciiName: z.string().max(200),
  countryCode: z.string().max(2),
  admin1: z.string().max(20).nullish(),
  lat: z.number(),
  lng: z.number(),
  population: z.number().int(),
});

const astroSnapshotSchema = z.object({
  id: z.number().int(),
  version: z.number().int().positive(),
  houseSystem: z.enum([
    "placidus",
    "whole_sign",
    "equal",
    "porphyry",
    "koch",
    "regiomontanus",
    "campanus",
    "alcabitius",
  ]),
  isSolarChart: z.boolean(),
  sunSign: z.string().max(12),
  moonSign: z.string().max(12),
  ascendant: z.string().max(12).nullish(),
  placementsJson: jsonValue,
  aspectsJson: jsonValue,
  engine: z.string().max(32),
  engineVersion: z.string().max(16),
  contentVersion: z.string().max(16),
  /** Version-change note; absent in pre-feature exports. */
  note: z.string().max(400).nullish(),
  createdAt: isoDate,
});

const numeroSnapshotSchema = z.object({
  id: z.number().int(),
  version: z.number().int().positive(),
  system: z.enum(["pythagorean", "gematria"]),
  lifePathInt: z.number().int(),
  destinyInt: z.number().int().nullish(),
  soulUrgeInt: z.number().int().nullish(),
  isMasterLp: z.boolean(),
  derivationJson: jsonValue,
  createdAt: isoDate,
});

const hebrewSnapshotSchema = z.object({
  version: z.number().int().positive(),
  hebrewDate: z.string().max(40),
  monthKey: z.string().max(12),
  dayPlanet: z.string().max(12),
  hourPlanet: z.string().max(12).nullish(),
  dateGematriaInt: z.number().int(),
  mazalJson: jsonValue,
  gematriaJson: jsonValue,
  engine: z.string().max(32),
  engineVersion: z.string().max(16),
  contentVersion: z.string().max(16),
  createdAt: isoDate,
});

// Every exported field travels. mood/tags/sky are nullish so exports written
// before those columns existed still validate. skyJson stays an unvalidated
// passthrough on purpose: this is a restore, not re-entry (see the module
// header), and deep-validating EntrySky would reject rows a previous engine
// version legitimately wrote.
export const journalEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bodyMd: z.string().min(1).max(10_000),
  mood: z
    .enum(["very_low", "low", "neutral", "high", "very_high"])
    .nullish(),
  tagsJson: z.array(z.string()).nullish(),
  skyJson: jsonValue.nullish(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

// Enums are literal copies of prisma/schema.prisma — the module's idiom.
export const lifeEventSchema = z.object({
  title: z.string().min(1).max(120),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  precision: z.enum(["day", "month", "year"]).default("day"),
  category: z.enum([
    "marriage",
    "child",
    "career",
    "relocation",
    "loss",
    "health",
    "education",
    "other",
  ]),
  notesMd: z.string().max(5_000).nullish(),
  // Same passthrough stance as the journal's skyJson: a restore, not
  // re-entry, so an older engine's shape is not re-validated.
  skyJson: jsonValue.nullish(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const readingSchema = z.object({
  astroSnapshotId: z.number().int(),
  numeroSnapshotId: z.number().int().nullish(),
  bodyMd: z.string(),
  generator: z.enum(["template", "llm", "hebrew_llm", "life_story"]),
  modelName: z.string().max(64).nullish(),
  contentVersion: z.string().max(16).nullish(),
  createdAt: isoDate,
});

// The AI-text tables (round 7): additive, so files written before them still
// validate through the defaults below.
export const forecastSchema = z.object({
  mode: z.enum(["western", "hebrew"]),
  kind: z.enum(["day", "week", "month"]),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  natalVersion: z.number().int().positive(),
  bodyMd: z.string(),
  modelName: z.string().max(64).nullish(),
  contentVersion: z.string().max(16).nullish(),
  createdAt: isoDate,
});

export const archivedReadingSchema = readingSchema.extend({
  discardedAt: isoDate,
});

export const synastryReadingSchema = z.object({
  profileAId: z.number().int(),
  profileBId: z.number().int(),
  aVersion: z.number().int().positive(),
  bVersion: z.number().int().positive(),
  bodyMd: z.string(),
  modelName: z.string().max(64).nullish(),
  contentVersion: z.string().max(16).nullish(),
  createdAt: isoDate,
});

function duplicateVersion(rows: { version: number }[]): number | null {
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.version)) return r.version;
    seen.add(r.version);
  }
  return null;
}

export const profileExportSchema = z
  .object({
    exportVersion: z.literal(1),
    profile: profileSchema,
    birthCity: birthCitySchema.nullish(),
    astroSnapshots: z.array(astroSnapshotSchema).min(1),
    numeroSnapshots: z.array(numeroSnapshotSchema).min(1),
    // Absent in pre-Mazal exports; sparse for pre-feature versions.
    hebrewSnapshots: z.array(hebrewSnapshotSchema).default([]),
    readings: z.array(readingSchema).default([]),
    // Absent in pre-journal exports (Phase 3g).
    journalEntries: z.array(journalEntrySchema).default([]),
    // Absent in pre-life-events exports.
    lifeEvents: z.array(lifeEventSchema).default([]),
    // Absent before round 7.
    forecasts: z.array(forecastSchema).default([]),
    readingArchive: z.array(archivedReadingSchema).default([]),
  })
  .superRefine((data, ctx) => {
    for (const [path, rows] of [
      ["astroSnapshots", data.astroSnapshots],
      ["numeroSnapshots", data.numeroSnapshots],
      ["hebrewSnapshots", data.hebrewSnapshots],
    ] as const) {
      const dup = duplicateVersion(rows);
      if (dup !== null) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: `duplicate snapshot version ${dup}`,
        });
      }
    }
    const astroIds = new Set(data.astroSnapshots.map((s) => s.id));
    const numeroIds = new Set(data.numeroSnapshots.map((s) => s.id));
    for (const [path, rows] of [
      ["readings", data.readings],
      ["readingArchive", data.readingArchive],
    ] as const) {
      rows.forEach((r, i) => {
        if (!astroIds.has(r.astroSnapshotId)) {
          ctx.addIssue({
            code: "custom",
            path: [path, i, "astroSnapshotId"],
            message: `no astro snapshot with id ${r.astroSnapshotId}`,
          });
        }
        if (r.numeroSnapshotId != null && !numeroIds.has(r.numeroSnapshotId)) {
          ctx.addIssue({
            code: "custom",
            path: [path, i, "numeroSnapshotId"],
            message: `no numero snapshot with id ${r.numeroSnapshotId}`,
          });
        }
      });
    }
  });

export type ProfileExport = z.infer<typeof profileExportSchema>;

/** The Settings "Export all" shape: a list of single-profile exports plus,
 *  optionally, the browser settings bundle (applied client-side — the
 *  server never stores preferences). */
/** A saved pairing. Endpoints are the *exported* profile ids; the importer
 *  remaps them onto the newly created rows (remapRelationshipRows). */
export const relationshipSchema = z.object({
  aId: z.number().int(),
  bId: z.number().int(),
  kind: z.enum(["partner", "family", "friend", "colleague", "other"]),
  label: z.string().max(80).nullish(),
  note: z.string().max(400).nullish(),
  createdAt: isoDate,
});

export const profileBundleSchema = z.object({
  exportVersion: z.literal(1),
  bundle: z.literal(true),
  profiles: z.array(profileExportSchema).max(500),
  // Absent in pre-relationship bundles.
  relationships: z.array(relationshipSchema).default([]),
  // Absent before round 7.
  synastryReadings: z.array(synastryReadingSchema).default([]),
  settings: z.unknown().optional(),
});

export type ProfileBundle = z.infer<typeof profileBundleSchema>;

/** True when a parsed JSON body is the bundle shape (vs. one profile). */
export function isBundle(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { bundle?: unknown }).bundle === true
  );
}

/**
 * Remap saved relationships onto newly created profile ids.
 *
 * A pairing only means something when *both* endpoints made it into the
 * import, so a relationship whose partner was not in the bundle is dropped
 * rather than half-restored. The model's ordered-pair invariant (aId < bId)
 * is re-established after remapping, because new ids need not preserve the
 * old ordering. Self-pairs cannot survive a remap and are dropped too, and
 * a pair listed twice (a hand-edited file, or (a,b) beside (b,a)) keeps its
 * first row — the unique pair would otherwise fail the whole restore.
 */
export function remapRelationshipRows(
  relationships: z.infer<typeof relationshipSchema>[],
  profileIdMap: Map<number, number>,
) {
  const rows = [];
  const seen = new Set<string>();
  for (const r of relationships) {
    const a = profileIdMap.get(r.aId);
    const b = profileIdMap.get(r.bId);
    if (a === undefined || b === undefined || a === b) continue;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      aId: Math.min(a, b),
      bId: Math.max(a, b),
      kind: r.kind,
      label: r.label ?? null,
      note: r.note ?? null,
      createdAt: new Date(r.createdAt),
    });
  }
  return rows;
}

/** Remap the exported readings' snapshot FKs to the newly created ids. */
export function remapReadingRows(
  readings: ProfileExport["readings"],
  astroIdMap: Map<number, number>,
  numeroIdMap: Map<number, number>,
) {
  return readings.map((r) => {
    const astroSnapshotId = astroIdMap.get(r.astroSnapshotId);
    if (astroSnapshotId === undefined) {
      throw new Error(`unmapped astro snapshot id ${r.astroSnapshotId}`);
    }
    const numeroSnapshotId =
      r.numeroSnapshotId == null
        ? null
        : numeroIdMap.get(r.numeroSnapshotId);
    if (numeroSnapshotId === undefined) {
      throw new Error(`unmapped numero snapshot id ${r.numeroSnapshotId}`);
    }
    return {
      astroSnapshotId,
      numeroSnapshotId,
      bodyMd: r.bodyMd,
      generator: r.generator,
      modelName: r.modelName ?? null,
      contentVersion: r.contentVersion ?? null,
      createdAt: new Date(r.createdAt),
    };
  });
}

/** The Trash's archived readings, remapped like the live ones. */
export function remapArchivedReadingRows(
  archive: ProfileExport["readingArchive"],
  astroIdMap: Map<number, number>,
  numeroIdMap: Map<number, number>,
) {
  return remapReadingRows(archive, astroIdMap, numeroIdMap).map((r, i) => ({
    ...r,
    discardedAt: new Date(archive[i].discardedAt),
  }));
}

/**
 * Remap pair-level AI readings onto the imported (or, when skipped as
 * duplicates, the already-present) profile ids — the relationship rules: both
 * endpoints must be in the map, the pair is re-ordered to keep
 * profileAId < profileBId (carrying each side's version with it), and the
 * first row of a pair wins.
 */
export function remapSynastryReadingRows(
  readings: z.infer<typeof synastryReadingSchema>[],
  profileIdMap: Map<number, number>,
) {
  const rows = [];
  const seen = new Set<string>();
  for (const r of readings) {
    const a = profileIdMap.get(r.profileAId);
    const b = profileIdMap.get(r.profileBId);
    if (a === undefined || b === undefined || a === b) continue;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const swap = a > b;
    rows.push({
      profileAId: swap ? b : a,
      profileBId: swap ? a : b,
      aVersion: swap ? r.bVersion : r.aVersion,
      bVersion: swap ? r.aVersion : r.bVersion,
      bodyMd: r.bodyMd,
      modelName: r.modelName ?? null,
      contentVersion: r.contentVersion ?? null,
      createdAt: new Date(r.createdAt),
    });
  }
  return rows;
}

/**
 * What makes an imported profile "already here": the same name and birth
 * data (date, time, place to ~10 m). Only the chart's identity counts —
 * tags, notes and readings may differ between two copies of one person.
 */
export function importFingerprint(p: {
  displayName: string;
  birthDate: string;
  birthTime?: string | null;
  birthLat: number;
  birthLng: number;
}): string {
  return [
    p.displayName.trim().toLowerCase(),
    p.birthDate,
    p.birthTime ?? "",
    p.birthLat.toFixed(4),
    p.birthLng.toFixed(4),
  ].join("|");
}

export interface ExistingMatch {
  /** Index of the profile in the file (0 for a single-profile export). */
  index: number;
  existingId: number;
  displayName: string;
}

/** Live profiles that an import would duplicate, by file index. */
export async function findExistingProfiles(
  exports: Pick<ProfileExport, "profile">[],
): Promise<ExistingMatch[]> {
  if (exports.length === 0) return [];
  const dates = [...new Set(exports.map((e) => e.profile.birthDate))];
  const candidates = await prisma.profile.findMany({
    where: {
      birthDate: {
        in: dates.map((d) => {
          const [y, m, day] = d.split("-").map(Number);
          return new Date(Date.UTC(y, m - 1, day));
        }),
      },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      displayName: true,
      birthDate: true,
      birthTime: true,
      birthLat: true,
      birthLng: true,
    },
  });
  const byPrint = new Map<string, { id: number; displayName: string }>();
  for (const c of candidates) {
    const print = importFingerprint({
      ...c,
      birthDate: c.birthDate.toISOString().slice(0, 10),
    });
    if (!byPrint.has(print)) byPrint.set(print, c);
  }
  const matches: ExistingMatch[] = [];
  exports.forEach((e, index) => {
    const hit = byPrint.get(importFingerprint(e.profile));
    if (hit) matches.push({ index, existingId: hit.id, displayName: hit.displayName });
  });
  return matches;
}

const asJson = (v: unknown) => (v ?? Prisma.JsonNull) as Prisma.InputJsonValue;

/** Prisma transaction client — what $transaction hands its callback. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Restore one profile inside a caller-supplied transaction, so a bundle can
 * restore every profile (and their relationships) atomically instead of
 * leaving a half-imported installation behind when row 7 of 20 fails.
 * Always a new profile id — the caller decides about duplicates first
 * (findExistingProfiles). Returns the new profile id.
 */
export async function importProfileInTx(
  tx: Tx,
  data: ProfileExport,
): Promise<number> {
  // City resolution, inside the transaction like every other write: keep
  // the FK when the GeoNames row exists locally, recreate it from the
  // export's canonical copy when it doesn't, otherwise drop the FK —
  // coordinates and tz live on the profile.
  let birthCityGeonameId: number | null = data.profile.birthCityGeonameId ?? null;
  if (birthCityGeonameId !== null) {
    const existing = await tx.geoCity.findUnique({
      where: { geonameId: birthCityGeonameId },
      select: { geonameId: true },
    });
    if (!existing) {
      const city = data.birthCity;
      if (city && city.geonameId === birthCityGeonameId) {
        await tx.geoCity.create({
          data: {
            geonameId: city.geonameId,
            name: city.name,
            asciiName: city.asciiName,
            countryCode: city.countryCode,
            admin1: city.admin1 ?? null,
            lat: city.lat,
            lng: city.lng,
            population: city.population,
          },
        });
      } else {
        birthCityGeonameId = null;
      }
    }
  }

  const [y, m, d] = data.profile.birthDate.split("-").map(Number);

  {
    const profile = await tx.profile.create({
      data: {
        displayName: data.profile.displayName,
        fullBirthName: data.profile.fullBirthName ?? null,
        hebrewBirthName: data.profile.hebrewBirthName ?? null,
        nameScript: data.profile.nameScript,
        // @db.Date column: UTC midnight, same as profileColumns().
        birthDate: new Date(Date.UTC(y, m - 1, d)),
        birthTime: data.profile.birthTime ?? null,
        timeCertainty: data.profile.timeCertainty,
        birthCityGeonameId,
        birthLat: data.profile.birthLat,
        birthLng: data.profile.birthLng,
        tzIana: data.profile.tzIana,
        utcOffsetMinutes: data.profile.utcOffsetMinutes,
        offsetOverridden: data.profile.offsetOverridden,
        tagsJson:
          data.profile.tagsJson && data.profile.tagsJson.length > 0
            ? (data.profile.tagsJson as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        createdAt: new Date(data.profile.createdAt),
      },
    });

    const astroIdMap = new Map<number, number>();
    for (const s of data.astroSnapshots) {
      const row = await tx.astroSnapshot.create({
        data: {
          profileId: profile.id,
          version: s.version,
          houseSystem: s.houseSystem,
          isSolarChart: s.isSolarChart,
          sunSign: s.sunSign,
          moonSign: s.moonSign,
          ascendant: s.ascendant ?? null,
          placementsJson: asJson(s.placementsJson),
          aspectsJson: asJson(s.aspectsJson),
          engine: s.engine,
          engineVersion: s.engineVersion,
          contentVersion: s.contentVersion,
          note: s.note ?? null,
          createdAt: new Date(s.createdAt),
        },
      });
      astroIdMap.set(s.id, row.id);
    }

    const numeroIdMap = new Map<number, number>();
    for (const s of data.numeroSnapshots) {
      const row = await tx.numeroSnapshot.create({
        data: {
          profileId: profile.id,
          version: s.version,
          system: s.system,
          lifePathInt: s.lifePathInt,
          destinyInt: s.destinyInt ?? null,
          soulUrgeInt: s.soulUrgeInt ?? null,
          isMasterLp: s.isMasterLp,
          derivationJson: asJson(s.derivationJson),
          createdAt: new Date(s.createdAt),
        },
      });
      numeroIdMap.set(s.id, row.id);
    }

    if (data.hebrewSnapshots.length > 0) {
      await tx.hebrewSnapshot.createMany({
        data: data.hebrewSnapshots.map((s) => ({
          profileId: profile.id,
          version: s.version,
          hebrewDate: s.hebrewDate,
          monthKey: s.monthKey,
          dayPlanet: s.dayPlanet,
          hourPlanet: s.hourPlanet ?? null,
          dateGematriaInt: s.dateGematriaInt,
          mazalJson: asJson(s.mazalJson),
          gematriaJson: asJson(s.gematriaJson),
          engine: s.engine,
          engineVersion: s.engineVersion,
          contentVersion: s.contentVersion,
          createdAt: new Date(s.createdAt),
        })),
      });
    }

    const readingRows = remapReadingRows(data.readings, astroIdMap, numeroIdMap);
    for (const r of readingRows) {
      await tx.reading.create({ data: r });
    }
    const archiveRows = remapArchivedReadingRows(
      data.readingArchive,
      astroIdMap,
      numeroIdMap,
    );
    if (archiveRows.length > 0) {
      await tx.readingArchive.createMany({ data: archiveRows });
    }

    if (data.forecasts.length > 0) {
      await tx.forecast.createMany({
        data: data.forecasts.map((f) => {
          const [fy, fm, fd] = f.periodStart.split("-").map(Number);
          return {
            profileId: profile.id,
            mode: f.mode,
            kind: f.kind,
            // @db.Date column: UTC midnight, same as birthDate above.
            periodStart: new Date(Date.UTC(fy, fm - 1, fd)),
            natalVersion: f.natalVersion,
            bodyMd: f.bodyMd,
            modelName: f.modelName ?? null,
            contentVersion: f.contentVersion ?? null,
            createdAt: new Date(f.createdAt),
          };
        }),
        // A hand-edited file listing one period twice keeps the first.
        skipDuplicates: true,
      });
    }

    if (data.journalEntries.length > 0) {
      await tx.journalEntry.createMany({
        data: data.journalEntries.map((e) => {
          const [ey, em, ed] = e.entryDate.split("-").map(Number);
          return {
            profileId: profile.id,
            // @db.Date column: UTC midnight, same as birthDate above.
            entryDate: new Date(Date.UTC(ey, em - 1, ed)),
            bodyMd: e.bodyMd,
            mood: e.mood ?? null,
            // The lib/journal.ts DbNull idiom: an absent JSON column is
            // DbNull, never JSON null.
            tagsJson:
              e.tagsJson && e.tagsJson.length > 0
                ? (e.tagsJson as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            skyJson:
              e.skyJson === null || e.skyJson === undefined
                ? Prisma.DbNull
                : (e.skyJson as Prisma.InputJsonValue),
            createdAt: new Date(e.createdAt),
            updatedAt: new Date(e.updatedAt),
          };
        }),
      });
    }

    if (data.lifeEvents.length > 0) {
      await tx.lifeEvent.createMany({
        data: data.lifeEvents.map((e) => {
          const [ey, em, ed] = e.eventDate.split("-").map(Number);
          return {
            profileId: profile.id,
            title: e.title,
            // @db.Date column: UTC midnight, same as birthDate above.
            eventDate: new Date(Date.UTC(ey, em - 1, ed)),
            precision: e.precision,
            category: e.category,
            notesMd: e.notesMd ?? null,
            skyJson:
              e.skyJson === null || e.skyJson === undefined
                ? Prisma.DbNull
                : (e.skyJson as Prisma.InputJsonValue),
            createdAt: new Date(e.createdAt),
            updatedAt: new Date(e.updatedAt),
          };
        }),
      });
    }

    return profile.id;
  }
}

/** Restore a single profile in its own transaction (the one-file import). */
export async function importProfile(data: ProfileExport): Promise<number> {
  return prisma.$transaction((tx) => importProfileInTx(tx, data));
}

/**
 * Restore a whole bundle atomically: every profile, saved relationship and
 * pair reading, or nothing. `skip` maps a file index to a profile that is
 * already here (findExistingProfiles): that profile is not created again,
 * but its pairings still land on the existing row — unless the pair already
 * has one. Returns the new ids in the bundle's own order.
 */
export async function importBundle(
  bundle: Pick<ProfileBundle, "profiles" | "relationships" | "synastryReadings">,
  skip: Map<number, number> = new Map(),
): Promise<number[]> {
  return prisma.$transaction(async (tx) => {
    const ids: number[] = [];
    // Old exported id -> new (or existing) id, for the pair remaps.
    const profileIdMap = new Map<number, number>();
    for (const [index, p] of bundle.profiles.entries()) {
      const existing = skip.get(index);
      const id = existing ?? (await importProfileInTx(tx, p));
      if (existing === undefined) ids.push(id);
      // A bundle written before profile ids travelled simply has no
      // pairs to remap.
      if (p.profile.id !== undefined) profileIdMap.set(p.profile.id, id);
    }
    const relationships = remapRelationshipRows(bundle.relationships, profileIdMap);
    if (relationships.length > 0) {
      // A skipped profile's pair may already be saved here: keep that one.
      await tx.relationship.createMany({ data: relationships, skipDuplicates: true });
    }
    const readings = remapSynastryReadingRows(bundle.synastryReadings, profileIdMap);
    if (readings.length > 0) {
      await tx.synastryReading.createMany({ data: readings, skipDuplicates: true });
    }
    return ids;
  });
}
