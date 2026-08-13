import {
  DEFAULT_ORBS,
  PLANETS,
  compositeChart,
  detectCrossAspects,
  overlayHouses,
  type Aspect,
  type AspectType,
  type CrossAspect,
  type Placement,
  type Planet,
} from "@astralsync/astro-core";
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

export interface SynastryData {
  a: SynastrySide;
  b: SynastrySide;
  /** `a` = person A's planet, `b` = person B's planet (person A is the
   *  inner wheel); sorted by orb ascending (tightest first). */
  aspects: CrossAspect[];
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
  return {
    a: toSide(a, b.chart),
    b: toSide(b, a.chart),
    aspects,
    composite: computeComposite(a.chart, b.chart),
  };
}

/** Canonical synastry_aspect content key: the pair is ordered by PLANETS
 *  index, matching the Tier 2 aspect-key convention. Keys use slash segments
 *  (keyFromPath turns filename hyphens into slashes), so the entry authored
 *  as `synastry_aspect/sun-mars-square.md` resolves to this key. */
export function synastryAspectKey(
  a: Planet,
  b: Planet,
  type: AspectType,
): string {
  const [first, second] =
    PLANETS.indexOf(a) <= PLANETS.indexOf(b) ? [a, b] : [b, a];
  return `synastry_aspect/${first}/${second}/${type}`;
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
