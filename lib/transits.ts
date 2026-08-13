import {
  ALL_ASPECTS,
  DEFAULT_TRANSIT_ORBS,
  MAJOR_ASPECTS,
  astronomyEngineProvider,
  detectCrossAspects,
  overlayHouses,
  positionsAt,
  type Aspect,
  type CrossAspect,
  type OrbConfig,
  type Placement,
} from "@astralsync/astro-core";
import { prisma } from "./db";
import type { TransitQuery } from "./validation";
import type { StoredChart, WheelChart } from "./view-types";

/**
 * Daily transits — the PRD §9 exception to "compute once, read forever".
 * Transits are recomputed from the immutable latest natal snapshot on every
 * read and are NEVER persisted; the write-once guard in lib/db.ts is
 * untouched because nothing here writes at all.
 */

export interface TransitData {
  /** ISO instant the positions were computed for (the `at` param or now). */
  computedAt: string;
  natal: {
    version: number;
    isSolarChart: boolean;
    /** True when the stored snapshot flags moon_sign uncertainty. */
    moonUncertain: boolean;
  };
  /** Transiting placements; `house` is the natal-house overlay, null when
   *  the natal chart is solar. */
  placements: Placement[];
  /** Transiting (a) vs natal (b), sorted by orb ascending (tightest first). */
  crossAspects: CrossAspect[];
  engine: { name: string; version: string };
}

/** Per-read orb/minor overrides from the browser's settings; defaults keep
 *  the historical behavior (DEFAULT_TRANSIT_ORBS, majors only). */
export interface TransitOptions {
  orbs?: OrbConfig;
  includeMinors?: boolean;
}

/** Options from a validated transit/cycles query — shared by both routes.
 *  Any single orb param falls back per-field to the transit defaults. */
export function transitOptionsFromQuery(q: TransitQuery): TransitOptions {
  const hasOrbs =
    q.luminaryOrb !== undefined ||
    q.defaultOrb !== undefined ||
    q.minorOrb !== undefined;
  return {
    orbs: hasOrbs
      ? {
          luminary: q.luminaryOrb ?? DEFAULT_TRANSIT_ORBS.luminary,
          default: q.defaultOrb ?? DEFAULT_TRANSIT_ORBS.default,
          minor: q.minorOrb ?? 2,
        }
      : undefined,
    includeMinors: q.minors === "1",
  };
}

/** Pure: natal chart + instant → transit view. */
export function computeTransits(
  natal: WheelChart,
  natalVersion: number,
  at: Date,
  options: TransitOptions = {},
): TransitData {
  const raw = positionsAt(at);
  const placements = overlayHouses(raw, natal.houses?.cusps ?? null);
  const crossAspects = detectCrossAspects(
    placements,
    natal.placements,
    options.orbs ?? DEFAULT_TRANSIT_ORBS,
    options.includeMinors ? ALL_ASPECTS : MAJOR_ASPECTS,
  ).sort((x, y) => x.orb - y.orb);
  return {
    computedAt: at.toISOString(),
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    placements,
    crossAspects,
    engine: {
      name: astronomyEngineProvider.name,
      version: astronomyEngineProvider.version,
    },
  };
}

/** Ephemeral read against the profile's latest natal snapshot (transits are
 *  "today vs. your current chart"; historical versions are not consulted).
 *  Null when the profile has no snapshot. */
export async function getTransitView(
  profileId: number,
  at?: Date,
  options?: TransitOptions,
): Promise<TransitData | null> {
  const snapshot = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return null;
  const natal: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return computeTransits(natal, snapshot.version, at ?? new Date(), options);
}
