import {
  DEFAULT_ORBS,
  compositeChart,
  detectAngleAspects,
  detectCrossAspects,
  overlayHouses,
  type AngleAspect,
  type Aspect,
  type CrossAspect,
  type Placement,
} from "@astralsync/astro-core";
import { getEntry, natalAspectKey, type ContentEntry, type ContentIndex } from "./content";
import { prisma } from "./db";
import type { StoredChart, WheelChart } from "./view-types";

/**
 * Synastry — an ephemeral read over two write-once snapshots. Like transits
 * (PRD §9), nothing here is ever persisted: the comparison is a deterministic
 * recompute from two immutable natal charts, so the write-once guard in
 * lib/db.ts is untouched. Unlike transits, both sides come from storage —
 * no live ephemeris call is involved.
 */

export interface SynastrySide {
  profileId: number;
  displayName: string;
  /** Snapshot version used (always the profile's latest). */
  version: number;
  isSolarChart: boolean;
  /** True when the stored snapshot flags moon_sign uncertainty. */
  moonUncertain: boolean;
  chart: WheelChart;
  /** This side's placements housed by the OTHER side's cusps; every entry
   *  has house null when the other side is solar. */
  overlayPlacements: Placement[];
}

/** Planet-to-angle contacts, both directions. Read-time like the aspects;
 *  a solar side has no angles, so its list is empty. */
export interface SynastryAngleContacts {
  /** A's planets on B's ASC/MC, sorted by orb. */
  aOnB: AngleAspect[];
  /** B's planets on A's ASC/MC, sorted by orb. */
  bOnA: AngleAspect[];
}

export interface SynastryData {
  a: SynastrySide;
  b: SynastrySide;
  /** `a` = person A's planet, `b` = person B's planet (person A is the
   *  inner wheel); sorted by orb ascending (tightest first). */
  aspects: CrossAspect[];
  angleContacts: SynastryAngleContacts;
  /** Midpoint composite — the relationship's own chart. */
  composite: CompositeView;
}

export interface CompositeView {
  /** Synthetic stored-chart shape so the standard wheel renders it. No
   *  houses (midpoint-Ascendant conventions are contested; either side may
   *  be solar) and placeholder input — a composite has no birth moment. */
  chart: WheelChart;
  /** True when either side's Moon sign is uncertain — midpoints inherit it. */
  moonUncertain: boolean;
  /** True when either natal chart is solar (noon-estimate positions). */
  eitherSolar: boolean;
}

export interface SynastryInputSide {
  profileId: number;
  displayName: string;
  version: number;
  chart: WheelChart;
}

/** Stored placements carry their own natal houses, and overlayHouses returns
 *  its input unchanged on null cusps — strip first so a solar `other` yields
 *  house null instead of silently leaking `side`'s own houses. */
function inOthersHouses(side: WheelChart, other: WheelChart): Placement[] {
  return overlayHouses(
    side.placements.map((p) => ({ ...p, house: null })),
    other.houses?.cusps ?? null,
  );
}

function toSide(input: SynastryInputSide, other: WheelChart): SynastrySide {
  return {
    profileId: input.profileId,
    displayName: input.displayName,
    version: input.version,
    isSolarChart: input.chart.isSolarChart,
    moonUncertain: input.chart.uncertainties.some(
      (u) => u.field === "moon_sign",
    ),
    chart: input.chart,
    overlayPlacements: inOthersHouses(input.chart, other),
  };
}

/** Pure: two natal charts → the relationship's midpoint composite, wrapped
 *  in a stored-chart shape the standard wheel component can render. */
export function computeComposite(
  a: WheelChart,
  b: WheelChart,
): CompositeView {
  const { placements, aspects } = compositeChart(a.placements, b.placements);
  const sun = placements.find((p) => p.planet === "sun")!;
  const moon = placements.find((p) => p.planet === "moon")!;
  const moonUncertain = [a, b].some((c) =>
    c.uncertainties.some((u) => u.field === "moon_sign"),
  );
  return {
    chart: {
      schemaVersion: 1,
      // Epoch placeholders: a midpoint composite has no moment or place.
      input: {
        utc: new Date(0).toISOString(),
        latitude: 0,
        longitude: 0,
        houseSystem: a.input.houseSystem,
        timeCertainty: "exact",
      },
      isSolarChart: false,
      houses: null,
      placements,
      aspects,
      bigThree: { sun: sun.sign, moon: moon.sign, ascendant: null },
      uncertainties: [],
      engine: a.engine,
      tzWarnings: [],
    },
    moonUncertain,
    eitherSolar: a.isSolarChart || b.isSolarChart,
  };
}

/** Pure: two natal charts → synastry view. Natal orbs (8° luminaries / 6°),
 *  not the tighter transit orbs — synastry reads like a natal comparison. */
export function computeSynastry(
  a: SynastryInputSide,
  b: SynastryInputSide,
): SynastryData {
  const aspects = detectCrossAspects(
    a.chart.placements,
    b.chart.placements,
    DEFAULT_ORBS,
  ).sort((x, y) => x.orb - y.orb);
  const byOrb = (list: AngleAspect[]) => list.sort((x, y) => x.orb - y.orb);
  const angleContacts: SynastryAngleContacts = {
    aOnB: b.chart.houses
      ? byOrb(detectAngleAspects(a.chart.placements, b.chart.houses, DEFAULT_ORBS))
      : [],
    bOnA: a.chart.houses
      ? byOrb(detectAngleAspects(b.chart.placements, a.chart.houses, DEFAULT_ORBS))
      : [],
  };
  return {
    a: toSide(a, b.chart),
    b: toSide(b, a.chart),
    aspects,
    angleContacts,
    composite: computeComposite(a.chart, b.chart),
  };
}

// synastryAspectKey moved to lib/contentKeys.ts (client-safe, no Prisma);
// re-exported here so existing server-side imports keep working.
import {
  natalAngleAspectKey,
  synastryAngleAspectKey,
  synastryAspectKey,
} from "./contentKeys";
export { synastryAspectKey };

/** The canonical stored order for a profile pair: smaller id first, so
 *  (a, b) and (b, a) share one synastry-reading slot. */
export function normalizePair(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/**
 * Library entries for the tightest cross-aspects (deduped): the authored
 * `synastry_aspect` entry when it exists, else the natal `aspect` archetype
 * — the same degradation path the synastry page uses for per-row prose.
 * Feeds the AI synastry reading prompt.
 */
export function resolveSynastryEntries(
  aspects: CrossAspect[],
  index: ContentIndex,
  limit = 12,
): ContentEntry[] {
  const entries: ContentEntry[] = [];
  const seen = new Set<string>();
  for (const c of aspects.slice(0, limit)) {
    const entry =
      getEntry(index, synastryAspectKey(c.a, c.b, c.type)) ??
      getEntry(index, natalAspectKey(c.a, c.b, c.type));
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    entries.push(entry);
  }
  return entries;
}

/**
 * Library entries for the tightest angle contacts across both directions
 * (deduped): the authored `synastry_angle_aspect` entry when it exists, else
 * the natal `angle_aspect` archetype — the same chain the synastry page uses
 * for per-row prose. Feeds the AI synastry reading prompt.
 */
export function resolveSynastryAngleEntries(
  contacts: SynastryAngleContacts,
  index: ContentIndex,
  limit = 4,
): ContentEntry[] {
  const entries: ContentEntry[] = [];
  const seen = new Set<string>();
  const tightest = [...contacts.aOnB, ...contacts.bOnA].sort(
    (x, y) => x.orb - y.orb,
  );
  for (const c of tightest.slice(0, limit)) {
    const entry =
      getEntry(index, synastryAngleAspectKey(c.planet, c.target, c.type)) ??
      getEntry(index, natalAngleAspectKey(c.planet, c.target, c.type));
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    entries.push(entry);
  }
  return entries;
}

export interface StoredSynastryReading {
  bodyMd: string;
  modelName: string | null;
  contentVersion: string | null;
  createdAt: Date;
  aVersion: number;
  bVersion: number;
}

/** The stored AI reading for a pair (order-insensitive), or null. */
export async function getSynastryReading(
  aId: number,
  bId: number,
): Promise<StoredSynastryReading | null> {
  const [pairA, pairB] = normalizePair(aId, bId);
  const row = await prisma.synastryReading.findUnique({
    where: { profileAId_profileBId: { profileAId: pairA, profileBId: pairB } },
  });
  if (!row) return null;
  return {
    bodyMd: row.bodyMd,
    modelName: row.modelName,
    contentVersion: row.contentVersion,
    createdAt: row.createdAt,
    aVersion: row.aVersion,
    bVersion: row.bVersion,
  };
}

async function loadSide(profileId: number): Promise<SynastryInputSide | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      astroSnapshots: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  const snapshot = profile?.astroSnapshots[0];
  if (!profile || !snapshot) return null;
  const chart: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return {
    profileId: profile.id,
    displayName: profile.displayName,
    version: snapshot.version,
    chart,
  };
}

/** Ephemeral read comparing two profiles' latest natal snapshots. Null when
 *  either profile (or its snapshot) is missing. */
export async function getSynastryView(
  aId: number,
  bId: number,
): Promise<SynastryData | null> {
  const [a, b] = await Promise.all([loadSide(aId), loadSide(bId)]);
  if (!a || !b) return null;
  return computeSynastry(a, b);
}
