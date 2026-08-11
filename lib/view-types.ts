import type { Aspect, ChartSnapshot } from "@astralsync/astro-core";
import type { ProfileView } from "./snapshots";
import type { TzWarning } from "./tz";

/**
 * View-side shapes for the stored snapshot JSON. The DB splits the chart
 * across two columns — `placementsJson` (the ChartSnapshot minus aspects,
 * plus tz warnings) and `aspectsJson` — so the UI recombines them here.
 * Type-only imports keep this module client-safe.
 */

export type StoredChart = Omit<ChartSnapshot, "aspects"> & {
  tzWarnings: TzWarning[];
};

export type WheelChart = StoredChart & { aspects: Aspect[] };

export type AstroView = ProfileView["astro"];
export type NumeroView = ProfileView["numero"];
export type ProfileData = ProfileView["profile"];

export function toWheelChart(astro: AstroView): WheelChart {
  const chart = astro.chart as unknown as StoredChart;
  const aspects = (astro.aspects as unknown as Aspect[]) ?? [];
  return { ...chart, aspects };
}
