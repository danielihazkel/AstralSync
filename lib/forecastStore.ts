import type { Aspect } from "@astralsync/astro-core";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { CivilDate, ForecastKind, ForecastMode } from "./forecast";
import type { StoredChart, WheelChart } from "./view-types";

/**
 * Prisma glue for AI period forecasts — the impure half of lib/forecast.ts,
 * mirroring the computeTransits/getTransitView split. One row per
 * (profile, mode, kind, periodStart); the unique key is the cost control:
 * a period is generated at most once until explicitly discarded.
 */

export interface StoredForecast {
  bodyMd: string;
  modelName: string | null;
  contentVersion: string | null;
  createdAt: Date;
  /** Astro snapshot version the forecast was generated against. */
  natalVersion: number;
}

/** `@db.Date` column value for a civil day (UTC midnight, date-only). */
function periodStartValue(d: CivilDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

function serialize(row: {
  bodyMd: string;
  modelName: string | null;
  contentVersion: string | null;
  createdAt: Date;
  natalVersion: number;
}): StoredForecast {
  return {
    bodyMd: row.bodyMd,
    modelName: row.modelName,
    contentVersion: row.contentVersion,
    createdAt: row.createdAt,
    natalVersion: row.natalVersion,
  };
}

export async function getForecast(
  profileId: number,
  mode: ForecastMode,
  kind: ForecastKind,
  periodStart: CivilDate,
): Promise<StoredForecast | null> {
  const row = await prisma.forecast.findUnique({
    where: {
      profileId_mode_kind_periodStart: {
        profileId,
        mode,
        kind,
        periodStart: periodStartValue(periodStart),
      },
    },
  });
  return row ? serialize(row) : null;
}

/** Throws Prisma P2002 upward on a concurrent create — callers map it to 409. */
export async function createForecast(args: {
  profileId: number;
  mode: ForecastMode;
  kind: ForecastKind;
  periodStart: CivilDate;
  natalVersion: number;
  bodyMd: string;
  modelName: string;
  contentVersion: string;
}): Promise<StoredForecast> {
  const row = await prisma.forecast.create({
    data: {
      profileId: args.profileId,
      mode: args.mode,
      kind: args.kind,
      periodStart: periodStartValue(args.periodStart),
      natalVersion: args.natalVersion,
      bodyMd: args.bodyMd,
      modelName: args.modelName,
      contentVersion: args.contentVersion,
    },
  });
  return serialize(row);
}

/** False when no row existed (maps to 404). */
export async function deleteForecast(
  profileId: number,
  mode: ForecastMode,
  kind: ForecastKind,
  periodStart: CivilDate,
): Promise<boolean> {
  try {
    await prisma.forecast.delete({
      where: {
        profileId_mode_kind_periodStart: {
          profileId,
          mode,
          kind,
          periodStart: periodStartValue(periodStart),
        },
      },
    });
    return true;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return false;
    }
    throw e;
  }
}

/** The profile's latest natal chart — same read as lib/transits.ts
 *  getTransitView (forecasts always run against the current chart). */
export async function getLatestNatal(
  profileId: number,
): Promise<{ chart: WheelChart; version: number } | null> {
  const snapshot = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return null;
  const chart: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return { chart, version: snapshot.version };
}
