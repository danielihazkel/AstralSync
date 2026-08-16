import {
  ALL_ASPECTS,
  DEFAULT_TRANSIT_ORBS,
  MAJOR_ASPECTS,
  PLANETS,
  astronomyEngineProvider,
  detectAngleAspects,
  detectCrossAspects,
  isApplying,
  overlayHouses,
  positionsAt,
  type AngleAspect,
  type Aspect,
  type CrossAspect,
  type OrbConfig,
  type Placement,
  type Planet,
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

/** A cross-chart aspect with its motion verdict — the natal side is static,
 *  so applying is purely the transiting body's doing. Ephemeral, like every
 *  transit read; the journal's stored EntrySky keeps the plain shape. */
export type MovingCrossAspect = CrossAspect & { applying: boolean };
export type MovingAngleAspect = AngleAspect & { applying: boolean };

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
  crossAspects: MovingCrossAspect[];
  /** Transiting planets vs the natal ASC/MC (majors, default orb), sorted
   *  by orb; empty on a solar chart. */
  angleAspects: MovingAngleAspect[];
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
  const orbs = options.orbs ?? DEFAULT_TRANSIT_ORBS;
  // Applying/separating: the natal side is static (speed 0), so one speed
  // sample per transiting planet decides every verdict.
  const speed = new Map<Planet, number>(
    PLANETS.map((p) => [p, astronomyEngineProvider.longitudeSpeed(p, at)]),
  );
  const lonTransit = new Map<Planet, number>(
    placements.map((p) => [p.planet, p.longitude]),
  );
  const lonNatal = new Map<Planet, number>(
    natal.placements.map((p) => [p.planet, p.longitude]),
  );
  const crossAspects = detectCrossAspects(
    placements,
    natal.placements,
    orbs,
    options.includeMinors ? ALL_ASPECTS : MAJOR_ASPECTS,
  )
    .sort((x, y) => x.orb - y.orb)
    .map((c) => ({
      ...c,
      applying: isApplying(
        lonTransit.get(c.a) ?? 0,
        speed.get(c.a) ?? 0,
        lonNatal.get(c.b) ?? 0,
        0,
        c.angle,
      ),
    }));
  const angleAspects = (
    natal.houses ? detectAngleAspects(placements, natal.houses, orbs) : []
  )
    .sort((x, y) => x.orb - y.orb)
    .map((a) => ({
      ...a,
      applying: isApplying(
        lonTransit.get(a.planet) ?? 0,
        speed.get(a.planet) ?? 0,
        a.target === "mc" ? natal.houses!.mc : natal.houses!.ascendant,
        0,
        a.angle,
      ),
    }));
  return {
    computedAt: at.toISOString(),
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    placements,
    crossAspects,
    angleAspects,
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
