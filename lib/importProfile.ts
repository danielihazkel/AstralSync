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

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "not a valid date string");

const jsonValue = z.unknown();

const profileSchema = z.object({
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
  houseSystem: z.enum(["placidus", "whole_sign", "equal"]),
  isSolarChart: z.boolean(),
  sunSign: z.string().max(12),
  moonSign: z.string().max(12),
  ascendant: z.string().max(12).nullish(),
  placementsJson: jsonValue,
  aspectsJson: jsonValue,
  engine: z.string().max(32),
  engineVersion: z.string().max(16),
  contentVersion: z.string().max(16),
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

const readingSchema = z.object({
  astroSnapshotId: z.number().int(),
  numeroSnapshotId: z.number().int().nullish(),
  bodyMd: z.string(),
  generator: z.enum(["template", "llm", "hebrew_llm"]),
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
    data.readings.forEach((r, i) => {
      if (!astroIds.has(r.astroSnapshotId)) {
        ctx.addIssue({
          code: "custom",
          path: ["readings", i, "astroSnapshotId"],
          message: `no astro snapshot with id ${r.astroSnapshotId}`,
        });
      }
      if (r.numeroSnapshotId != null && !numeroIds.has(r.numeroSnapshotId)) {
        ctx.addIssue({
          code: "custom",
          path: ["readings", i, "numeroSnapshotId"],
          message: `no numero snapshot with id ${r.numeroSnapshotId}`,
        });
      }
    });
  });

export type ProfileExport = z.infer<typeof profileExportSchema>;

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

const asJson = (v: unknown) => (v ?? Prisma.JsonNull) as Prisma.InputJsonValue;

/**
 * Create the profile and all its rows from a validated export. Always a new
 * profile id; importing the same file twice yields two profiles.
 * Returns the new profile id.
 */
export async function importProfile(data: ProfileExport): Promise<number> {
  // City resolution outside the transaction: keep the FK when the GeoNames
  // row exists locally, recreate it from the export's canonical copy when it
  // doesn't, otherwise drop the FK — coordinates and tz live on the profile.
  let birthCityGeonameId: number | null = data.profile.birthCityGeonameId ?? null;
  if (birthCityGeonameId !== null) {
    const existing = await prisma.geoCity.findUnique({
      where: { geonameId: birthCityGeonameId },
      select: { geonameId: true },
    });
    if (!existing) {
      const city = data.birthCity;
      if (city && city.geonameId === birthCityGeonameId) {
        await prisma.geoCity.create({
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

  return prisma.$transaction(async (tx) => {
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

    return profile.id;
  });
}
